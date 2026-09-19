// selectize.js 自訂下拉執行期互動（桃園 selectize_Road/selectize_Road2 專用，見票券 14：
// .scratch/six-cities-mapping/issues/14-selectize-dropdown-interaction.md）。
//
// 跟 content/vuetify-dropdown-interaction.js 的整體流程一樣（開啟選單→打字篩選→在選項清單裡
// 用文字找到目標→模擬點擊），但 DOM 結構與互動細節完全不同（已用真實桃園檢舉頁
// https://tvrweb.typd.gov.tw:3444/TTPB/D0102 選好行政區觸發 AJAX 載入路名選項後實測驗證）：
//   - 沒有 ARIA role，選單結構固定是 `.selectize-control > .selectize-input`（含觸發用
//     `<input>`）+ `.selectize-dropdown > .selectize-dropdown-content .option[data-selectable]`，
//     三者都是同一個 `.selectize-control` 底下的巢狀節點，不像 Vuetify 選單是飄到 `#app` 底下
//     用 aria-owns 連結，直接在 triggerRoot 內 querySelector 就能找到，不需要額外解析 id。
//   - 選項是一開啟就整批渲染（實測路名選單一次渲染全部 540+ 筆），不像 Vuetify 只渲染约 20 筆，
//     但村里剛選定、AJAX 還在載入選項資料的短暫期間點擊觸發輸入框不會開啟選單（`.selectize-dropdown`
//     維持 `display:none`）——且觸發用 `<input>` 全程不會變成 `disabled`，無法比照 Vuetify 用
//     disabled 屬性等待連動完成，因此改成「點擊→檢查是否開啟且已有選項→沒開啟就重試點擊」的
//     輪詢式開啟，而不是單次點擊後純等待。
//   - 打字篩選必須同時 dispatch `input` 與 `keyup` 事件，只 dispatch `input` 選單完全不會篩選
//     （selectize 內部的篩選觸發綁在 keyup，跟 Vuetify 只需要 `input` 事件不同）。
//   - 選項文字比對沿用 `lib/vuetify-dropdown.js` 的 `findMatchingOptionIndex`——純文字比對邏輯
//     跟元件技術無關（路段中文/阿拉伯數字互轉、精確/子字串比對），不需要為 selectize 另外複製
//     一份一樣的規則。

import { findMatchingOptionIndex } from '../lib/vuetify-dropdown.js';
import { setNativeValue } from './selector-resolve.js';

function dispatchFullClick(el) {
  const opts = { bubbles: true, cancelable: true, view: window, composed: true, button: 0 };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, opts));
  }
}

function resolveInput(triggerRoot) {
  return triggerRoot.querySelector('input');
}

function resolveDropdownElement(triggerRoot) {
  return triggerRoot.querySelector('.selectize-dropdown');
}

function resolveDropdownContent(triggerRoot) {
  return triggerRoot.querySelector('.selectize-dropdown-content');
}

function waitFor(predicate, { timeoutMs = 2000, intervalMs = 50 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const value = predicate();
      if (value) {
        resolve(value);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

// 村里剛選定、路名選項資料還在 AJAX 載入中的短暫期間點擊不會開啟選單，且沒有 disabled 屬性可以
// 等待（已用真實桃園分頁驗證，見檔案開頭說明），改成輪詢式重試點擊，直到選單開啟且已渲染出選項。
export async function openSelectizeMenu(triggerRoot, { timeoutMs = 2000, retryIntervalMs = 150 } = {}) {
  const input = resolveInput(triggerRoot);
  const dropdown = resolveDropdownElement(triggerRoot);
  const content = resolveDropdownContent(triggerRoot);
  if (!input || !dropdown || !content) return null;

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    dispatchFullClick(input);
    const ready = await waitFor(
      () => (dropdown.style.display === 'block' && content.querySelector('[data-selectable]') ? dropdown : null),
      { timeoutMs: retryIntervalMs }
    );
    if (ready) return ready;
  }
  return null;
}

// 在已開啟的選單裡用文字找到目標 option 並模擬點擊；找不到時選單維持開啟、不做任何動作，
// 由呼叫端決定要不要提示使用者或關閉選單。
export function selectSelectizeOption(contentEl, targetText) {
  const options = Array.from(contentEl.querySelectorAll('[data-selectable]'));
  const texts = options.map((el) => el.textContent || '');
  const index = findMatchingOptionIndex(texts, targetText);
  if (index === -1) return { matched: false };
  dispatchFullClick(options[index]);
  return { matched: true, index, text: texts[index] };
}

// 打字篩選必須同時 dispatch input 與 keyup（只 dispatch input 選單不會篩選，見檔案開頭說明）。
function typeToFilter(input, text) {
  setNativeValue(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

// 整合：開啟選單→打字篩選→用文字找到目標→點擊。回傳結果讓呼叫端可以判斷是否要重試或標記失敗。
// filterText（選填，預設等於 targetText）：跟 fillVuetifyDropdown 的同名參數用途一致——「路名」
// 打進篩選框的文字要去掉段號前綴，避免段號數字寫法（中文/阿拉伯數字）跟輸入不同的正確選項被篩掉。
export async function fillSelectizeDropdown(triggerRoot, targetText, { timeoutMs = 2000, filterText } = {}) {
  const dropdown = await openSelectizeMenu(triggerRoot, { timeoutMs });
  if (!dropdown) return { matched: false, reason: 'menu-not-opened' };
  const content = resolveDropdownContent(triggerRoot);
  const input = resolveInput(triggerRoot);
  if (input) {
    typeToFilter(input, filterText ?? targetText);
    await waitFor(() => {
      const texts = Array.from(content.querySelectorAll('[data-selectable]')).map((el) => el.textContent || '');
      return findMatchingOptionIndex(texts, targetText) !== -1 || null;
    }, { timeoutMs });
  }
  const result = selectSelectizeOption(content, targetText);
  return result.matched ? result : { matched: false, reason: 'option-not-found' };
}
