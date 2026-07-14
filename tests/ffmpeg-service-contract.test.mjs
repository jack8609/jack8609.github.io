import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calls = {
  logs: [],
  errors: [],
  actionStates: [],
  listeners: [],
  loadOptions: null
};
const statusEl = { textContent: '' };

class FakeFFmpeg {
  on(type, handler) {
    calls.listeners.push(type);
    this.handlers ??= {};
    this.handlers[type] = handler;
  }

  async load(options) {
    calls.loadOptions = options;
  }
}

globalThis.window = {
  ViolationHelper: {
    dom: { statusEl },
    config: {
      ffmpeg: {
        coreURL: 'core-url',
        wasmURL: 'wasm-url',
        workerURL: 'worker-url'
      }
    },
    state: { ffmpeg: { ctor: null, instance: null, isReady: false, error: null } },
    services: {},
    utils: {
      log(...messages) {
        calls.logs.push(messages);
      },
      errlog(...messages) {
        calls.errors.push(messages);
      },
      setActionsEnabled(enabled) {
        calls.actionStates.push(enabled);
      }
    }
  }
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { serviceWorker: { ready: Promise.resolve() } }
});
globalThis.self = { crossOriginIsolated: true };
globalThis.__loadFfmpeg = async () => ({ FFmpeg: FakeFFmpeg });

const source = await readFile(new URL('../modules/app/ffmpeg-service.js', import.meta.url), 'utf8');
assert.match(source, /await import\('\.\.\/\.\.\/ffmpeg\/index\.js'\)/);
const executableSource = source.replace("import('../../ffmpeg/index.js')", 'globalThis.__loadFfmpeg()');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(executableSource).toString('base64')}`;
const { initializeFfmpegService } = await import(moduleUrl);
await initializeFfmpegService();

const { state, services } = window.ViolationHelper;
assert.strictEqual(state.ffmpeg.ctor, FakeFFmpeg);
assert.deepEqual(Object.keys(services.ffmpeg).sort(), ['instance', 'start']);
assert.equal(services.ffmpeg.instance, null);

await services.ffmpeg.start();
assert.ok(state.ffmpeg.instance instanceof FakeFFmpeg);
assert.strictEqual(services.ffmpeg.instance, state.ffmpeg.instance);
assert.equal(state.ffmpeg.isReady, true);
assert.deepEqual(calls.listeners, ['log', 'progress']);
assert.deepEqual(calls.loadOptions, {
  coreURL: 'core-url',
  wasmURL: 'wasm-url',
  workerURL: 'worker-url'
});
assert.deepEqual(calls.actionStates, [false]);
assert.equal(statusEl.textContent, '狀態：FFmpeg 載入完成 ✅');
assert.equal(calls.errors.length, 0);

console.log('ffmpeg service contract passed');