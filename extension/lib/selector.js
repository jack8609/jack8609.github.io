// selector 產生的純決策邏輯；實際 DOM 擷取（label 文字、siblingIndex 等）由
// content/mapping-mode.js 在瀏覽器內完成後，把結果傳進這裡決定要用哪種策略。
// 背景見 extension/reference/site-structure-notes.md：Vuetify 的 input-\d+ 是全域計數器，
// 不保證每次載入都一樣，一律不可採用。
const AUTO_NUMBERED_ID_PATTERN = /^input-\d+$/;

export function isAutoNumberedId(id) {
  return typeof id === 'string' && AUTO_NUMBERED_ID_PATTERN.test(id);
}

// Vuetify 等框架常在欄位旁插入「目前字數 / 上限」計數器（例如「0 / 4」），這段文字
// 會隨其他欄位狀態即時變動，不能當成穩定的 label 依據（見 site-structure-notes.md）。
const VOLATILE_COUNTER_PATTERN = /\d+\s*\/\s*\d+/;

// context.nearbySelectedValues：附近 select/下拉元件目前顯示的值（由呼叫端在 DOM 蒐集）。
// 候選文字若剛好等於其中之一，代表這其實是「目前選中值」而非固定 label
// （見台北市 plate 欄位「一般(汽、機車)」地雷：那是牌照種類下拉框目前顯示的值）。
export function isVolatileLabelText(text, context) {
  if (!text) return true;
  const trimmed = String(text).trim();
  if (!trimmed) return true;
  if (VOLATILE_COUNTER_PATTERN.test(trimmed)) return true;
  const nearbySelectedValues = context && context.nearbySelectedValues;
  if (Array.isArray(nearbySelectedValues) && nearbySelectedValues.includes(trimmed)) return true;
  return false;
}

// 極簡版 CSS.escape，node 測試環境沒有 CSS.escape 可用，行為對齊 CSSOM 規範的常見案例。
export function escapeCssIdentifier(id) {
  const str = String(id);
  let result = '';
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    const isDigit = code >= 0x30 && code <= 0x39;
    if (i === 0 && isDigit) {
      result += `\\${code.toString(16)} `;
      continue;
    }
    if (i === 1 && isDigit && str[0] === '-') {
      result += `\\${code.toString(16)} `;
      continue;
    }
    if (i === 0 && ch === '-' && str.length === 1) {
      result += '\\-';
      continue;
    }
    const isAsciiAlpha = (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a);
    if (isDigit || isAsciiAlpha || ch === '_' || ch === '-' || code >= 0x80) {
      result += ch;
      continue;
    }
    result += `\\${ch}`;
  }
  return result;
}

// 屬性值（label[for]/name/attribute selector 的值）是 CSS 字串值而非識別字，
// 只需跳脫反斜線與雙引號，不必比照 escapeCssIdentifier 的識別字規則。
export function escapeAttrValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// 靜態屬性指紋：maxlength/type/pattern/autocomplete 是編譯時寫死的屬性，比隨頁面狀態
// 變動的文字標籤更穩定，優先於 label-relative（見 handoff 業界作法調研結論 優先序 2）。
// buttonValue：<input type=button/submit> 的 value 屬性是它的靜態按鈕文字（不像文字框的 value
// 會被使用者輸入內容污染），呼叫端只會替這類按鈕元素填這個 key，其他欄位一律是 undefined，
// 不影響既有指紋（見 issues/01-file-trigger-binding.md 手動驗收發現：新北市「新增檔案」按鈕
// 沒有 id/name/可用 label 文字，光靠 type=button 這個指紋在真實頁面上會命中 4 個同類型按鈕，
// 只是綁定當下巧合唯一，並非真正穩定）。
const FINGERPRINT_ATTRS = [
  { key: 'type', attr: 'type' },
  { key: 'maxLength', attr: 'maxlength' },
  { key: 'pattern', attr: 'pattern' },
  { key: 'autocomplete', attr: 'autocomplete' },
  { key: 'buttonValue', attr: 'value' }
];

export function buildAttributeFingerprint(elementInfo) {
  const tagName = (elementInfo.tagName || '').toLowerCase();
  if (!tagName) return null;
  const parts = [];
  for (const { key, attr } of FINGERPRINT_ATTRS) {
    const value = elementInfo[key];
    if (!value) continue;
    parts.push(`[${attr}="${escapeAttrValue(String(value))}"]`);
  }
  if (!parts.length) return null;
  return `${tagName}${parts.join('')}`;
}

function labelRelativeDescriptor(labelText, elementInfo, labelConfidence) {
  return {
    type: 'labelRelative',
    labelText,
    siblingIndexOfType: elementInfo.siblingIndexOfType ?? 0,
    tagName: elementInfo.tagName,
    labelConfidence
  };
}

// 依優先序（id > name > 屬性指紋 > 高信心 label > 低信心 label fallback）列出所有候選 selector，
// 供呼叫端（mapping-mode.js）逐一對 DOM 驗證命中數是否唯一（見 handoff 第 4 點：錄製當下就要檢查）。
// - trustedLabelText：只來自 label[for]/aria-label/aria-labelledby/placeholder 這類合法 label 來源。
// - fallbackLabelText：現有的 sibling-walk/parent 文字，信心較低，只在上述來源都沒有時才使用。
export function buildSelectorCandidates(elementInfo) {
  const { id, name } = elementInfo;
  const candidates = [];
  if (id && !isAutoNumberedId(id)) {
    candidates.push({ type: 'id', value: `#${escapeCssIdentifier(id)}` });
  }
  if (name) {
    candidates.push({ type: 'name', value: `[name="${name}"]` });
  }
  const fingerprint = buildAttributeFingerprint(elementInfo);
  if (fingerprint) {
    candidates.push({ type: 'attributeFingerprint', value: fingerprint });
  }
  const context = { nearbySelectedValues: elementInfo.nearbySelectedValues };
  const trustedLabel = elementInfo.trustedLabelText;
  if (trustedLabel && !isVolatileLabelText(trustedLabel, context)) {
    candidates.push(labelRelativeDescriptor(trustedLabel, elementInfo, 'high'));
  } else {
    // 只在合法 label 來源都沒有（或被判定不穩定）時，才退回信心較低的 sibling-walk fallback。
    const fallbackLabel = elementInfo.fallbackLabelText;
    if (fallbackLabel && !isVolatileLabelText(fallbackLabel, context)) {
      candidates.push(labelRelativeDescriptor(fallbackLabel, elementInfo, 'low'));
    }
  }
  // 最後手段：像台北市車牌左碼這種欄位，本身沒有任何 label/相鄰文字可用（緊鄰的元素是空的
  // wrapper，parentElement.textContent 也是空字串），連 low-confidence fallback 都生不出候選；
  // 唯一剩下的線索是「它是頁面上第幾個屬性指紋完全相同的元素」（DOM 順序中的序數）。
  // 只有呼叫端（mapping-mode.js）算出 attributeFingerprintOrdinal 時才產生這個候選，
  // 且排在所有 label 相關策略之後——序數比文字語意脆弱（頁面若動態插入/移除同指紋元素就會飄移）。
  if (fingerprint && Number.isInteger(elementInfo.attributeFingerprintOrdinal)) {
    candidates.push({
      type: 'indexedFingerprint',
      value: fingerprint,
      index: elementInfo.attributeFingerprintOrdinal
    });
  }
  return candidates;
}

// 單一最佳猜測（不驗證 DOM 命中數），維持給不需要逐一驗證唯一性的呼叫端使用。
export function buildSelectorDescriptor(elementInfo) {
  const candidates = buildSelectorCandidates(elementInfo);
  return candidates[0] || { type: 'unresolved' };
}

// 判斷某個候選元素（由呼叫端在 DOM 蒐集出 tagName/siblingIndexOfType/labelText）是否就是
// labelRelative descriptor 錄製當下指向的那個元素。務必連 siblingIndexOfType 一起比對——
// 只比對 labelText 會誤判「同一組裡的其他 sibling」（例如車牌兩個文字框共用同一個標籤文字、
// 違規時間的時/分兩個 select 共用同一個標籤文字）為同一個候選命中，導致唯一性驗證永遠判定
// 「命中不只 1 個」而擋下本來合法的欄位（這是本檔案 handoff 補強第一版的實作錯誤，已修正）。
export function labelRelativeCandidateMatches(candidateInfo, descriptor) {
  if (!descriptor || descriptor.type !== 'labelRelative') return false;
  const candidateTag = (candidateInfo.tagName || '').toLowerCase();
  const descriptorTag = (descriptor.tagName || '').toLowerCase();
  if (candidateTag !== descriptorTag) return false;
  const candidateIndex = candidateInfo.siblingIndexOfType ?? 0;
  const descriptorIndex = descriptor.siblingIndexOfType ?? 0;
  if (candidateIndex !== descriptorIndex) return false;
  return candidateInfo.labelText === descriptor.labelText;
}

export function detectFieldKind(elementInfo) {
  const tagName = (elementInfo.tagName || '').toLowerCase();
  if (tagName === 'select') return 'select';
  if (tagName === 'input' && elementInfo.type === 'file') return 'file';
  // Vuetify 純點選式 v-select（行政區/違規事實/牌照種類等）的顯示用 <input> 一律 readonly，
  // 賦值＋dispatchEvent 對它完全無效，要當 custom 處理；反之可打字的 v-autocomplete/v-combobox
  // （時/分/路名/違規日期等）readOnly 是 false，賦值真的有效，維持 plain（見 site-structure-notes.md
  // 「Vuetify 自訂下拉互動」一節：兩者外觀都是 .v-select__slot，唯一可靠的區分依據是 readOnly）。
  // 但這條規則必須加上「位於 Vuetify 容器內」才成立——否則會誤傷新北市「違規日期」這種傳統 MVC
  // 唯讀輸入框＋日曆按鈕（非 Vue），readOnly 純粹是防止手動打字、賦值＋dispatchEvent 其實完全有效
  // （見 .scratch/chrome-extension-p2-bugfixes/issues/02-*.md）。
  if (tagName === 'input' && elementInfo.readOnly && elementInfo.isInVuetifyWrapper) return 'custom';
  if (tagName === 'input' || tagName === 'textarea') return 'plain';
  return 'custom';
}
