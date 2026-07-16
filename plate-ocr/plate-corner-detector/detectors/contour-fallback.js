/**
 * PCDFallbackDetector — 策略B：自適應二值化 + 形態學 備援策略
 * 用於策略A在低對比、光源不均場景失效時的補強。
 * 依賴：全域 cv (OpenCV.js)、PCDUtils
 *
 * @param {cv.Mat} srcMat 來源影像（RGBA，唯讀，不得 delete）
 * @param {Object} opts { aspectRatioRange, minAreaRatio, debug }
 * @returns {{corners:Array|null, confidence:number, debugSteps:Array}}
 */
(function (global) {
  'use strict';

  function detect(srcMat, opts) {
    opts = opts || {};
    var debugSteps = [];
    var srcSize = { width: srcMat.cols, height: srcMat.rows };

    var gray = new cv.Mat();
    var filtered = new cv.Mat();
    var binary = new cv.Mat();
    var closed = new cv.Mat();
    var dilated = new cv.Mat();

    try {
      // 1. 灰階
      cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

      // 2. 雙邊濾波：去雜訊但保留邊緣
      cv.bilateralFilter(gray, filtered, 9, 75, 75);

      // 3. 自適應二值化（抗局部光源不均）
      cv.adaptiveThreshold(
        filtered, binary, 255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV,
        25, 10
      );

      // 4. 閉運算 + 膨脹，讓車牌邊框連成封閉區域
      var kClose = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
      cv.morphologyEx(binary, closed, cv.MORPH_CLOSE, kClose);
      kClose.delete();

      var kDilate = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.dilate(closed, dilated, kDilate);
      kDilate.delete();

      if (opts.debug) {
        debugSteps.push({ name: 'fallback: 雙邊濾波', canvas: PCDUtils.matToCanvas(filtered) });
        debugSteps.push({ name: 'fallback: 自適應二值化', canvas: PCDUtils.matToCanvas(binary) });
        debugSteps.push({ name: 'fallback: 閉運算+膨脹', canvas: PCDUtils.matToCanvas(dilated) });
      }

      // 5. 共用四邊形搜尋
      var work = dilated.clone();
      var result = PCDUtils.findPlateQuad(work, srcSize, opts);
      work.delete();

      return { corners: result.corners, confidence: result.confidence, debugSteps: debugSteps };
    } finally {
      gray.delete();
      filtered.delete();
      binary.delete();
      closed.delete();
      dilated.delete();
    }
  }

  global.PCDFallbackDetector = detect;
})(typeof window !== 'undefined' ? window : this);
