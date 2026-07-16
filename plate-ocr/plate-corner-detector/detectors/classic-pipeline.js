/**
 * PCDClassicDetector — 策略A：Canny 邊緣 + 輪廓四邊形篩選
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
    var blurred = new cv.Mat();
    var edges = new cv.Mat();
    var closed = new cv.Mat();
    var otsuDummy = new cv.Mat();

    try {
      // 1. 灰階
      cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

      // 2. 高斯模糊去雜訊
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

      // 3. 以 Otsu 門檻推算 Canny 高低閾值（抗光源不均）
      var otsu = cv.threshold(blurred, otsuDummy, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      var high = otsu;
      var low = otsu * 0.5;

      // 4. Canny 邊緣
      cv.Canny(blurred, edges, low, high);

      // 5. 形態學閉運算閉合邊緣
      var kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
      kernel.delete();

      if (opts.debug) {
        debugSteps.push({ name: 'classic: 灰階', canvas: PCDUtils.matToCanvas(gray) });
        debugSteps.push({ name: 'classic: Canny (' + low.toFixed(0) + '/' + high.toFixed(0) + ')', canvas: PCDUtils.matToCanvas(edges) });
        debugSteps.push({ name: 'classic: 閉運算', canvas: PCDUtils.matToCanvas(closed) });
      }

      // 6~10. 共用四邊形搜尋（findContours 會修改輸入，複製一份）
      var work = closed.clone();
      var result = PCDUtils.findPlateQuad(work, srcSize, opts);
      work.delete();

      return { corners: result.corners, confidence: result.confidence, debugSteps: debugSteps };
    } finally {
      gray.delete();
      blurred.delete();
      edges.delete();
      closed.delete();
      otsuDummy.delete();
    }
  }

  global.PCDClassicDetector = detect;
})(typeof window !== 'undefined' ? window : this);
