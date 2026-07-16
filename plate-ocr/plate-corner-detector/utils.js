/**
 * PCDUtils — Plate Corner Detector 共用工具
 * 純運算工具，不依賴 DOM 渲染邏輯（matToCanvas 僅建立離屏 canvas 供除錯輸出）。
 * 依賴：全域 cv (OpenCV.js)
 */
(function (global) {
  'use strict';

  /** 兩點歐氏距離 */
  function distance(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Shoelace 多邊形面積 */
  function polygonArea(points) {
    var area = 0;
    for (var i = 0; i < points.length; i++) {
      var j = (i + 1) % points.length;
      area += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * 將 4 點排序為 [左上, 右上, 右下, 左下]
   * 方法：以質心 atan2 角度排序（順時針），再旋轉使起點為 x+y 最小者。
   */
  function orderCorners(points) {
    if (!points || points.length !== 4) {
      throw new Error('orderCorners requires exactly 4 points');
    }
    var cx = 0, cy = 0;
    points.forEach(function (p) { cx += p.x; cy += p.y; });
    cx /= 4; cy /= 4;

    var sorted = points.slice().sort(function (a, b) {
      return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
    });

    // 找 x+y 最小者作為左上起點
    var startIdx = 0, minSum = Infinity;
    sorted.forEach(function (p, i) {
      var s = p.x + p.y;
      if (s < minSum) { minSum = s; startIdx = i; }
    });
    var ordered = sorted.slice(startIdx).concat(sorted.slice(0, startIdx));

    // atan2 升冪排序即為順時針（影像座標 y 向下），確認第二點在右側，否則反轉
    if (ordered[1].x < ordered[3].x) {
      ordered = [ordered[0], ordered[3], ordered[2], ordered[1]];
    }
    return ordered;
  }

  /**
   * 統一輸入轉 cv.Mat。
   * @returns {{mat: cv.Mat, owned: boolean}} owned=true 表示呼叫端用畢需 delete
   */
  function toMat(input) {
    if (input instanceof cv.Mat) {
      return { mat: input, owned: false };
    }
    // HTMLImageElement / HTMLCanvasElement
    return { mat: cv.imread(input), owned: true };
  }

  /** cv.Mat 轉離屏 canvas（供 debug 步驟輸出） */
  function matToCanvas(mat) {
    var canvas = document.createElement('canvas');
    cv.imshow(canvas, mat);
    return canvas;
  }

  /**
   * 從二值化影像中尋找最像車牌的四邊形。
   * 兩策略（classic / fallback）共用的後半段流程。
   *
   * @param {cv.Mat} binaryMat  二值/邊緣影像（CV_8UC1）
   * @param {{width:number,height:number}} srcSize 原圖尺寸
   * @param {Object} opts { aspectRatioRange:[min,max], minAreaRatio:number }
   * @returns {{corners:Array|null, confidence:number, contourVis:cv.Mat|null}}
   *          contourVis 僅在 opts.debug 時提供（呼叫端負責 delete）
   */
  function findPlateQuad(binaryMat, srcSize, opts) {
    var aspectRange = opts.aspectRatioRange || [1.8, 3.2];
    var minAreaRatio = (typeof opts.minAreaRatio === 'number') ? opts.minAreaRatio : 0.005;
    var imgArea = srcSize.width * srcSize.height;
    var idealAspect = (aspectRange[0] + aspectRange[1]) / 2;

    var contours = new cv.MatVector();
    var hierarchy = new cv.Mat();
    cv.findContours(binaryMat, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    var best = null; // {corners, area, aspect, rectangularity}
    for (var i = 0; i < contours.size(); i++) {
      var cnt = contours.get(i);
      var area = cv.contourArea(cnt);
      if (area < imgArea * minAreaRatio) { cnt.delete(); continue; }

      var peri = cv.arcLength(cnt, true);
      var quad = null;
      // 嘗試多個逼近容差（2% ~ 5%），找到 4 頂點凸多邊形即停
      var epsFactors = [0.02, 0.03, 0.04, 0.05];
      for (var e = 0; e < epsFactors.length; e++) {
        var approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, epsFactors[e] * peri, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          quad = [];
          for (var r = 0; r < 4; r++) {
            quad.push({ x: approx.data32S[r * 2], y: approx.data32S[r * 2 + 1] });
          }
          approx.delete();
          break;
        }
        approx.delete();
      }
      if (!quad) { cnt.delete(); continue; }

      // 長寬比檢查（用 minAreaRect 抗傾斜）
      var rect = cv.minAreaRect(cnt);
      var w = rect.size.width, h = rect.size.height;
      var aspect = Math.max(w, h) / Math.max(1, Math.min(w, h));
      if (aspect < aspectRange[0] || aspect > aspectRange[1]) { cnt.delete(); continue; }

      var rectArea = Math.max(1, w * h);
      var rectangularity = Math.min(1, area / rectArea);

      if (!best || area > best.area) {
        best = { corners: quad, area: area, aspect: aspect, rectangularity: rectangularity };
      }
      cnt.delete();
    }
    contours.delete();
    hierarchy.delete();

    if (!best) {
      return { corners: null, confidence: 0 };
    }

    var areaScore = Math.min(1, best.area / (imgArea * 0.05));
    var aspectScore = 1 - Math.min(1, Math.abs(best.aspect - idealAspect) / idealAspect);
    var confidence = 0.4 * areaScore + 0.4 * aspectScore + 0.2 * best.rectangularity;

    return {
      corners: orderCorners(best.corners),
      confidence: confidence
    };
  }

  global.PCDUtils = {
    distance: distance,
    polygonArea: polygonArea,
    orderCorners: orderCorners,
    toMat: toMat,
    matToCanvas: matToCanvas,
    findPlateQuad: findPlateQuad
  };
})(typeof window !== 'undefined' ? window : this);
