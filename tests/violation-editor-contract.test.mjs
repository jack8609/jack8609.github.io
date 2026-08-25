import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const calls = {
  ocrLoads: [],
  storage: []
};
const elements = new Map();

function createElement() {
  return {
    value: '',
    checked: false,
    disabled: false,
    _innerHTML: '',
    children: [],
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(value) {
      this._innerHTML = value;
      this.children = [];
    },
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    dispatchEvent(event) {
      const handler = this.listeners[event.type];
      if (handler) handler.call(this, event);
    },
    appendChild(child) {
      this.children.push(child);
    },
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
      toast() {},
      errlog(...messages) {
        throw new Error(`unexpected errlog: ${messages.join(' ')}`);
      }
    }
  }
};
globalThis.document = {
  baseURI: 'file:///fake-root/index.html',
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

// 兩個「位置」各自的樣本內容：跟隨程式碼（code）＋ 專案 root，用來驗證添加＋去重合併策略。
const codeItemsText = '# 通用\n共同項目A\n\n# 台北市\n台北專屬A\n';
const rootItemsText = '# 台北市\n台北專屬A\n台北新增項目B\n\n# 新竹市\n新竹項目C\n';
const fetchedUrls = [];
globalThis.fetch = async (url) => {
  const href = url.toString();
  fetchedUrls.push(href);
  const text = href.includes('/modules/app/violation-items.txt') ? codeItemsText : rootItemsText;
  return { ok: true, arrayBuffer: async () => new TextEncoder().encode(text).buffer };
};

const moduleFileUrl = new URL('../modules/app/violation-editor.js', import.meta.url);
const source = await readFile(moduleFileUrl, 'utf8');
const executableSource = source.replaceAll('import.meta.url', JSON.stringify(moduleFileUrl.href));
const moduleUrl = `data:text/javascript;base64,${Buffer.from(executableSource).toString('base64')}`;
const {
  initializeViolationEditor,
  parseViolationItemsText,
  mergeViolationData,
  decodeViolationItemsBuffer
} = await import(moduleUrl);

// --- 純函式：文字解析／合併去重 ---
assert.deepEqual(parseViolationItemsText(codeItemsText), { 通用: ['共同項目A'], 台北市: ['台北專屬A'] });
assert.deepEqual(parseViolationItemsText('\r\n# A\r\n項目一\r\n項目一\r\n\r\n# B\r\n項目二\r\n'), {
  A: ['項目一'],
  B: ['項目二']
}, 'CRLF 換行、同分類內重複行都要正確處理');
assert.deepEqual(parseViolationItemsText('# 說明文字\n# 另一段說明\n'), {}, '沒有實際項目的標題行不應成立分類');
assert.deepEqual(
  mergeViolationData({ 通用: ['共同項目A'], 台北市: ['台北專屬A'] }, { 台北市: ['台北專屬A', '台北新增項目B'], 新竹市: ['新竹項目C'] }),
  { 通用: ['共同項目A'], 台北市: ['台北專屬A', '台北新增項目B'], 新竹市: ['新竹項目C'] }
);
assert.equal(decodeViolationItemsBuffer(new TextEncoder().encode('\uFEFF台北市').buffer), '台北市', '需去除 UTF-8 BOM');

// --- 整合：initializeViolationEditor 建表後非同步載入兩個位置並合併 ---
await initializeViolationEditor(root);

assert.match(root.innerHTML, /id="city-select"/);
assert.match(root.innerHTML, /id="ve-violation"/);
assert.strictEqual(window.ViolationHelper.modules.violationEditor.init, initializeViolationEditor);
assert.ok(fetchedUrls.some((url) => url.includes('/modules/app/violation-items.txt')), '應抓取跟隨程式碼位置的清單');
assert.ok(fetchedUrls.some((url) => !url.includes('/modules/app/violation-items.txt')), '應抓取專案 root 位置的清單');

const citySelect = elements.get('#city-select');
const violationSelect = elements.get('#ve-violation');
assert.deepEqual(citySelect.children.map((opt) => opt.value), ['通用', '台北市', '新竹市']);
assert.equal(citySelect.value, '通用', '預設應選第一個分類（通用）');
assert.deepEqual(violationSelect.children.map((opt) => opt.value), ['共同項目A']);
assert.equal(violationSelect.disabled, false);

citySelect.value = '台北市';
citySelect.dispatchEvent(new Event('change'));
assert.deepEqual(
  violationSelect.children.map((opt) => opt.value),
  ['共同項目A', '台北專屬A', '台北新增項目B'],
  '選城市後應為「通用＋該市專屬」聯集'
);

citySelect.value = '新竹市';
citySelect.dispatchEvent(new Event('change'));
assert.deepEqual(violationSelect.children.map((opt) => opt.value), ['共同項目A', '新竹項目C']);

const autoOcr = elements.get('#ve-auto-ocr');
autoOcr.checked = true;
autoOcr.listeners.change.call(autoOcr);
assert.equal(window.ViolationHelper.state.ocr.isAutoEnabled, true);
assert.deepEqual(calls.storage, [{ key: 've_auto_ocr_enabled', value: '1' }]);
assert.deepEqual(calls.ocrLoads, ['load']);

console.log('violation editor contract passed');