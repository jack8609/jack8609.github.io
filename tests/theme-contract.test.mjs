import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const listeners = {};
const writes = [];
const attributes = new Map();
const themeSwitch = {
  checked: false,
  addEventListener(type, handler) {
    listeners.change = { type, handler };
  }
};
const themeLabel = { textContent: '深色' };

globalThis.window = {
  ViolationHelper: {
    dom: { themeSwitch, themeLabel },
    config: { storageKeys: { theme: 'app-theme' } },
    state: { ui: { theme: null } }
  },
  matchMedia() {
    return { matches: false };
  }
};
globalThis.document = {
  documentElement: {
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    removeAttribute(name) {
      attributes.delete(name);
    }
  }
};
globalThis.localStorage = {
  getItem(key) {
    assert.equal(key, 'app-theme');
    return 'light';
  },
  setItem(key, value) {
    writes.push({ key, value });
  }
};

const source = await readFile(new URL('../modules/app/theme.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { initializeTheme } = await import(moduleUrl);
initializeTheme();

assert.equal(window.ViolationHelper.state.ui.theme, 'light');
assert.equal(attributes.get('data-theme'), 'light');
assert.equal(themeSwitch.checked, true);
assert.equal(themeLabel.textContent, '明亮');
assert.deepEqual(writes, []);

themeSwitch.checked = false;
listeners.change.handler();
assert.equal(window.ViolationHelper.state.ui.theme, 'dark');
assert.equal(attributes.has('data-theme'), false);
assert.equal(themeSwitch.checked, false);
assert.equal(themeLabel.textContent, '深色');
assert.deepEqual(writes, [{ key: 'app-theme', value: 'dark' }]);

console.log('theme contract passed');