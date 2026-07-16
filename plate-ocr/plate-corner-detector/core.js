/**
 * PlateCornerDetector — 車牌四角點偵測模組 統一公開 API
 *
 * 依賴（載入順序）：
 *   1. opencv.js (全域 cv)
 *   2. plate-corner-detector/utils.js          (PCDUtils)
 *   3. plate-corner-detector/detectors/classic-pipeline.js  (PCDClassicDetector)
 *   4. plate-corner-detector/detectors/contour-fallback.js  (PCDFallbackDetector)
 *   5. plate-corner-detector/detectors/edge-scan.js         (PCDEdgeScanDetector)
 *   6. 本檔 core.js
 *
 * 使用範例：
 *   var result = PlateCornerDetector.detect(imgElement, { strategy: 'auto', debug: true });
 *   if (result.success) console.log(result.corners); // [左上,右上,右下,左下]
 *
 * 擴充範例（插拔新策略，例如深度學習方案）：
 *   PlateCornerDetector.registerStrategy('my-dl', function(srcMat, opts) {
 *     return { corners: [...], confidence: 0.9, debugSteps: [] };
 *   });
 *   PlateCornerDetector.detect(img, { strategy: 'my-dl' });
 */
(function (global) {
  'use strict';

  var AUTO_CONFIDENCE_THRESHOLD = 0.5;

  var strategies = {
    classic: function (srcMat, opts) { return global.PCDClassicDetector(srcMat, opts); },
    fallback: function (srcMat, opts) { return global.PCDFallbackDetector(srcMat, opts); },
    'edge-scan': function (srcMat, opts) { return global.PCDEdgeScanDetector(srcMat, opts); }
  };

  var DEFAULT_OPTIONS = {
    strategy: 'auto',
    aspectRatioRange: [1.8, 3.2],
    minAreaRatio: 0.005,
    debug: false
  };

  /**
   * @param {HTMLImageElement|HTMLCanvasElement|cv.Mat} input
   * @param {Object} [options]
   * @returns {{success:boolean, corners:Array|null, confidence:number, strategyUsed:string, debugSteps?:Array}}
   */
  function detect(input, options) {
    var opts = Object.assign({}, DEFAULT_OPTIONS, options || {});
    var conv = global.PCDUtils.toMat(input);
    var srcMat = conv.mat;

    try {
      var outcome;
      if (opts.strategy === 'auto') {
        outcome = runAuto(srcMat, opts);
      } else {
        var fn = strategies[opts.strategy];
        if (!fn) {
          throw new Error('Unknown strategy: ' + opts.strategy +
            '. Available: ' + Object.keys(strategies).join(', ') + ', auto');
        }
        var r = fn(srcMat, opts);
        outcome = { result: r, strategyUsed: opts.strategy, debugSteps: r.debugSteps || [] };
      }

      var res = outcome.result;
      var payload = {
        success: !!(res.corners && res.corners.length === 4),
        corners: res.corners || null,
        confidence: res.confidence || 0,
        strategyUsed: outcome.strategyUsed
      };
      if (opts.debug) payload.debugSteps = outcome.debugSteps;
      return payload;
    } finally {
      if (conv.owned) srcMat.delete();
    }
  }

  /**
   * auto 模式：edge-scan（車牌特寫先驗）優先，信心不足時依序嘗試
   * classic、fallback，最後取信心最高的成功結果。
   */
  function runAuto(srcMat, opts) {
    var debugSteps = [];
    var order = ['edge-scan', 'classic', 'fallback'];
    var best = null, bestName = null;

    for (var i = 0; i < order.length; i++) {
      var name = order[i];
      var res = strategies[name](srcMat, opts);
      debugSteps = debugSteps.concat(res.debugSteps || []);

      if (res.corners && (!best || res.confidence > best.confidence)) {
        best = res;
        bestName = name;
      }
      // 高信心即早停
      if (res.corners && res.confidence >= AUTO_CONFIDENCE_THRESHOLD) {
        return { result: res, strategyUsed: name, debugSteps: debugSteps };
      }
    }

    if (best) {
      return { result: best, strategyUsed: bestName, debugSteps: debugSteps };
    }
    // 全部失敗：回傳最後一個（空）結果
    return {
      result: { corners: null, confidence: 0 },
      strategyUsed: 'auto',
      debugSteps: debugSteps
    };
  }

  /**
   * 註冊自訂策略。
   * @param {string} name 策略名稱（不可為 'auto'）
   * @param {function(cv.Mat, Object): {corners:Array|null, confidence:number, debugSteps:Array}} detectorFn
   */
  function registerStrategy(name, detectorFn) {
    if (name === 'auto') throw new Error("'auto' is a reserved strategy name");
    if (typeof detectorFn !== 'function') throw new Error('detectorFn must be a function');
    strategies[name] = detectorFn;
  }

  global.PlateCornerDetector = {
    detect: detect,
    registerStrategy: registerStrategy
  };
})(typeof window !== 'undefined' ? window : this);
