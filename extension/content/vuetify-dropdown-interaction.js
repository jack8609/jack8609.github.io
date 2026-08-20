// Vuetify v-select/v-autocomplete 執行期互動（尚未串接進任何 Phase，是給未來 P2「依欄位對應表
// 填入 plain/select/custom 值」預先驗證好的可用模組）。
//
// 根本原因（已用真實台北市檢舉頁 https://prsweb.tcpd.gov.tw/#/New 的「違規事實」欄位實測驗證，
// 見 extension/reference/site-structure-notes.md）：這類元件畫面上顯示的 <input> 只是呈現層，
// 值恆為空字串；真正的選中值存在元件內部一個 <input type="hidden"> 與 Vue reactive data，
// 兩者都不能靠原生賦值＋dispatchEvent 更新，唯一有效的方式是模擬使用者操作：
//   1. 若觸發用 `<input>` 目前是 disabled（連動欄位，例如「路名」要等「行政區」選定後才非同步
//      載入自己的選項，實測約 500ms），先等它變成非 disabled 再繼續，不然點擊會被 Vuetify 忽略
//      （已用真實台北市分頁驗證：`disabled` 期間點擊 `.v-select__slot` 選單完全不會打開，逾時後
//      永遠找不到選項——這是連動欄位「第一次載入就填表」偶發失敗、但「已經連動過一次再填一次」
//      就穩定成功的根本原因，見 spec.md）
//   2. 點擊觸發區塊（巢狀的 `.v-select__slot`，不是外層 `.v-input__slot`——實測只點外層不會開啟選單）
//   3. 等待浮動選單（`role="listbox"`，掛在 `#app` 底下，不是原本欄位旁邊）出現且已渲染出選項
//   4. 若觸發用 `<input>` 可打字（非 readOnly），把目標文字用原生 value setter 賦值進去並 dispatch
//      `input` 事件，觸發 Vuetify 內建即時篩選——部分選單（時/分、路名）內容是捲動選單容器才動態
//      補渲染，一開始只渲染約 20 筆，超出初始渲染範圍的目標單看「當下已渲染選項」永遠找不到；
//      打字篩選後選單瞬間只剩下匹配項，不需要捲動（已用真實台北市分頁驗證，見 spec.md）。
//   5. 在（已篩選過的）選項（`role="option"`）裡用文字找到目標
//   6. 模擬點擊該選項（實測 `el.click()` 不穩定，需要完整 pointerdown/mousedown/pointerup/mouseup/click
//      事件序列才能可靠觸發 Vuetify 的選取邏輯）
//
// 選單節點本身是點開才動態建立、重整就飄移的全域計數器 id（`list-N`），不應該也不需要在錄製
// 當下存成 selector——這點跟已經放棄的「錨定下拉選單彈出視窗」調查結論一致，這裡永遠是執行期
// 即時查詢，不依賴任何預先存好的選單 selector。

import { findMatchingOptionIndex } from '../lib/vuetify-dropdown.js';
import { setNativeValue } from './selector-resolve.js';

function dispatchFullClick(el) {
  const opts = { bubbles: true, cancelable: true, view: window, composed: true, button: 0 };
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    el.dispatchEvent(new MouseEvent(type, opts));
  }
}

function resolveClickTarget(triggerRoot) {
  return triggerRoot.querySelector('.v-select__slot') || triggerRoot;
}

function resolveMenuElement(triggerRoot) {
  const slotWithAriaOwns = triggerRoot.querySelector('.v-input__slot[aria-owns]') || triggerRoot.querySelector('[aria-owns]');
  const listId = slotWithAriaOwns && slotWithAriaOwns.getAttribute('aria-owns');
  return listId ? document.getElementById(listId) : null;
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

// 連動欄位（路名依賴行政區、交叉路口路名依賴交叉路口行政區）在依賴項選定後，會先進入短暫的
// disabled 狀態等非同步載入自己的選項，這段期間點擊沒有效果，必須先等 disabled 解除。
function waitUntilInteractable(triggerRoot, { timeoutMs } = {}) {
  const input = triggerRoot.querySelector('input');
  if (!input) return Promise.resolve(true);
  return waitFor(() => !input.disabled || null, { timeoutMs });
}

// triggerRoot：欄位外層 wrapper（`.v-select`/`.v-input`，即 selector 錄製邏輯應該指向的觸發元件容器）。
// 回傳已渲染出選項的選單元素（`role="listbox"`），逾時回傳 null。
export async function openVuetifyMenu(triggerRoot, { timeoutMs = 2000 } = {}) {
  await waitUntilInteractable(triggerRoot, { timeoutMs });
  dispatchFullClick(resolveClickTarget(triggerRoot));
  return waitFor(() => {
    const menu = resolveMenuElement(triggerRoot);
    return menu && menu.querySelector('[role="option"]') ? menu : null;
  }, { timeoutMs });
}

// 在已開啟的選單裡用文字找到目標 option 並模擬點擊；找不到時選單維持開啟、不做任何動作，
// 由呼叫端決定要不要提示使用者或關閉選單。
export function selectVuetifyOption(menuEl, targetText) {
  const options = Array.from(menuEl.querySelectorAll('[role="option"]'));
  const texts = options.map((el) => el.textContent || '');
  const index = findMatchingOptionIndex(texts, targetText);
  if (index === -1) return { matched: false };
  dispatchFullClick(options[index]);
  return { matched: true, index, text: texts[index] };
}

// 觸發用 <input> 是可打字篩選（非 readOnly）才回傳，readOnly 的純點選式欄位（違規事實/行政區/
// 交叉路口行政區）回傳 null，維持現有「掃描當下已渲染選項」的行為，不做打字篩選這一步。
function resolveTypeaheadInput(triggerRoot) {
  const input = triggerRoot.querySelector('input');
  return input && !input.readOnly ? input : null;
}

// 用共用的原生 value setter（setNativeValue，跟 selector-resolve.js 給 mapping-mode.js／
// fill-mode.js 賦值用的是同一份實作）賦值＋dispatch input 事件，觸發 Vuetify 內建即時篩選。
// 已在台北市「時」（23）與「路名」（環河北路一段）真實驗證：篩選後選單瞬間只剩下匹配項，
// 不需要捲動選單容器就能找到超出初始渲染範圍的目標。
function typeToFilter(input, text) {
  setNativeValue(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// 整合：開啟選單→（可打字欄位）先打字觸發篩選→用文字找到目標→點擊。回傳結果讓呼叫端可以
// 判斷是否要重試或標記失敗。
//
// filterText（選填，預設等於 targetText）：實際打進篩選框的文字，跟用來找 option 的 targetText
// 分開。原因：Vuetify 內建篩選是對選項顯示文字做子字串比對，若把含「幾段」的完整路名（例如
// 「文化路1段」）打進去篩選，只要目標選項的段號數字寫法（中文/阿拉伯數字）跟輸入不同（例如
// 選項顯示是「文化路一段」），該選項就會被篩選到不渲染出來——這不是 findMatchingOptionIndex
// 選錯，是候選清單裡從頭就沒有它，雙向 canonicalize 完全沒有機會執行。呼叫端（fill-mode.js）
// 對「路名」這類子元素改傳去掉段號的路名前綴當 filterText（見 lib/address-parser.js 的
// extractRoadNamePrefix），篩出同路名各種段別/數字寫法的選項，讓 findMatchingOptionIndex 有
// 較寬的候選清單可以挑出真正吻合段號的那一個。時/分/違規事實等其餘欄位不受影響（不傳就是
// 沿用原本行為：篩選文字＝比對文字）。
export async function fillVuetifyDropdown(triggerRoot, targetText, { timeoutMs = 2000, filterText } = {}) {
  const menu = await openVuetifyMenu(triggerRoot, { timeoutMs });
  if (!menu) return { matched: false, reason: 'menu-not-opened' };
  const typeaheadInput = resolveTypeaheadInput(triggerRoot);
  if (typeaheadInput) {
    typeToFilter(typeaheadInput, filterText ?? targetText);
    // 篩選前選單本來就已經渲染出（未篩選的）選項，不能只等「隨便有一個 option 存在」——那個
    // predicate 一開始就恆為真，等於沒等到。直接等到篩選後的清單真的含有目標文字才算數，
    // 逾時就不再等，交給下面的 selectVuetifyOption 用當下清單做最後一次比對（找不到就回報失敗）。
    await waitFor(() => {
      const texts = Array.from(menu.querySelectorAll('[role="option"]')).map((el) => el.textContent || '');
      return findMatchingOptionIndex(texts, targetText) !== -1 || null;
    }, { timeoutMs });
  }
  const result = selectVuetifyOption(menu, targetText);
  return result.matched ? result : { matched: false, reason: 'option-not-found' };
}
