// DOM 選擇器解析共用邏輯：把錄製時存下的 selector item（id/name/屬性指紋/labelRelative/
// indexedFingerprint）解回實際 DOM 元素。content/mapping-mode.js（測試填入假資料、重新編輯時
// 顯示狀態）與 content/fill-mode.js（P2 自動填表）都需要一模一樣的解析規則——這段邏輯本身相當
// 細節（label 信心分級、附近選中值判斷、sibling 序數比對），過去在兩處各自維護一份時就已經
// 出過真正的 bug（見 extension/PLAN.md「P2 實作備忘」與 repo memory），因此抽成這個共用模組，
// 不再各自維護一份。
import { isVolatileLabelText, escapeAttrValue, labelRelativeCandidateMatches } from '../lib/selector.js';

// 判斷元素是否位於 Vuetify 元件容器內，供 mapping-mode.js（錄製 handlePick）與 fill-mode.js
// （填表）共用同一份判斷邏輯，避免像 setNativeValue/FIELD_LABELS 那樣各自維護出分岔
// （見 .scratch/chrome-extension-p2-bugfixes/issues/02-*.md）。純唯讀、非 Vuetify 容器的輸入框
// （例如新北市「違規日期」傳統 MVC 唯讀輸入框）不算在內，才能被 detectFieldKind() 判成可直接賦值。
export function hasVuetifyWrapper(el) {
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('.v-input, .v-select, .v-autocomplete');
}

// 比 hasVuetifyWrapper 更精確：只認「下拉/自動完成」容器（.v-select/.v-autocomplete），拿掉
// .v-input——純文字 Vuetify 欄位（車牌/巷/弄/號）的 wrapper 也有 .v-input class 但沒有這兩個，
// 用來判斷 fill-mode.js 是否該走 Vuetify 點擊選單流程，不會誤傷純文字欄位（見
// .scratch/chrome-extension-dropdown-bugfixes/issues/01-*.md）。
export function hasVuetifyDropdownWrapper(el) {
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('.v-select, .v-autocomplete');
}

// select2 外掛渲染的假 UI（.select2-container）永遠插在原本 <select> 的正後方 sibling，
// 不是子節點也不是祖先節點，往內 querySelector／往外 closest 找 input/select/textarea 都碰不到
// 這種「相鄰 sibling」關係（新北市行政區/路名欄位，見
// .scratch/chrome-extension-dropdown-bugfixes/issues/02-*.md）。點擊落在 select2 假 UI 內時，
// 改成往這個容器的 previousElementSibling 找真正的 <select> 當錄製對象。只查 .select2-container
// 就夠了：select2 的既定 DOM 結構裡 .select2-selection 一定是 .select2-container 的子孫節點，
// closest('.select2-container') 從任何內層點擊目標（含 .select2-selection）往上找都會命中同一個容器。
export function resolveSelect2Select(el) {
  if (!el || typeof el.closest !== 'function') return null;
  const container = el.closest('.select2-container');
  if (!container) return null;
  const prev = container.previousElementSibling;
  return prev && prev.tagName === 'SELECT' ? prev : null;
}

// 附近下拉元件（原生 select 或 Vuetify v-select）目前顯示的選中值，用來判斷候選文字
// 是不是其實在描述「目前選中值」而非固定 label（見台北市 plate 欄位「一般(汽、機車)」地雷）。
export function collectNearbySelectedValues(el) {
  const values = new Set();
  let ancestor = el.parentElement;
  let hops = 0;
  while (ancestor && hops < 6) {
    ancestor.querySelectorAll('select').forEach((sel) => {
      const opt = sel.options && sel.options[sel.selectedIndex];
      const text = opt && opt.textContent && opt.textContent.trim();
      if (text) values.add(text);
    });
    ancestor.querySelectorAll('.v-select__selection, .v-select__selection-text').forEach((node) => {
      const text = node.textContent && node.textContent.trim();
      if (text) values.add(text);
    });
    ancestor = ancestor.parentElement;
    hops += 1;
  }
  return Array.from(values);
}

// 只信任 aria-labelledby/aria-label/label[for]（含包裹式）/placeholder 這幾種合法 label 來源，
// 近似 W3C Accessible Name 演算法的簡化版；隨便抓 previousElementSibling 文字的邏輯移到
// fallbackLabelText()，只在這裡都找不到時才當低信心備援使用。
export function accessibleLabelText(el, context) {
  const labelledbyAttr = el.getAttribute && el.getAttribute('aria-labelledby');
  if (labelledbyAttr) {
    const text = labelledbyAttr
      .split(/\s+/)
      .map((id) => {
        const ref = document.getElementById(id);
        return ref ? ref.textContent.trim() : '';
      })
      .filter(Boolean)
      .join(' ');
    if (text && !isVolatileLabelText(text, context)) return text;
  }
  const ariaLabel = el.getAttribute && el.getAttribute('aria-label');
  if (ariaLabel) {
    const trimmed = ariaLabel.trim();
    if (trimmed && !isVolatileLabelText(trimmed, context)) return trimmed;
  }
  if (el.id) {
    const labelFor = document.querySelector(`label[for="${escapeAttrValue(el.id)}"]`);
    const text = labelFor && labelFor.textContent.trim();
    if (text && !isVolatileLabelText(text, context)) return text;
  }
  const closestLabel = el.closest && el.closest('label');
  const closestLabelText = closestLabel && closestLabel.textContent.trim();
  if (closestLabelText && !isVolatileLabelText(closestLabelText, context)) return closestLabelText;
  const placeholder = el.getAttribute && el.getAttribute('placeholder');
  if (placeholder) {
    const trimmed = placeholder.trim();
    if (trimmed && !isVolatileLabelText(trimmed, context)) return trimmed;
  }
  return '';
}

// 低信心備援：沿 DOM 順序往前找第一段看起來穩定的文字，只有合法 label 來源都沒有時才用。
export function fallbackLabelText(el, context) {
  let node = el.previousElementSibling;
  let hops = 0;
  while (node && hops < 4) {
    const text = node.textContent && node.textContent.trim();
    if (text && !isVolatileLabelText(text, context)) return text.slice(0, 40);
    node = node.previousElementSibling;
    hops += 1;
  }
  const parentText = el.parentElement ? el.parentElement.textContent.trim() : '';
  if (parentText && !isVolatileLabelText(parentText, context)) return parentText.slice(0, 40);
  return '';
}

export function siblingIndexOfType(el) {
  if (!el.parentElement) return 0;
  const sameTag = Array.from(el.parentElement.children).filter((c) => c.tagName === el.tagName);
  return sameTag.indexOf(el);
}

// 用跟錄製當下驗證唯一性相同的比對規則，把已存檔的 labelRelative descriptor 解回實際 DOM 元素。
export function resolveLabelRelative(descriptor) {
  const tagSelector = descriptor.tagName ? descriptor.tagName.toLowerCase() : '*';
  const candidates = document.querySelectorAll(tagSelector);
  for (const candidate of candidates) {
    const context = { nearbySelectedValues: collectNearbySelectedValues(candidate) };
    const label = descriptor.labelConfidence === 'low'
      ? fallbackLabelText(candidate, context)
      : accessibleLabelText(candidate, context);
    const candidateInfo = { tagName: candidate.tagName, siblingIndexOfType: siblingIndexOfType(candidate), labelText: label };
    if (labelRelativeCandidateMatches(candidateInfo, descriptor)) return candidate;
  }
  return null;
}

// evidenceImages 專用（見 PLAN_B.md「已定案設計」第 2 點）：綁定的是「加入/新增檔案」觸發按鈕本身，
// 跟真正的 <input type="file"> 是同一個容器下的 DOM 手足，不是內外關係。從觸發元素往上逐層找祖先，
// 找到「子樹內剛好只有 1 個 file input」的那一層就回傳該 input（台北市會停在 .v-card__text、新北市
// 會停在 .divContent，同一套邏輯兩站通用，不寫死容器 class/id）；每一層都不是剛好 1 個（0 個或
// 多個都算不明確）就繼續往上找，找到文件頂端仍找不到就回傳 null，交由呼叫端標記待確認。
export function resolveFileTriggerInput(triggerEl) {
  let ancestor = triggerEl && triggerEl.parentElement;
  while (ancestor) {
    const fileInputs = ancestor.querySelectorAll('input[type="file"]');
    if (fileInputs.length === 1) return fileInputs[0];
    ancestor = ancestor.parentElement;
  }
  return null;
}

// 把已存檔的 selector item（字串型 id/name/屬性指紋，或 labelRelative/indexedFingerprint 物件）
// 解回實際 DOM 元素；找不到回傳 null，呼叫端（測試填入／自動填表）看到 null 就一律標記待確認。
export function resolveSelectorItem(item) {
  if (!item) return null;
  if (typeof item === 'string') {
    try { return document.querySelector(item); } catch (err) { return null; }
  }
  if (item.type === 'labelRelative') return resolveLabelRelative(item);
  if (item.type === 'indexedFingerprint') {
    try { return document.querySelectorAll(item.value)[item.index] || null; } catch (err) { return null; }
  }
  if (item.value) {
    try { return document.querySelector(item.value); } catch (err) { return null; }
  }
  return null;
}

// 用原生 value setter 繞過 Vue 可能覆寫的 property，確保 dispatch input 事件時 el.value 已經是
// 新值（Vue 2 監聽的是原生 DOM 事件，不是 property 本身）。mapping-mode.js（測試填入假資料）與
// fill-mode.js（自動填表）都需要，抽成共用函式避免兩處各自維護一份一樣的實作。
export function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  if (descriptor && descriptor.set) descriptor.set.call(el, value);
  else el.value = value;
}
