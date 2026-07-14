import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calls = {
  events: [],
  toasts: []
};
const plate1 = {
  value: '',
  dispatchEvent(event) {
    calls.events.push({ target: 'plate1', type: event.type });
  }
};
const plate2 = {
  value: '',
  dispatchEvent(event) {
    calls.events.push({ target: 'plate2', type: event.type });
  }
};

globalThis.window = {
  ViolationHelper: {
    config: {
      ocrScripts: [
        { url: './tesseract/tesseract.min.js', label: 'OCR 文字辨識引擎' },
        { url: './opencv/opencv.min.js', label: '影像校正引擎（檔案較大，請耐心等候）' },
        { url: './plate-ocr/plate-ocr.js', label: '車牌辨識模組' }
      ]
    },
    state: { ocr: { libsPromise: null, isBusy: false, isAutoEnabled: false } },
    services: {},
    utils: {
      toast(message) {
        calls.toasts.push(message);
      }
    }
  }
};
globalThis.document = {
  getElementById(id) {
    if (id === 've-plate1') return plate1;
    if (id === 've-plate2') return plate2;
    return null;
  }
};
globalThis.PlateOCR = {
  async runPipeline(blob) {
    calls.pipelineBlob = blob;
    return { left: 'ABCD9', right: '12345' };
  }
};

const source = await readFile(new URL('../modules/app/ocr-integration.js', import.meta.url), 'utf8');
assert.match(source, /typeof PlateOCR !== 'undefined'/);
assert.match(source, /PlateOCR\.runPipeline\(blob\)/);
assert.doesNotMatch(source, /window\.PlateOCR/);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { initializeOcrIntegration } = await import(moduleUrl);
initializeOcrIntegration();

const { services, state, config } = window.ViolationHelper;
assert.deepEqual(Object.keys(services.ocr).sort(), ['load', 'recognize']);
assert.equal(config.ocrScripts.at(-1).url, './plate-ocr/plate-ocr.js');
await services.ocr.load();
assert.equal(state.ocr.libsPromise, null);

await services.ocr.recognize({
  toBlob(callback, type) {
    assert.equal(type, 'image/png');
    callback({ type });
  }
});
assert.equal(plate1.value, 'ABCD');
assert.equal(plate2.value, '1234');
assert.deepEqual(calls.events, [
  { target: 'plate1', type: 'input' },
  { target: 'plate2', type: 'input' }
]);
assert.equal(calls.pipelineBlob.type, 'image/png');
assert.equal(state.ocr.isBusy, false);
assert.deepEqual(calls.toasts, ['辨識車牌中...', '車牌辨識完成：ABCD9-12345（請核對）']);

console.log('ocr integration contract passed');