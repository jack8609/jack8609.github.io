/**
 * PCDEdgeScanDetector — 策略C：邊界掃描（edge-scan）
 * 適用場景：車牌特寫影像（車牌幾乎佔滿整張圖、邊框接近影像邊界）。
 * 此類輸入下 classic/fallback 的 findContours 難以取得封閉外框輪廓，
 * 本策略改用「從影像四邊向內做斜率掃描找邊緣密度峰值 → 直線擬合 → 求交點」直接定位四角。
 *
 * 流程：
 *   1. 灰階 + 高斯模糊 + Otsu 推算閾值的 Canny 邊緣
 *   2. 對上/下/左/右四側，在靠近該側的帶狀區域內做「斜率掃描」：
 *      對每個（截距, 斜率 tanθ ∈ [-0.3, 0.3]）組合，沿斜線積分邊緣密度，
 *      取聯合峰值作為該側邊框線初值。
 *      （傾斜邊框的邊緣沿斜線積分密度高；文字筆劃短、沿全寬斜線積分密度低，自然被排除）
 *   3. 在初值線鄰域內收集邊緣點，以最小平方法擬合直線精修
 *      （上/下邊：y = a·x + b；左/右邊：x = a·y + b）
 *   4. 四線兩兩求交點得四角，並依 [左上,右上,右下,左下] 排序
 *   5. confidence = 密度 + 覆蓋率，再以擬合殘差 RMS 懲罰
 *      （真實邊線殘差 <1~2px；雜訊擬合殘差大 → 信心大幅下降）
 *
 * 依賴：全域 cv (OpenCV.js)、PCDUtils
 *
 * @param {cv.Mat} srcMat 來源影像（RGBA，唯讀，不得 delete）
 * @param {Object} opts { scanBandRatio, fitBandRatio, slopeMax, slopeSteps, rmsK, debug }
 * @returns {{corners:Array|null, confidence:number, debugSteps:Array}}
 */
(function (global) {
  'use strict';

  var DEFAULTS = {
    scanBandRatio: 0.25,  // 各側帶狀搜尋範圍（相對圖寬/高）
    fitBandRatio: 0.04,   // 直線擬合鄰域半徑（相對短邊）
    centerSpanLow: 0.2,   // 密度統計/擬合的中央區間下限
    centerSpanHigh: 0.8,  // 密度統計/擬合的中央區間上限
    slopeMax: 0.3,        // 斜率掃描範圍 tanθ ∈ [-slopeMax, slopeMax]
    slopeSteps: 13,       // 斜率掃描檔數（奇數，含 0）
    rmsK: 1.5,            // 殘差信心懲罰係數：confidence *= exp(-rms/rmsK)
    depthPenalty: 0.5     // 位置先驗：峰值分數隨深入影像內部線性衰減的強度
  };

  function detect(srcMat, opts) {
    opts = opts || {};
    var debugSteps = [];
    var scanBandRatio = (typeof opts.scanBandRatio === 'number') ? opts.scanBandRatio : DEFAULTS.scanBandRatio;
    var fitBandRatio = (typeof opts.fitBandRatio === 'number') ? opts.fitBandRatio : DEFAULTS.fitBandRatio;
    var slopeMax = (typeof opts.slopeMax === 'number') ? opts.slopeMax : DEFAULTS.slopeMax;
    var slopeSteps = (typeof opts.slopeSteps === 'number') ? opts.slopeSteps : DEFAULTS.slopeSteps;
    var rmsK = (typeof opts.rmsK === 'number') ? opts.rmsK : DEFAULTS.rmsK;
    var depthPenalty = (typeof opts.depthPenalty === 'number') ? opts.depthPenalty : DEFAULTS.depthPenalty;

    var gray = new cv.Mat();
    var blurred = new cv.Mat();
    var edges = new cv.Mat();
    var otsuDummy = new cv.Mat();

    try {
      cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(3, 3), 0);
      var otsu = cv.threshold(blurred, otsuDummy, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      cv.Canny(blurred, edges, otsu * 0.5, otsu);

      if (opts.debug) {
        debugSteps.push({ name: 'edge-scan: Canny', canvas: PCDUtils.matToCanvas(edges) });
      }

      var W = edges.cols, H = edges.rows;
      var data = edges.data; // CV_8UC1 連續記憶體

      function at(x, y) { return data[y * W + x]; }

      var bandX = Math.max(3, Math.round(W * scanBandRatio));
      var bandY = Math.max(3, Math.round(H * scanBandRatio));
      var x0 = Math.round(W * DEFAULTS.centerSpanLow), x1 = Math.round(W * DEFAULTS.centerSpanHigh);
      var y0 = Math.round(H * DEFAULTS.centerSpanLow), y1 = Math.round(H * DEFAULTS.centerSpanHigh);

      // 斜率候選（tanθ），含 0
      var slopes = [];
      var half = Math.floor(slopeSteps / 2);
      for (var s = -half; s <= half; s++) {
        slopes.push(slopeMax * s / Math.max(1, half));
      }

      // 斜線密度：水平側，線為 y = yc + a·(x - cx)，cx 為中央參考點
      var cxRef = (x0 + x1) / 2;
      var cyRef = (y0 + y1) / 2;

      function slantRowDensity(yc, a) {
        var c = 0, n = 0;
        for (var x = x0; x < x1; x++) {
          var y = Math.round(yc + a * (x - cxRef));
          if (y < 0 || y >= H) continue;
          n++;
          if (at(x, y)) c++;
        }
        return n > 0 ? c / n : 0;
      }
      function slantColDensity(xc, a) {
        var c = 0, n = 0;
        for (var y = y0; y < y1; y++) {
          var x = Math.round(xc + a * (y - cyRef));
          if (x < 0 || x >= W) continue;
          n++;
          if (at(x, y)) c++;
        }
        return n > 0 ? c / n : 0;
      }

      // 聯合峰值搜尋：對每個（截距位置, 斜率）組合取「加權分數」最大者。
      // 位置先驗：車牌特寫的邊框貼近影像邊界，越深入影像內部的峰
      // 越可能是內部文字筆劃 → score = density × (1 - depthPenalty·depth/band)
      function findSlantPeak(from, to, step, band, densityFn) {
        var best = -1, bestPos = from, bestSlope = 0, bestDensity = 0;
        var depth = 0;
        for (var pos = from; step > 0 ? pos < to : pos > to; pos += step, depth++) {
          var w = 1 - depthPenalty * depth / Math.max(1, band);
          for (var i = 0; i < slopes.length; i++) {
            var d = densityFn(pos, slopes[i]);
            var score = d * w;
            if (score > best) { best = score; bestPos = pos; bestSlope = slopes[i]; bestDensity = d; }
          }
        }
        return { pos: bestPos, slope: bestSlope, density: bestDensity };
      }

      var top = findSlantPeak(0, bandY, 1, bandY, slantRowDensity);
      var bottom = findSlantPeak(H - 1, H - 1 - bandY, -1, bandY, slantRowDensity);
      var left = findSlantPeak(0, bandX, 1, bandX, slantColDensity);
      var right = findSlantPeak(W - 1, W - 1 - bandX, -1, bandX, slantColDensity);

      var nb = Math.max(2, Math.round(Math.min(W, H) * fitBandRatio));

      // 在初值斜線 ±nb 帶內，對每個掃描位置取最靠近初值線的邊緣點，最小平方擬合直線
      function fitHorizontal(peak) {
        var us = [], vs = [];
        for (var x = x0; x < x1; x++) {
          var ycLine = peak.pos + peak.slope * (x - cxRef);
          var bestY = -1, bestD = Infinity;
          var yLo = Math.max(0, Math.round(ycLine) - nb), yHi = Math.min(H - 1, Math.round(ycLine) + nb);
          for (var y = yLo; y <= yHi; y++) {
            if (at(x, y)) {
              var d = Math.abs(y - ycLine);
              if (d < bestD) { bestD = d; bestY = y; }
            }
          }
          if (bestY >= 0) { us.push(x); vs.push(bestY); }
        }
        return lsq(us, vs); // v = a·u + b，即 y = a·x + b
      }
      function fitVertical(peak) {
        var us = [], vs = [];
        for (var y = y0; y < y1; y++) {
          var xcLine = peak.pos + peak.slope * (y - cyRef);
          var bestX = -1, bestD = Infinity;
          var xLo = Math.max(0, Math.round(xcLine) - nb), xHi = Math.min(W - 1, Math.round(xcLine) + nb);
          for (var x = xLo; x <= xHi; x++) {
            if (at(x, y)) {
              var d = Math.abs(x - xcLine);
              if (d < bestD) { bestD = d; bestX = x; }
            }
          }
          if (bestX >= 0) { us.push(y); vs.push(bestX); }
        }
        return lsq(us, vs); // v = a·u + b，即 x = a·y + b
      }
      function lsq(u, v) {
        var n = u.length;
        if (n < 2) return null;
        var su = 0, sv = 0, suu = 0, suv = 0;
        for (var i = 0; i < n; i++) {
          su += u[i]; sv += v[i];
          suu += u[i] * u[i]; suv += u[i] * v[i];
        }
        var denom = n * suu - su * su;
        if (Math.abs(denom) < 1e-9) return null;
        var a = (n * suv - su * sv) / denom;
        var b = (sv - a * su) / n;
        // 擬合殘差 RMS（垂直於掃描軸方向）
        var se = 0;
        for (var j = 0; j < n; j++) {
          var e = v[j] - (a * u[j] + b);
          se += e * e;
        }
        var rms = Math.sqrt(se / n);
        return { a: a, b: b, n: n, rms: rms };
      }

      var lt = fitHorizontal(top);
      var lb = fitHorizontal(bottom);
      var ll = fitVertical(left);
      var lr = fitVertical(right);

      if (!lt || !lb || !ll || !lr) {
        return { corners: null, confidence: 0, debugSteps: debugSteps };
      }

      // 交點：水平線 y = a1·x + b1 與 垂直線 x = a2·y + b2
      function crossHV(hl, vl) {
        var denom = 1 - hl.a * vl.a;
        if (Math.abs(denom) < 1e-9) return null;
        var y = (hl.a * vl.b + hl.b) / denom;
        var x = vl.a * y + vl.b;
        return { x: x, y: y };
      }

      var tl = crossHV(lt, ll), tr = crossHV(lt, lr), br = crossHV(lb, lr), bl = crossHV(lb, ll);
      if (!tl || !tr || !br || !bl) {
        return { corners: null, confidence: 0, debugSteps: debugSteps };
      }

      var corners = PCDUtils.orderCorners([tl, tr, br, bl]);

      // 基本合理性檢查：面積至少佔圖 20%（車牌特寫先驗），否則視為失敗
      var area = PCDUtils.polygonArea(corners);
      if (area < W * H * 0.2) {
        return { corners: null, confidence: 0, debugSteps: debugSteps };
      }

      // confidence：四側密度均值 + 擬合樣本覆蓋率，再以擬合殘差 RMS 懲罰
      var densityScore = (top.density + bottom.density + left.density + right.density) / 4;
      var coverage = Math.min(1,
        (lt.n / Math.max(1, x1 - x0) + lb.n / Math.max(1, x1 - x0) +
         ll.n / Math.max(1, y1 - y0) + lr.n / Math.max(1, y1 - y0)) / 4);
      var confidence = Math.min(1, 0.5 * Math.min(1, densityScore * 2.5) + 0.5 * coverage);

      // 殘差懲罰：真實邊線 rms < 1~2px 幾乎不減分，雜訊 rms 大 → 信心趨近 0
      var meanRms = (lt.rms + lb.rms + ll.rms + lr.rms) / 4;
      confidence *= Math.exp(-meanRms / rmsK);

      return { corners: corners, confidence: confidence, debugSteps: debugSteps };
    } finally {
      gray.delete();
      blurred.delete();
      edges.delete();
      otsuDummy.delete();
    }
  }

  global.PCDEdgeScanDetector = detect;
})(typeof window !== 'undefined' ? window : this);
