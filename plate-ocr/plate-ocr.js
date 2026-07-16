"use strict";

/* =========================================================================
 * PlateOCR - 車牌校正與辨識核心模組（從 Tesseract POC 專案移植版）
 * 依賴：全域 window.cv (OpenCV.js, @techstark/opencv-js)、全域 Tesseract (Tesseract.js v5+)
 *       與先載入的全域 PlateCornerDetector
 * 用法：<script src="tesseract.min.js"></script>
 *       <script src="opencv.min.js" defer></script>
 *       <script src="plate-corner-detector/utils.js"></script>
 *       <script src="plate-corner-detector/detectors/classic-pipeline.js"></script>
 *       <script src="plate-corner-detector/detectors/contour-fallback.js"></script>
 *       <script src="plate-corner-detector/detectors/edge-scan.js"></script>
 *       <script src="plate-corner-detector/core.js"></script>
 *       <script src="plate-ocr.js" defer></script>
 *       然後呼叫 await PlateOCR.runPipeline(file[, canvases, onLog])
 * 調參：PlateOCR.CONF.xxx = ...（所有參數集中在此，不要在函式內寫魔法數字）
 * ========================================================================= */
const PlateOCR = (() => {

  /* CONF 刻意放在 IIFE 內部（而非模組頂層），避免污染全域命名空間；
   * 若要調整參數，透過 PlateOCR.CONF.xxx 存取。 */
  const CONF = {
    // 1. 3D 透視與梯度校正
    gaussianBlurKernel: [5, 5],      // 高斯模糊核心大小 (w, h)
    cannyThreshold1: 50,             // Canny 邊緣偵測門檻 1
    cannyThreshold2: 150,            // Canny 邊緣偵測門檻 2
    edgeDilateKernelSize: [3, 3],    // 邊緣膨脹核心大小（用來連接斷邊，利於找輪廓）
    edgeDilateIterations: 1,         // 邊緣膨脹迭代次數
    minContourAreaRatio: 0.1,        // 舊調參名稱，映射為 classic/fallback 的最小候選面積比例
    approxPolyEpsilonRatio: 0.035,   // approxPolyDP 的 epsilon = ratio * 輪廓周長（放寬以容忍圓角/螺絲缺口）
    fallbackInsetRatio: 0.015,       // 安全兜底：找不到 4 頂點時，原圖四角向內收縮比例（調低以避免切到較靠邊緣的字元）
    cornerDetectorStrategy: 'auto',  // PlateCornerDetector 策略：edge-scan → classic → fallback
    cornerDetectorAspectRatioRange: [1.8, 3.2], // classic/fallback 車牌長寬比篩選範圍
    cornerDetectorOptions: {},       // 額外傳給 PlateCornerDetector 的進階參數
    warpWidth: 440,                  // 透視校正目標寬度
    warpHeight: 140,                 // 透視校正目標高度

    // 2. 自動曝光度與對比度調整
    claheClipLimit: 2.0,             // CLAHE 對比限制
    claheTileGridSize: [8, 8],       // CLAHE 分塊網格大小

    // 3. 形態學處理
    morphKernelShape: 'MORPH_RECT',  // 結構元素形狀 (對應 cv.MORPH_RECT)
    morphKernelSize: [3, 3],         // 結構元素大小
    morphCloseIterations: 1,         // 閉運算迭代次數

    // 4. Tesseract OCR（整條辨識，供群組切割失敗時的 fallback 使用）
    tesseractLang: 'eng',
    tesseractWhitelist: '012356789ABCDEFGHJKLMNPQRSTUVWXYZ-',  // 台灣車牌沒有 4, I, O
    tesseractPSM: '7',               // SINGLE_LINE

    // 5. 群組切割（垂直投影）與雙重白名單辨識
    groupInkDensityThresholdRatio: 0.15, // 判斷某欄是否為「空白間隙」的墨水密度門檻（相對於該欄最大墨水密度）
    groupGapMinWidthRatio: 0.04,         // 候選間隙最小寬度（相對於 warpWidth）
    groupGapDominanceRatio: 1.4,         // 最寬間隙須至少是次寬間隙的此倍數，才視為群組間隙而非字元間隙
    groupMinSideWidthRatio: 0.15,        // 切割後左右兩側最小寬度（相對於 warpWidth），太窄視為切割失敗
    groupCropPaddingRatio: 0.02,         // 裁切子圖時左右各自保留的緩衝比例
    groupProjectionRowMarginRatio: 0.18, // 垂直投影計算時，排除上下各此比例的列（避開車牌外框線/螺絲孔造成的橫貫雜訊）
    tesseractDigitWhitelist: '012356789',  // 台灣車牌沒有 4, I, O
    tesseractAlphaWhitelist: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  };

  // ---- 0. Bootstrap：函式庫初始化 -----------------------------------------
  // opencv.min.js (@techstark/opencv-js) 的 window.cv 執行後可能是一個
  // 尚未 resolve 的 Promise，也可能是尚未 ready 的 Module 物件，
  // 兩種情況都必須等待完成後才能安全呼叫 cv.* API。
  async function ensureCvReady() {
    let m = window.cv;
    if (m instanceof Promise) {
      m = await m;
    } else if (!m.Mat) {
      await new Promise((resolve) => { m.onRuntimeInitialized = resolve; });
    }
    window.cv = m;
    return m;
  }

  // 使用 URL.createObjectURL + decode，確保拿到真實像素寬高後才交給 OpenCV。
  async function loadImageFromFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      if (img.decode) {
        await img.decode();
      } else {
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const mat = cv.imread(canvas);
      return { mat, width: canvas.width, height: canvas.height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---- 1. 四角偵測（PlateCornerDetector 相容層，含安全兜底） -----------------
  function detectPlateCorners(srcMat, width, height) {
    const detector = window.PlateCornerDetector;
    if (!detector || typeof detector.detect !== 'function') {
      throw new Error('PlateCornerDetector 尚未載入；請先依文件順序載入 plate-corner-detector。');
    }

    let detection;
    try {
      detection = detector.detect(srcMat, {
        ...CONF.cornerDetectorOptions,
        strategy: CONF.cornerDetectorStrategy,
        aspectRatioRange: CONF.cornerDetectorAspectRatioRange,
        minAreaRatio: CONF.minContourAreaRatio,
      });
    } catch (error) {
      detection = { success: false, corners: null };
    }

    let usedFallback = !detection.success;
    let ordered = detection.corners;
    if (usedFallback) {
      const insetX = width * CONF.fallbackInsetRatio;
      const insetY = height * CONF.fallbackInsetRatio;
      ordered = [
        { x: insetX, y: insetY },
        { x: width - insetX, y: insetY },
        { x: width - insetX, y: height - insetY },
        { x: insetX, y: height - insetY },
      ];
    }

    const orderedCorners = new Float32Array([
      ordered[0].x, ordered[0].y,
      ordered[1].x, ordered[1].y,
      ordered[2].x, ordered[2].y,
      ordered[3].x, ordered[3].y,
    ]);

    const overlayMat = srcMat.clone();
    const color = usedFallback ? new cv.Scalar(255, 140, 0, 255) : new cv.Scalar(0, 255, 0, 255);
    for (let i = 0; i < 4; i++) {
      const p1 = ordered[i];
      const p2 = ordered[(i + 1) % 4];
      cv.line(overlayMat, new cv.Point(p1.x, p1.y), new cv.Point(p2.x, p2.y), color, 3);
    }

    // 保持既有 edges canvas 輸出契約；此 Mat 僅供視覺化，不參與四角判定。
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    try {
      cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(
        gray, blurred,
        new cv.Size(CONF.gaussianBlurKernel[0], CONF.gaussianBlurKernel[1]),
        0
      );
      cv.Canny(blurred, edges, CONF.cannyThreshold1, CONF.cannyThreshold2);
    } finally {
      gray.delete();
      blurred.delete();
    }

    return { orderedCorners, overlayMat, edgesMat: edges, usedFallback };
  }

  // ---- 2. 透視變換 ----------------------------------------------------------
  function warpPlate(srcMat, orderedCorners) {
    // 強制包裝成 Float32Array，避免 WebAssembly 記憶體對齊錯誤。
    const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, orderedCorners);
    const dstCorners = new Float32Array([
      0, 0,
      CONF.warpWidth, 0,
      CONF.warpWidth, CONF.warpHeight,
      0, CONF.warpHeight,
    ]);
    const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, dstCorners);

    const M = cv.getPerspectiveTransform(srcTri, dstTri);
    const dst = new cv.Mat();
    cv.warpPerspective(
      srcMat, dst, M,
      new cv.Size(CONF.warpWidth, CONF.warpHeight),
      cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar()
    );

    srcTri.delete();
    dstTri.delete();
    M.delete();
    return dst;
  }

  // ---- 3. 自動曝光 / 對比強化 (CLAHE) ---------------------------------------
  function enhanceContrast(mat) {
    const gray = new cv.Mat();
    if (mat.channels() === 1) {
      mat.copyTo(gray);
    } else {
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
    }

    const clahe = new cv.CLAHE(
      CONF.claheClipLimit,
      new cv.Size(CONF.claheTileGridSize[0], CONF.claheTileGridSize[1])
    );
    const dst = new cv.Mat();
    clahe.apply(gray, dst);

    gray.delete();
    clahe.delete();
    return dst;
  }

  // ---- 4. 大津二值化 + 自動極性反轉（確保白底黑字） --------------------------
  function binarizeOtsuInverted(mat) {
    const dst = new cv.Mat();
    cv.threshold(mat, dst, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    // 取四角落像素平均亮度判斷背景極性，偏暗才反轉，避免固定假設造成誤判。
    const w = dst.cols, h = dst.rows;
    const margin = Math.max(2, Math.round(Math.min(w, h) * 0.05));
    const corners = [
      dst.ucharPtr(margin, margin)[0],
      dst.ucharPtr(margin, w - margin)[0],
      dst.ucharPtr(h - margin, margin)[0],
      dst.ucharPtr(h - margin, w - margin)[0],
    ];
    const avgCorner = corners.reduce((a, b) => a + b, 0) / corners.length;
    if (avgCorner < 60) {  // 原始128 強制手動改為 60, 未來需要最佳化這段演算法
      cv.bitwise_not(dst, dst);
    }
    return dst;
  }

  // ---- 5. 形態學閉運算（黏合斷筆畫） -----------------------------------------
  function morphologyClose(mat) {
    const kernel = cv.getStructuringElement(
      cv[CONF.morphKernelShape],
      new cv.Size(CONF.morphKernelSize[0], CONF.morphKernelSize[1])
    );
    const dst = new cv.Mat();
    cv.morphologyEx(mat, dst, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), CONF.morphCloseIterations);
    kernel.delete();
    return dst;
  }

  // ---- 6. 群組切割（垂直投影，找數字/英文群組間的空白間隙） -------------------
  // 輸入 morphologyClose 產出的最終二值化長條圖（白底黑字，單通道）。
  function splitPlateGroups(mat) {
    const w = mat.cols, h = mat.rows;
    const data = mat.data; // 單通道連續記憶體，逐列 y*w+x 存取

    // 只取圖片中段列數做投影，避開車牌外框線/螺絲孔（橫貫整張圖的雜訊，
    // 會讓每一欄都有墨水而抓不到真正的字元間隙）。
    const rowMargin = Math.round(h * CONF.groupProjectionRowMarginRatio);
    const rowStart = Math.min(rowMargin, Math.floor(h / 2) - 1);
    const rowEnd = Math.max(h - rowMargin, rowStart + 1);

    // 逐欄計算墨水密度（255 - 像素值 的加總；文字筆畫越多，值越大）
    const inkPerCol = new Float64Array(w);
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = rowStart; y < rowEnd; y++) {
        sum += 255 - data[y * w + x];
      }
      inkPerCol[x] = sum;
    }
    const maxInk = Math.max(...inkPerCol) || 1;
    const threshold = maxInk * CONF.groupInkDensityThresholdRatio;

    // 找出所有連續「低於門檻」的間隙區段 [start, end)
    const gaps = [];
    let gapStart = -1;
    for (let x = 0; x < w; x++) {
      const isGap = inkPerCol[x] < threshold;
      if (isGap && gapStart === -1) {
        gapStart = x;
      } else if (!isGap && gapStart !== -1) {
        gaps.push({ start: gapStart, end: x, width: x - gapStart });
        gapStart = -1;
      }
    }
    if (gapStart !== -1) gaps.push({ start: gapStart, end: w, width: w - gapStart });

    // 排除貼齊左右邊緣的間隙（那是留白邊界，不是群組間隙）
    const innerGaps = gaps.filter(g => g.start > 0 && g.end < w);
    innerGaps.sort((a, b) => b.width - a.width);

    const overlayMat = new cv.Mat();
    cv.cvtColor(mat, overlayMat, cv.COLOR_GRAY2RGBA);
    // 標示實際參與投影計算的列範圍（藍色橫線示意），方便除錯。
    cv.line(overlayMat, new cv.Point(0, rowStart), new cv.Point(w, rowStart), new cv.Scalar(0, 128, 255, 255), 1);
    cv.line(overlayMat, new cv.Point(0, rowEnd), new cv.Point(w, rowEnd), new cv.Scalar(0, 128, 255, 255), 1);

    const minGapWidth = w * CONF.groupGapMinWidthRatio;
    const widest = innerGaps[0];
    const secondWidest = innerGaps[1];

    let success = false;
    let reason = '';
    if (!widest) {
      reason = '找不到任何內部間隙';
    } else if (widest.width < minGapWidth) {
      reason = `最寬間隙寬度不足（${widest.width}px < ${minGapWidth.toFixed(1)}px）`;
    } else if (secondWidest && widest.width < secondWidest.width * CONF.groupGapDominanceRatio) {
      reason = '最寬間隙未明顯優於次寬間隙，可能只是字元間隙';
    } else {
      success = true;
    }

    let leftMat = null, rightMat = null, splitCol = -1;
    if (success) {
      splitCol = Math.round((widest.start + widest.end) / 2);
      const pad = Math.round(w * CONF.groupCropPaddingRatio);
      const leftEnd = Math.min(widest.start + pad, w);
      const rightStart = Math.max(widest.end - pad, 0);
      const minSideWidth = w * CONF.groupMinSideWidthRatio;

      if (leftEnd < minSideWidth || (w - rightStart) < minSideWidth) {
        success = false;
        reason = '切割後其中一側寬度過窄，判定不可靠';
      } else {
        leftMat = mat.roi(new cv.Rect(0, 0, leftEnd, h)).clone();
        rightMat = mat.roi(new cv.Rect(rightStart, 0, w - rightStart, h)).clone();
        cv.line(overlayMat, new cv.Point(splitCol, 0), new cv.Point(splitCol, h), new cv.Scalar(0, 255, 0, 255), 2);
        cv.rectangle(overlayMat, new cv.Point(0, 0), new cv.Point(leftEnd, h), new cv.Scalar(0, 255, 0, 255), 2);
        cv.rectangle(overlayMat, new cv.Point(rightStart, 0), new cv.Point(w, h), new cv.Scalar(0, 255, 0, 255), 2);
      }
    }

    if (!success) {
      // 視覺化所有候選間隙（橘色），方便除錯為何判定失敗
      for (const g of innerGaps.slice(0, 5)) {
        cv.rectangle(overlayMat, new cv.Point(g.start, 0), new cv.Point(g.end, h), new cv.Scalar(255, 140, 0, 255), 1);
      }
    }

    return { success, leftMat, rightMat, splitCol, overlayMat, reason };
  }

  // ---- 7. Tesseract 通用文字辨識（共用單一 worker，建立/銷毀交由呼叫端負責） ----
  async function recognizeText(worker, mat, whitelist, psm) {
    const canvas = document.createElement('canvas');
    cv.imshow(canvas, mat);

    await worker.setParameters({
      tessedit_char_whitelist: whitelist,
      tessedit_pageseg_mode: psm,
    });
    const { data } = await worker.recognize(canvas);
    return {
      text: (data && data.text) ? data.text : '',
      confidence: (data && typeof data.confidence === 'number') ? data.confidence : 0,
    };
  }

  // ---- 7a. 整條車牌辨識（完整白名單，供群組切割失敗時的 fallback 使用） --------
  async function recognizePlate(worker, mat) {
    const { text } = await recognizeText(worker, mat, CONF.tesseractWhitelist, CONF.tesseractPSM);
    return text;
  }

  // ---- 7b. 子圖分類辨識：各自套用數字/英文專屬白名單，信心較高者即為判定類型 ----
  async function classifyAndRecognizeGroup(worker, mat) {
    const digitResult = await recognizeText(worker, mat, CONF.tesseractDigitWhitelist, CONF.tesseractPSM);
    const alphaResult = await recognizeText(worker, mat, CONF.tesseractAlphaWhitelist, CONF.tesseractPSM);

    if (digitResult.confidence >= alphaResult.confidence) {
      return { type: 'digit', text: digitResult.text, confidence: digitResult.confidence };
    }
    return { type: 'alpha', text: alphaResult.text, confidence: alphaResult.confidence };
  }

  // ---- 8. 台灣車牌後處理：正規化清洗 + 連字號/英數智慧分群切割（fallback 專用） ---
  function postProcessPlateText(rawText) {
    const upper = (rawText || '').toUpperCase();
    const cleaned = upper.replace(/[^A-Z0-9-]/g, '');

    let left = '', right = '', mode = '';
    if (cleaned.includes('-')) {
      const parts = cleaned.split('-').filter(Boolean);
      left = parts[0] || '';
      right = parts[1] || '';
      mode = '情境 A：保留連字號切割';
    } else {
      const tokens = cleaned.match(/[A-Z]+|[0-9]+/g) || [];
      let alpha = '', digit = '', firstType = null;
      for (const tok of tokens) {
        if (/^[A-Z]+$/.test(tok)) {
          alpha += tok;
          firstType = firstType || 'A';
        } else {
          digit += tok;
          firstType = firstType || 'D';
        }
      }
      if (firstType === 'D') { left = digit; right = alpha; }
      else { left = alpha; right = digit; }
      mode = '情境 B：連字號消失，英數智慧分群切割';
    }
    return { cleaned, left, right, mode };
  }

  // ---- 9. 完整流程串接 -------------------------------------------------------
  // canvases 皆為選填：若某階段的 canvas 未提供，就跳過該階段的畫面顯示，
  // 方便只取用需要的部分（例如僅需最終辨識結果，完全不傳 canvases）。
  async function runPipeline(file, canvases = {}, onLog = () => {}) {
    await ensureCvReady();

    onLog('讀取圖片中...');
    const { mat: srcMat, width, height } = await loadImageFromFile(file);

    let warped, enhanced, binary, morphed, leftMat, rightMat, splitOverlay;
    const worker = await Tesseract.createWorker(CONF.tesseractLang);
    try {
      onLog('偵測車牌四角頂點...');
      const { orderedCorners, overlayMat, edgesMat, usedFallback } =
        detectPlateCorners(srcMat, width, height);
      if (usedFallback) {
        onLog('⚠️ 未偵測到有效 4 頂點，已切換為固定比例內縮兜底邏輯');
      }
      try {
        if (canvases.corners) cv.imshow(canvases.corners, overlayMat);
        if (canvases.edges) cv.imshow(canvases.edges, edgesMat);
      } finally {
        overlayMat.delete();
        edgesMat.delete();
      }

      onLog('執行透視校正 (Warp Perspective)...');
      warped = warpPlate(srcMat, orderedCorners);
      if (canvases.warp) cv.imshow(canvases.warp, warped);

      onLog('CLAHE 對比強化...');
      enhanced = enhanceContrast(warped);
      if (canvases.enhance) cv.imshow(canvases.enhance, enhanced);

      onLog('Otsu 二值化與極性反轉...');
      binary = binarizeOtsuInverted(enhanced);
      if (canvases.binary) cv.imshow(canvases.binary, binary);

      onLog('形態學閉運算...');
      morphed = morphologyClose(binary);
      if (canvases.morph) cv.imshow(canvases.morph, morphed);

      onLog('垂直投影群組切割...');
      const splitResult = splitPlateGroups(morphed);
      leftMat = splitResult.leftMat;
      rightMat = splitResult.rightMat;
      splitOverlay = splitResult.overlayMat;
      if (canvases.split) cv.imshow(canvases.split, splitOverlay);

      let rawText = '', result = null;
      if (splitResult.success) {
        onLog('切割成功，對左右子圖分別以數字/英文專屬白名單辨識...');
        // 注意：兩側必須「依序」呼叫，不可用 Promise.all 平行執行——
        // 兩者共用同一個 Tesseract worker，worker.setParameters() 是全域狀態，
        // 平行呼叫會讓兩側的白名單設定互相搶跑、造成辨識結果錯亂。
        const leftGroup = await classifyAndRecognizeGroup(worker, leftMat);
        const rightGroup = await classifyAndRecognizeGroup(worker, rightMat);
        if (canvases.leftGroup) cv.imshow(canvases.leftGroup, leftMat);
        if (canvases.rightGroup) cv.imshow(canvases.rightGroup, rightMat);

        if (leftGroup.type !== rightGroup.type) {
          const cleanedLeft = leftGroup.text.toUpperCase().replace(/[^A-Z0-9]/g, '');
          const cleanedRight = rightGroup.text.toUpperCase().replace(/[^A-Z0-9]/g, '');
          rawText = `${leftGroup.text}-${rightGroup.text}`;
          result = {
            cleaned: `${cleanedLeft}-${cleanedRight}`,
            left: cleanedLeft,
            right: cleanedRight,
            mode: '情境 C：垂直投影群組切割 + 專屬白名單雙重辨識',
          };
        } else {
          onLog(`⚠️ 左右子圖皆判定為「${leftGroup.type}」類型，切割結果不可靠，改用整條辨識 fallback`);
        }
      } else {
        onLog(`未找到可靠的群組間隙（${splitResult.reason}），改用整條辨識 fallback`);
      }

      if (!result) {
        if (canvases.leftGroup) canvases.leftGroup.getContext('2d').clearRect(0, 0, canvases.leftGroup.width, canvases.leftGroup.height);
        if (canvases.rightGroup) canvases.rightGroup.getContext('2d').clearRect(0, 0, canvases.rightGroup.width, canvases.rightGroup.height);
        onLog('執行 Tesseract OCR 辨識（整條車牌）...');
        rawText = await recognizePlate(worker, morphed);

        onLog('後處理與智慧分群切割...');
        result = postProcessPlateText(rawText);
      }

      return { rawText, usedFallback, ...result };
    } finally {
      await worker.terminate();
      srcMat.delete();
      if (warped) warped.delete();
      if (enhanced) enhanced.delete();
      if (binary) binary.delete();
      if (morphed) morphed.delete();
      if (leftMat) leftMat.delete();
      if (rightMat) rightMat.delete();
      if (splitOverlay) splitOverlay.delete();
    }
  }

  return {
    CONF,
    ensureCvReady,
    loadImageFromFile,
    detectPlateCorners,
    warpPlate,
    enhanceContrast,
    binarizeOtsuInverted,
    morphologyClose,
    splitPlateGroups,
    recognizeText,
    recognizePlate,
    classifyAndRecognizeGroup,
    postProcessPlateText,
    runPipeline,
  };
})();
