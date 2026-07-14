import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const listeners = {};
const writes = [];
const scrollBox = {
  scrollHeight: 500,
  scrollTop: 390,
  clientHeight: 100,
  addEventListener(type, handler) {
    listeners.scroll = { type, handler };
  }
};
const btn = {
  disabled: true,
  innerText: '請完整閱讀完警語',
  addEventListener(type, handler) {
    listeners.accept = { type, handler };
  }
};
const overlay = { style: {} };
const checkbox = { checked: true };

globalThis.window = {
  ViolationHelper: {
    dom: { overlay, scrollBox, checkbox, btn },
    config: {
      storageKeys: { disclaimerAcceptedAt: 'user_agreed_timestamp' }
    },
    state: { ui: { isDisclaimerDismissed: false } }
  }
};
globalThis.document = {
  documentElement: {
    classList: {
      add(name) {
        writes.push({ type: 'class', name });
      }
    }
  }
};
globalThis.localStorage = {
  setItem(key, value) {
    writes.push({ type: 'storage', key, value });
  }
};
globalThis.setTimeout = (callback, delay) => {
  assert.equal(delay, 300);
  callback();
};

const source = await readFile(new URL('../modules/app/disclaimer.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { initializeDisclaimer } = await import(moduleUrl);
initializeDisclaimer();

listeners.scroll.handler();
assert.equal(btn.disabled, false);
assert.equal(btn.innerText, '我已了解並確定');

listeners.accept.handler();
assert.equal(writes[0].type, 'storage');
assert.equal(writes[0].key, 'user_agreed_timestamp');
assert.match(writes[0].value, /^\d+$/);
assert.deepEqual(writes[1], { type: 'class', name: 'hide-warning-overlay' });
assert.equal(overlay.style.opacity, '0');
assert.equal(overlay.style.transition, 'opacity 0.3s ease');
assert.equal(overlay.style.display, 'none');
assert.equal(window.ViolationHelper.state.ui.isDisclaimerDismissed, true);

console.log('disclaimer contract passed');