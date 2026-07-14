import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const listeners = {};
const calls = {
  appended: [],
  clipboard: []
};
const logEl = {
  textContent: 'Log：',
  scrollTop: 0,
  scrollHeight: 42
};
const logPanel = {
  classList: {
    toggle(name, enabled) {
      calls.logPanel = { name, enabled };
    }
  }
};
const toggleLog = {
  checked: false,
  addEventListener(type, handler) {
    listeners.toggleLog = { type, handler };
  }
};
const btnCopyLog = {
  addEventListener(type, handler) {
    listeners.copyLog = { type, handler };
  }
};

globalThis.window = {
  ViolationHelper: {
    dom: { logEl, logPanel, toggleLog, btnCopyLog },
    state: { ui: { isLogVisible: false } },
    utils: { fmt() {} }
  }
};
globalThis.document = {
  body: {
    appendChild(element) {
      calls.appended.push(element);
    }
  },
  createElement() {
    return { style: {}, remove() { this.removed = true; } };
  }
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
  clipboard: {
    async writeText(text) {
      calls.clipboard.push(text);
    }
  }
  }
});
globalThis.setTimeout = (callback) => callback();

const source = await readFile(new URL('../modules/app/logger.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { initializeLogger } = await import(moduleUrl);
initializeLogger();

const { utils } = window.ViolationHelper;
assert.deepEqual(Object.keys(utils).sort(), ['errlog', 'fmt', 'log', 'toast']);
utils.log('ready', { source: 'test' });
assert.match(logEl.textContent, /ready \{"source":"test"\}/);
assert.equal(logEl.scrollTop, logEl.scrollHeight);
utils.errlog('failed');
assert.match(logEl.textContent, /ERROR: failed/);

toggleLog.checked = true;
listeners.toggleLog.handler();
assert.deepEqual(calls.logPanel, { name: 'show', enabled: true });
assert.equal(window.ViolationHelper.state.ui.isLogVisible, true);

await listeners.copyLog.handler();
assert.deepEqual(calls.clipboard, [logEl.textContent]);
assert.equal(calls.appended.at(-1).textContent, '已複製到剪貼簿');
assert.equal(calls.appended.at(-1).removed, true);

console.log('logger contract passed');