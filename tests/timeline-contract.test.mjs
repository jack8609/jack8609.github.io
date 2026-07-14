import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const listeners = {};
const resetCalls = [];
function eventTarget(name, properties = {}) {
  return {
    ...properties,
    addEventListener(type, handler) {
      listeners[`${name}:${type}`] = handler;
    }
  };
}

const preview = eventTarget('preview', { duration: 100, currentTime: 20 });
const startRange = eventTarget('startRange', { min: 0, max: 100, value: 10 });
const endRange = eventTarget('endRange', { min: 0, max: 100, value: 50 });
const selectionEl = { style: {} };

globalThis.window = {
  ViolationHelper: {
    dom: {
      preview,
      curEl: { textContent: '' },
      durEl: { textContent: '' },
      rail: { getBoundingClientRect: () => ({ width: 200 }) },
      selectionEl,
      startRange,
      endRange,
      startLabel: { textContent: '' },
      endLabel: { textContent: '' }
    },
    services: {},
    utils: {
      fmt(seconds) {
        return `fmt:${seconds}`;
      },
      resetClipUI(duration) {
        resetCalls.push(duration);
      }
    }
  },
  addEventListener(type, handler) {
    listeners[`window:${type}`] = handler;
  }
};

const source = await readFile(new URL('../modules/app/timeline.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { initializeTimeline } = await import(moduleUrl);
initializeTimeline();

const { dom, services } = window.ViolationHelper;
assert.deepEqual(Object.keys(services.timeline).sort(), ['clampAndPreview', 'resetClipUI', 'updateSelectionBar']);
assert.strictEqual(services.timeline.resetClipUI, window.ViolationHelper.utils.resetClipUI);
services.timeline.updateSelectionBar();
assert.deepEqual(selectionEl.style, { left: '20px', width: '80px' });

listeners['preview:loadedmetadata']();
assert.equal(dom.durEl.textContent, 'fmt:100');
assert.equal(dom.curEl.textContent, 'fmt:20');
assert.deepEqual(resetCalls, [100]);

preview.currentTime = 42;
listeners['preview:timeupdate']();
assert.equal(dom.curEl.textContent, 'fmt:42');

startRange.value = 80;
endRange.value = 50;
listeners['startRange:input']();
assert.equal(endRange.value, 80);
assert.equal(preview.currentTime, 80);
assert.equal(dom.startLabel.textContent, '開始：fmt:80');
assert.equal(dom.endLabel.textContent, '結束：fmt:80');
assert.deepEqual(selectionEl.style, { left: '160px', width: '0px' });

listeners['window:resize']();
assert.deepEqual(selectionEl.style, { left: '160px', width: '0px' });

console.log('timeline contract passed');