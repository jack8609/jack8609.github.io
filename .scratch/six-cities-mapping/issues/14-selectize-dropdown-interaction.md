# 14 — selectize.js 自訂下拉互動模組（桃園 `selectize_Road`／`selectize_Road2` 專用）

**What to build：** 新增一個 selectize.js 專用的自訂下拉互動模組（仿 `extension/content/vuetify-dropdown-interaction.js` 的做法），讓 `kind: 'custom'` 欄位在元素位於 selectize.js 容器（`.selectize-control`）內時，走 selectize 專用的開啟選單／打字篩選／模擬點擊流程，而不是目前寫死給 Vuetify 用的流程。

**背景（2026-09-07 實作票券 07 時發現）：** `extension/content/fill-mode.js` 的 `applyItem()` 對 `kind === 'custom'` 一律呼叫 `fillVuetifyDropdown()`（`extension/content/vuetify-dropdown-interaction.js` + `extension/lib/vuetify-dropdown.js`），這條流程假設元素位於 Vuetify 的 `.v-select`/`.v-input` 結構、選單有 `role="listbox"`/`role="option"`。桃園「路名」欄位（`#selectize_Road-selectized`）是 selectize.js 元件，DOM 結構完全不同（`.selectize-control`/`.selectize-dropdown`/`.selectize-dropdown-content .option`，無 ARIA role）。

票券 07 的 mapping profile（`extension/profiles/taoyuan-mapping-profile-issue07.json`）已經把 `road` 綁定成 `kind: 'custom'`、`value: '#selectize_Road-selectized'`——這個綁定本身是對的（未來只要這張票補上 selectize.js 支援，road 就會自動開始正確運作，不需要重新綁定 profile），但**在這張票完成前，road 欄位永遠會落入「找不到符合的選項，請手動點選」**，等同於手動欄位。

**Blocked by：** None — 可獨立進行，不影響任何其他票券已完成的檔案區塊。

**Status:** ready-for-agent

## 實作方向（初步，實際請依當時 DOM 現況調整）

1. 用唯讀 chrome-devtools-mcp（或請使用者協助）在已通過驗證的桃園分頁上，實測 selectize.js 的開啟選單／打字篩選／點擊選項的真實互動細節（`.selectize-input` 點擊開啟、`.selectize-dropdown-content` 選項渲染時機、是否也有連動 disabled 等待邏輯，桃園是 `village`→`selectize_Road` 連動、`selectize_Road2` 是交叉路口的第二組）。
2. 新增 `extension/content/selectize-dropdown-interaction.js`（或類似命名），仿 `vuetify-dropdown-interaction.js` 的結構（開啟選單→等待渲染→打字篩選→在選項清單裡找文字→模擬點擊）。
3. `extension/content/fill-mode.js` 的 `isVuetifyDropdownFlow` 判斷需要擴充成「dropdown 元件類型偵測」（例如先偵測 `.selectize-control` 再偵測 Vuetify 容器），依偵測結果分流到對應的互動模組，兩者都不吻合時才維持原本 `kind==='plain'`/`'select'` 的處理。
4. 是否需要新增一個純函式（比照 `lib/vuetify-dropdown.js` 的 `findMatchingOptionIndex`）供 selectize 選項文字比對複用，或直接沿用現有的 `findMatchingOptionIndex`/`resolveOptionMatch`，依實際選項文字格式決定。

## 驗收標準

- [ ] 新增 selectize.js 專用互動模組，純決策邏輯（選項文字比對）有 contract test。
- [ ] `content/fill-mode.js` 能正確依元素所在的 dropdown 容器類型（Vuetify vs selectize.js）分流到對應模組，不影響既有 Vuetify 流程（既有 contract test 全綠）。
- [ ] 使用者已在已通過驗證的桃園分頁上，用票券 07 建立的 profile 實際測試「路名」欄位能自動選取正確選項。
- [ ] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

- 使用者需先自行完成桃園網站的身分驗證流程，並告知 AI 分頁已就緒，AI 才能開始唯讀觀察 selectize.js 互動細節。
- 完整測試「路名」欄位的自動選取是否正確（含連動載入等待、打字篩選、選項點擊）。

## 交給下一輪的起手 prompt

> 票券 07（桃園 mapping profile，除 violation/evidenceImages 外）已完成引擎擴充（`lib/address-parser.js` 新增 alley/lane/subLane/houseNumber/subNumber 解析、`lib/schema.js`/`lib/fill-engine.js`/`content/fill-mode.js`/`content/mapping-mode.js` 新增對應的 `city`/`alley`/`lane`/`subLane`/`houseNumber`/`subNumber` LOCATION_ROLES）與可直接匯入的 profile JSON（`extension/profiles/taoyuan-mapping-profile-issue07.json`），但「路名」（`selectize_Road`）欄位因為現有 `custom` kind 的互動邏輯是寫死給 Vuetify 用的，暫時無法自動選取，這張票（14）就是要補上這個能力。建議先讀 `.scratch/six-cities-mapping/spec.md`、`.scratch/six-cities-mapping/issues/07-taoyuan-mapping-profile.md`（含桃園實際 DOM 結構筆記）、`.scratch/six-cities-survey/taoyuan.md`，再讀 `extension/content/vuetify-dropdown-interaction.js` + `extension/lib/vuetify-dropdown.js` 作為要仿造的既有實作範例。
