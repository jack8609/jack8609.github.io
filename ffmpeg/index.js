
// ffmpeg/index.js
export class FFmpeg {
  constructor() {
    this._worker = null;
    this._reqId = 0;
    this._pending = new Map();
    this._listeners = { log: [], progress: [] };
  }

  on(evt, handler) {
    (this._listeners[evt] || (this._listeners[evt] = [])).push(handler);
  }
  _emit(evt, payload) {
    (this._listeners[evt] || []).forEach(fn => {
      try { fn(payload); } catch (e) { console.error(e); }
    });
  }

  async load({ coreURL, wasmURL, workerURL }) {
    if (!coreURL || !wasmURL || !workerURL) {
      throw new Error('load() 需要 coreURL / wasmURL / workerURL');
    }

    // ✅ 一定用 classic worker（不要 type:"module"）
    const w = new Worker(workerURL); 
    this._worker = w;

    w.onmessage = (ev) => {
      const { type, id, data } = ev.data || {};
      if (type === 'ready') {
        // worker 一開始就會回 ready
        return;
      }
      if (type === 'event') {
        // log / progress
        const { evt, payload } = data;
        this._emit(evt, payload);
        return;
      }
      if (type === 'resp') {
        const p = this._pending.get(id);
        if (p) {
          this._pending.delete(id);
          if (data?.error) p.reject(data.error);
          else p.resolve(data.result);
        }
      }
    };
    w.onerror = (e) => {
      console.error('[FFmpeg worker] error:', e.message);
    };

    // 啟動 worker，傳入核心 URL
    const ok = await this._call('init', { coreURL, wasmURL });
    if (!ok) throw new Error('failed to import ffmpeg-core.js');
  }

  async writeFile(path, uint8) {
    return this._call('writeFile', { path, data: uint8 }, { transfer: [uint8.buffer] });
  }

  async readFile(path) {
    const res = await this._call('readFile', { path });
    return new Uint8Array(res); // 以 Uint8Array 返回
  }

  async exec(args) {
    return this._call('exec', { args });
  }

  // ====== 內部封裝：request/response ======
  _call(cmd, payload, opts = {}) {
    if (!this._worker) throw new Error('worker not loaded');
    const id = ++this._reqId;
    const msg = { type: 'cmd', id, cmd, payload };
    const p = {};
    p.promise = new Promise((resolve, reject) => { p.resolve = resolve; p.reject = reject; });
    this._pending.set(id, p);
    this._worker.postMessage(msg, opts.transfer || []);
    return p.promise;
  }
}
