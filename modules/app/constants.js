export function initializeConfig() {
  const { config } = window.ViolationHelper;

  config.storageKeys = {
    disclaimerAcceptedAt: 'user_agreed_timestamp',
    theme: 'app-theme',
    autoPlateOcrEnabled: 've_auto_ocr_enabled'
  };
  config.ocrScripts = [
    { url: './tesseract/tesseract.min.js', label: 'OCR 文字辨識引擎' },
    { url: './opencv/opencv.min.js', label: '影像校正引擎（檔案較大，請耐心等候）' },
    { url: './plate-ocr/plate-ocr.js', label: '車牌辨識模組' }
  ];
  config.ffmpeg = {
    coreURL: new URL('../../core/ffmpeg-core.js', import.meta.url).href,
    wasmURL: new URL('../../core/ffmpeg-core.wasm', import.meta.url).href,
    workerURL: new URL('../../ffmpeg/worker.js', import.meta.url).href,
    remuxArgs: ['-i', 'inputfile', '-c', 'copy', '-tag:v', 'hvc1', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', 'automp4.mp4']
  };
}