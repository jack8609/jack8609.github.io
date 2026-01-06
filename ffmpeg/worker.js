
// ffmpeg/worker.js — 專用於 jack8609 的 ffmpeg-core.js（classic worker）
let core = null;         // Module
let FS = null;

const emit = (evt, payload) => {
  self.postMessage({ type: 'event', data: { evt, payload } });
};
const reply = (id, result, error) => {
  self.postMessage({ type: 'resp', id, data: error ? { error: String(error) } : { result } });
};

self.onmessage = async (ev) => {
  const { type, id, cmd, payload } = ev.data || {};
  if (type !== 'cmd') return;

  try {
    if (cmd === 'init') {
      const { coreURL, wasmURL } = payload;

      // 1) 載入核心 JS（classic worker）
      try {
        importScripts(coreURL);
        emit('log', { message: `[worker] importScripts(coreURL) OK` });
      } catch (e) {
        return reply(id, null, `importScripts(coreURL) failed: ${e?.message || e}`);
      }

      // 2) 取得 wasm 二進位並檢查 magic word
      let wasmBuf;
      try {
        const res = await fetch(wasmURL, { cache: 'no-store' });
        const ct  = res.headers.get('content-type') || '(unknown)';
        const buf = await res.arrayBuffer();
        const u8  = new Uint8Array(buf);
        const hex = (b) => b.toString(16).padStart(2, '0');

        if (u8.length < 4 || !(u8[0] === 0x00 && u8[1] === 0x61 && u8[2] === 0x73 && u8[3] === 0x6d)) {
          const head4 = Array.from(u8.slice(0,4)).map(hex).join(' ');
          emit('log', { message: `[worker] wasm magic mismatch: head=${head4} ct=${ct} len=${u8.length}` });
          return reply(id, null, `wasmBinary invalid (magic mismatch). ct=${ct}, head=${head4}, len=${u8.length}`);
        }

        wasmBuf = buf;
        emit('log', { message: `[worker] fetched wasm OK (len=${u8.length}, ct=${ct})` });
      } catch (e) {
        return reply(id, null, `fetch(wasmURL) failed: ${e?.message || e}`);
      }

      // 3) 以 wasmBinary 建立 Module：你的核心是 createFFmpegCore(options) → Promise<Module>
      let factory = self.createFFmpegCore; // 由 ffmpeg-core.js 定義在全域
      if (typeof factory !== 'function') {
        return reply(id, null, 'createFFmpegCore not found in global scope');
      }

      try {
        core = await factory({
          wasmBinary: wasmBuf,
          print:    (txt) => emit('log', { message: txt }),
          printErr: (txt) => emit('log', { message: txt }),
          // 若你想要覆寫 locateFile 也可在這裡加，但我們已提供 wasmBinary 無須再抓檔
        });
      } catch (e) {
        return reply(id, null, `createFFmpegCore failed: ${e?.message || e}`);
      }

      // 4) 設定 logger/progress，並取得 FS
      try {
        if (core?.setLogger) {
          core.setLogger(({ type, message }) => emit('log', { type, message }));
        }
        if (core?.setProgress) {
          core.setProgress((p) => emit('progress', p));
        }
      } catch (_) {}

      FS = core?.FS;
      if (!FS) return reply(id, null, 'FFmpeg Core did not expose FS');

      self.postMessage({ type: 'ready' });
      return reply(id, true);
    }

    if (cmd === 'writeFile') {
      const { path, data } = payload; // Uint8Array
      FS.writeFile(path, data);
      return reply(id, true);
    }

    if (cmd === 'readFile') {
      const { path } = payload;
      const out = FS.readFile(path);
      return reply(id, out.buffer);
    }

    if (cmd === 'exec') {
      const { args } = payload;
      emit('log', { message: `exec: ${args.join(' ')}` });

      if (!core?.exec || typeof core.exec !== 'function') {
        // 你的核心明確提供 Module.exec(...)，若不存在表示載入異常
        return reply(id, null, 'Module.exec not available (core load unexpected)');
      }

      try {
        // ✅ 直接使用 Module.exec(...args)（核心會自動加上 DEFAULT_ARGS）
        const ret = core.exec(...args);
        emit('log', { message: `[worker] exec returned ${ret}` });
      } catch (e) {
        return reply(id, null, `exec failed: ${e?.message || e}`);
      }
      return reply(id, true);
    }

    return reply(id, null, `Unknown cmd: ${cmd}`);
  } catch (err) {
    return reply(id, null, err?.message || err);
  }
};
