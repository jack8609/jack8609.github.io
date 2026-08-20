// Vuetify 自訂下拉（v-select/v-autocomplete）選單內「用文字找目標 option」的純決策邏輯。
// 為什麼需要這個：這類元件無法用原生 <select>/<input> 賦值＋dispatchEvent 填值——選中狀態存在
// Vue 內部 reactive data，畫面上的 <input> 一律維持空字串，必須改成「開啟選單→在選項清單裡
// 用文字找到目標→模擬點擊」。DOM 擷取（開啟選單、讀出選項文字、模擬點擊）由呼叫端
// （content/vuetify-dropdown-interaction.js，尚未串接進任何 Phase）完成，這裡只負責純文字比對。
// 實測紀錄見 extension/reference/site-structure-notes.md「Vuetify 自訂下拉互動」一節。
import { canonicalizeRoadSegmentNumerals } from './address-parser.js';

export function normalizeOptionText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

// optionTexts：選單內每個 [role="option"] 的原始文字（依畫面順序）。targetText：欲選取的顯示文字。
// 找不到回傳 -1。優先精確比對（正規化空白後相等），再試路段中文數字/阿拉伯數字互轉後比對
// （文化路一段 vs 文化路1段，兩個目標網站的下拉選單用的數字寫法可能不同，見 lib/address-parser.js
// 的 canonicalizeRoadSegmentNumerals 註解），找不到才退而求其次做子字串包含比對。
export function findMatchingOptionIndex(optionTexts, targetText) {
  const target = normalizeOptionText(targetText);
  if (!target) return -1;
  const normalized = optionTexts.map(normalizeOptionText);
  const exactIndex = normalized.indexOf(target);
  if (exactIndex !== -1) return exactIndex;
  const canonicalTarget = canonicalizeRoadSegmentNumerals(target);
  const canonicalIndex = normalized.findIndex((text) => canonicalizeRoadSegmentNumerals(text) === canonicalTarget);
  if (canonicalIndex !== -1) return canonicalIndex;
  return normalized.findIndex((text) => text && (text.includes(target) || target.includes(text)));
}
