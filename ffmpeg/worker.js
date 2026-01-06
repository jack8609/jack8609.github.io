
// ffmpeg/worker.js (classic worker)
let core = null;
let FS = null;

const emit = (evt, payload) => {
  self.postMessage({ type: 'event', data: { evt, payload } });
};

self.onmessage = async (ev) => {
  const { type, id, cmd, payload } = ev.data || {};
  if (type !== 'cmd') return;

  const reply = (result, error) => {
    self.postMessage({ type: 'resp', id, data: error ? { error: String(error) } : { result } });
  };

  try {
    if (cmd === 'init') {
      const { coreURL, wasmURL } = payload;

      // 1) 載入 core JS（classic 才能用 importScripts）
      try {
        importScripts(coreURL);
        emit('log', { message: `[worker] importScripts(coreURL) OK` });
      } catch (e) {
        return reply(null, `importScripts(coreURL) failed: ${e?.message || e}`);
      }

      // 2) 取得核心工廠（不同版本名稱可能不同）
      const factory = self.createFFmpegCore || self.FFmpegWASM || self.Module;
      if (!factory) {
        return reply(null, 'ffmpeg-core.js 沒有暴露 createFFmpegCore/FFmpegWASM/Module；請確認核心檔版本。');
      }

      // 3) 先手動抓 wasm 二進位，並做 magic word 檢查
      let wasmBuf;
      try {
        const res = await fetch(wasmURL, { cache: 'no-store' });
        const ct  = res.headers.get('content-type') || '(unknown)';
        const buf = await res.arrayBuffer();
        const u8  = new Uint8Array(buf);
        const hex = (b) => b.toString(16).padStart(2, '0');

        if (u8.length < 4 || !(u8[0] === 0x00 && u8[1] === 0x61 && u8[2] === 0x73 && u8[3] === 0x6d)) {
          // 不是 WASM 二進位 → 回報前 4 bytes 與 MIME，便於除錯
          const head4 = Array.from(u8.slice(0,4)).map(hex).join(' ');
          emit('log', { message: `[worker] wasm magic mismatch: head=${head4} ct=${ct} len=${u8.length}` });
          return reply(null, `wasmBinary invalid (magic mismatch). ct=${ct}, head=${head4}, len=${u8.length}`);
        }

        wasmBuf = buf;
        emit('log', { message: `[worker] fetched wasm OK (len=${u8.length}, ct=${ct})` });
      } catch (e) {
        return reply(null, `fetch(wasmURL) failed: ${e?.message || e}`);
      }

      // 4) 建立核心，直接提供 wasmBinary，避免路徑/locateFile 差異
      const opts = {
        wasmBinary: wasmBuf,
        print:    (txt) => emit('log', { message: txt }),
        printErr: (txt) => emit('log', { message: txt }),
      };

      try {
        core = typeof factory === 'function' ? await factory(opts) : factory;
      } catch (e) {
        return reply(null, `createFFmpegCore failed: ${e?.message || e}`);
      }

      // 5) 取 FS 介面
      FS = core.FS || core.fs || (core.FS_create ? core : null);
      if (!FS) {
        return reply(null, 'FFmpeg Core 未提供 FS 介面（FS/FS_create）；請換用相容的核心檔。');
      }

      self.postMessage({ type: 'ready' });
      return reply(true);
    }

    if (cmd === 'writeFile') {
      const { path, data } = payload; // Uint8Array
      FS.writeFile(path, data);
      return reply(true);
    }

    if (cmd === 'readFile') {
      const { path } = payload;
      const out = FS.readFile(path);
      return reply(out.buffer, null);
    }

    if (cmd === 'exec') {
      const { args } = payload;
      emit('log', { message: `exec: ${args.join(' ')}` });

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
