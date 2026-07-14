import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const NativeURL = URL;
const calls = {
  appended: [],
  revokedUrls: [],
  selectionUpdates: 0
};
const dom = {
  btnClip: { disabled: true },
  btnDownloadFull: { disabled: true },
  btnThumbnail: { disabled: true },
  startRange: {},
  endRange: {},
  startLabel: { textContent: '' },
  endLabel: { textContent: '' }
};

globalThis.window = {
  ViolationHelper: {
    dom,
    state: {},
    services: {
      timeline: {
        updateSelectionBar() {
          calls.selectionUpdates += 1;
        }
      }
    },
    utils: {}
  }
};
globalThis.document = {
  body: {
    appendChild(element) {
      calls.appended.push(element);
    }
  },
  createElement(tagName) {
    return {
      tagName,
      click() {},
      remove() {}
    };
  }
};
globalThis.URL = {
  createObjectURL() {
    return 'blob:download';
  },
  revokeObjectURL(url) {
    calls.revokedUrls.push(url);
  }
};
globalThis.requestAnimationFrame = (callback) => callback();
globalThis.setTimeout = (callback) => callback();

const source = await readFile(new NativeURL('../modules/app/utils.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { registerUtils } = await import(moduleUrl);
registerUtils();

const { utils } = window.ViolationHelper;
assert.deepEqual(Object.keys(utils).sort(), [
  'fileToUint8Array', 'fmt', 'inferInputName', 'resetClipUI', 'revokeURL',
  'setActionsEnabled', 'triggerDownloadFromBlob'
]);
assert.equal(utils.fmt(Number.NaN), '00:00:00.00');
assert.equal(utils.fmt(3661.5), '01:01:01.50');
assert.equal(utils.inferInputName('camera.TS'), 'input.ts');
assert.equal(utils.inferInputName('unknown.bin'), 'input.mp4');

utils.setActionsEnabled(true);
assert.deepEqual([dom.btnClip.disabled, dom.btnDownloadFull.disabled, dom.btnThumbnail.disabled], [false, false, false]);
utils.resetClipUI(12.5);
assert.deepEqual([dom.startRange.min, dom.startRange.max, dom.startRange.value], [0, 12.5, 0]);
assert.deepEqual([dom.endRange.min, dom.endRange.max, dom.endRange.value], [0, 12.5, 12.5]);
assert.deepEqual([dom.startLabel.textContent, dom.endLabel.textContent], ['開始：00:00:00.00', '結束：00:00:12.50']);
assert.equal(calls.selectionUpdates, 2);

utils.revokeURL('blob:old');
utils.triggerDownloadFromBlob({}, 'clip.mp4');
assert.deepEqual(calls.revokedUrls, ['blob:old', 'blob:download']);
assert.equal(calls.appended[0].download, 'clip.mp4');
assert.equal(calls.appended[0].href, 'blob:download');
assert.deepEqual(
  [...await utils.fileToUint8Array({ arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer })],
  [1, 2, 3]
);

console.log('utils contract passed');