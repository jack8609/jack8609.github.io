import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calls = {
  dropdowns: [],
  ocrLoads: [],
  storage: []
};
const elements = new Map();

function createElement() {
  return {
    value: '',
    checked: false,
    innerHTML: '',
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    appendChild() {},
    select() {},
    setSelectionRange() {}
  };
}

const root = {
  set innerHTML(value) {
    this.markup = value;
    for (const id of [
      've-plate1', 've-plate2', 've-auto-ocr', 'city-select', 've-violation',
      've-date', 've-hour', 've-minute', 've-road', 've-output', 've-pause', 've-copy'
    ]) {
      elements.set(`#${id}`, createElement());
    }
  },
  get innerHTML() {
    return this.markup;
  },
  querySelector(selector) {
    return elements.get(selector) ?? null;
  }
};

globalThis.window = {
  ViolationHelper: {
    config: { storageKeys: { autoPlateOcrEnabled: 've_auto_ocr_enabled' } },
    state: { ocr: { isAutoEnabled: false } },
    services: {
      ocr: {
        load() {
          calls.ocrLoads.push('load');
          return Promise.resolve();
        }
      }
    },
    modules: {},
    utils: {
      toast() {}
    }
  },
  initViolationDropdowns() {
    calls.dropdowns.push(root.innerHTML.includes('id="city-select"') && root.innerHTML.includes('id="ve-violation"'));
  }
};
globalThis.document = {
  createElement() {
    return createElement();
  },
  execCommand() {}
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { clipboard: { writeText: async () => {} } }
});
globalThis.localStorage = {
  getItem() {
    return null;
  },
  setItem(key, value) {
    calls.storage.push({ key, value });
  }
};
globalThis.setTimeout = (callback) => callback();

const source = await readFile(new URL('../modules/app/violation-editor.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { initializeViolationEditor } = await import(moduleUrl);
initializeViolationEditor(root);

assert.match(root.innerHTML, /id="city-select"/);
assert.match(root.innerHTML, /id="ve-violation"/);
assert.strictEqual(window.ViolationHelper.modules.violationEditor.init, initializeViolationEditor);
assert.deepEqual(calls.dropdowns, [true]);

const autoOcr = elements.get('#ve-auto-ocr');
autoOcr.checked = true;
autoOcr.listeners.change.call(autoOcr);
assert.equal(window.ViolationHelper.state.ocr.isAutoEnabled, true);
assert.deepEqual(calls.storage, [{ key: 've_auto_ocr_enabled', value: '1' }]);
assert.deepEqual(calls.ocrLoads, ['load']);

console.log('violation editor contract passed');