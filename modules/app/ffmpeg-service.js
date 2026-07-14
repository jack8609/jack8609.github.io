export async function initializeFfmpegService() {
  const { config, dom, services, state, utils } = window.ViolationHelper;
  const { statusEl } = dom;
  const { errlog, log, setActionsEnabled } = utils;

  try {
    const module = await import('../../ffmpeg/index.js');
    state.ffmpeg.ctor = module.FFmpeg || module.default;
  } catch (error) {
    statusEl.textContent = '狀態：載入 FFmpeg 入口失敗 ❌';
    state.ffmpeg.error = error;
    errlog('無法 import ./ffmpeg/index.js：', error?.message || error);
  }

  async function waitSWReady(milliseconds = 5000) {
    try {
      return await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker 啟動逾時')), milliseconds))
      ]);
    } catch (error) {
      errlog('Service Worker 可能未就緒：', error?.message || error);
    }
  }

  const start = async () => {
    try {
      statusEl.textContent = '狀態：等待 Service Worker 就緒…';
      await waitSWReady(5000);
      log('crossOriginIsolated =', String(self.crossOriginIsolated));
      state.ffmpeg.instance = new state.ffmpeg.ctor();
      if (state.ffmpeg.instance?.on) {
        state.ffmpeg.instance.on('log', ({ message }) => log('[ffmpeg]', message));
        state.ffmpeg.instance.on('progress', (progress) => log('[progress]', JSON.stringify(progress)));
      }
      statusEl.textContent = '狀態：正在載入 FFmpeg…（首次載入較慢）';
      await state.ffmpeg.instance.load({
        coreURL: config.ffmpeg.coreURL,
        wasmURL: config.ffmpeg.wasmURL,
        workerURL: config.ffmpeg.workerURL
      });
      state.ffmpeg.isReady = true;
      statusEl.textContent = '狀態：FFmpeg 載入完成 ✅';
      log('FFmpeg 已就緒。');
      setActionsEnabled(false);
    } catch (error) {
      state.ffmpeg.error = error;
      statusEl.textContent = `狀態：載入失敗 ❌ ${error?.message || error}`;
      errlog('初始化失敗：', error?.stack || error);
    }
  };

  services.ffmpeg = {
    start,
    get instance() {
      return state.ffmpeg.instance;
    }
  };
}