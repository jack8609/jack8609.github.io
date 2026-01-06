
// ffmpeg/worker.js (classic worker)
let core = null;

// 事件派發回主線程
const emit = (evt, payload) => {
  self.postMessage({ type: 'event', data: { evt, payload } });
};

// 以簡單的 in-memory FS 模擬
let FS = null;

self.onmessage = async (ev) => {
  const { type, id, cmd, payload } = ev.data || {};
  if (type !== 'cmd') return;

  const reply = (result, error) => {
    self.postMessage({ type: 'resp', id, data: error ? { error: String(error) } : { result } });
  };

  try {
    if (cmd === 'init') {
      const { coreURL, wasmURL } = payload;

      // ✅ 在 classic worker 內用 importScripts 載入核心 JS
      try {
        importScripts(coreURL);
      } catch (e) {
        return reply(null, `importScripts(core) failed: ${e?.message || e}`);
      }

      // 嘗試各種常見入口名稱（視你拿的 ffmpeg-core.js 版本而定）
      // 1) UMD：self.createFFmpegCore
      // 2) Emscripten 風格：self.FFmpegWASM、self.Module 等
      const factory = self.createFFmpegCore || self.FFmpegWASM || self.Module;
      if (!factory) {
        return reply(null, 'ffmpeg-core.js 沒有暴露 createFFmpegCore/FFmpegWASM/Module 工廠；請確認核心檔版本。');
      }

      // 建立核心（參數名稱會因版本而異，這裡示範常見用法）
      // 注意：有些版本需要 { locateFile: (p)=>wasmURL } 來指定 wasm 位置
      const opts = {
        print: (txt) => emit('log', { message: txt }),
        printErr: (txt) => emit('log', { message: txt }),
        locateFile: (path) => {
          // 讓核心載入 wasm 時能找到正確 URL
          if (path.endsWith('.wasm')) return wasmURL;
          return path;
        }
      };

      try {
        core = typeof factory === 'function' ? await factory(opts) : factory;
      } catch (e) {
        return reply(null, `createFFmpegCore failed: ${e?.message || e}`);
      }

      FS = core.FS || core.fs || core.FS_create ? core.FS : null;
      if (!FS && core.FS_create) FS = core; // 某些版本把 FS 方法掛在 core 物件

      if (!FS) {
        return reply(null, 'FFmpeg Core 未提供 FS 介面（FS/FS_create）；請換用相容的核心檔。');
      }

      self.postMessage({ type: 'ready' });
      return reply(true);
    }

    if (cmd === 'writeFile') {
      const { path, data } = payload;
      // Emscripten FS：需要 Uint8Array
      FS.writeFile(path, data);
      return reply(true);
    }

    if (cmd === 'readFile') {
      const { path } = payload;
      const out = FS.readFile(path);
      // 以 ArrayBuffer 形式回傳以便主線程轉成 Uint8Array
      return reply(out.buffer, null);
    }

    if (cmd === 'exec') {
      const { args } = payload;
      emit('log', { message: `exec: ${args.join(' ')}` });

      // 不同版本核心執行 API 名稱不同：
      // 1) core.callMain(args)
      // 2) core.run(args)
      // 3) Module._main(args)
      try {
        if (core.callMain) {
          core.callMain(args);
        } else if (core.run) {
          core.run(args);
        } else if (core._main) {
          core._main(args);
        } else {
          throw new Error('Core 沒有可用的執行入口（callMain/run/_main）');
        }
      } catch (e) {
        return reply(null, `exec failed: ${e?.message || e}`);
      }
      return reply(true);
    }

    return reply(null, `Unknown cmd: ${cmd}`);
  } catch (err) {
    reply(null, err?.message || err);
  }
};
``
