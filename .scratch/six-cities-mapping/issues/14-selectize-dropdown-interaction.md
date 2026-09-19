# 14 — selectize.js 自訂下拉互動模組（桃園 `selectize_Road`／`selectize_Road2` 專用）

**What to build：** 新增一個 selectize.js 專用的自訂下拉互動模組（仿 `extension/content/vuetify-dropdown-interaction.js` 的做法），讓 `kind: 'custom'` 欄位在元素位於 selectize.js 容器（`.selectize-control`）內時，走 selectize 專用的開啟選單／打字篩選／模擬點擊流程，而不是目前寫死給 Vuetify 用的流程。

**背景（2026-09-07 實作票券 07 時發現）：** `extension/content/fill-mode.js` 的 `applyItem()` 對 `kind === 'custom'` 一律呼叫 `fillVuetifyDropdown()`（`extension/content/vuetify-dropdown-interaction.js` + `extension/lib/vuetify-dropdown.js`），這條流程假設元素位於 Vuetify 的 `.v-select`/`.v-input` 結構、選單有 `role="listbox"`/`role="option"`。桃園「路名」欄位（`#selectize_Road-selectized`）是 selectize.js 元件，DOM 結構完全不同（`.selectize-control`/`.selectize-dropdown`/`.selectize-dropdown-content .option`，無 ARIA role）。

票券 07 的 mapping profile（`extension/profiles/taoyuan-mapping-profile-issue07.json`）已經把 `road` 綁定成 `kind: 'custom'`、`value: '#selectize_Road-selectized'`——這個綁定本身是對的（未來只要這張票補上 selectize.js 支援，road 就會自動開始正確運作，不需要重新綁定 profile），但**在這張票完成前，road 欄位永遠會落入「找不到符合的選項，請手動點選」**，等同於手動欄位。

**Blocked by：** None — 可獨立進行，不影響任何其他票券已完成的檔案區塊。

**Status:** done（2026-09-19，已用 chrome-devtools-mcp `--categoryExtensions=true --autoConnect` 在真實桃園分頁上操作真實擴充功能驗證通過，見下方完成紀錄）

## 實作方向（初步，實際請依當時 DOM 現況調整）

1. 用唯讀 chrome-devtools-mcp（或請使用者協助）在已通過驗證的桃園分頁上，實測 selectize.js 的開啟選單／打字篩選／點擊選項的真實互動細節（`.selectize-input` 點擊開啟、`.selectize-dropdown-content` 選項渲染時機、是否也有連動 disabled 等待邏輯，桃園是 `village`→`selectize_Road` 連動、`selectize_Road2` 是交叉路口的第二組）。
2. 新增 `extension/content/selectize-dropdown-interaction.js`（或類似命名），仿 `vuetify-dropdown-interaction.js` 的結構（開啟選單→等待渲染→打字篩選→在選項清單裡找文字→模擬點擊）。
3. `extension/content/fill-mode.js` 的 `isVuetifyDropdownFlow` 判斷需要擴充成「dropdown 元件類型偵測」（例如先偵測 `.selectize-control` 再偵測 Vuetify 容器），依偵測結果分流到對應的互動模組，兩者都不吻合時才維持原本 `kind==='plain'`/`'select'` 的處理。
4. 是否需要新增一個純函式（比照 `lib/vuetify-dropdown.js` 的 `findMatchingOptionIndex`）供 selectize 選項文字比對複用，或直接沿用現有的 `findMatchingOptionIndex`/`resolveOptionMatch`，依實際選項文字格式決定。

## 驗收標準

- [x] 新增 selectize.js 專用互動模組，純決策邏輯（選項文字比對）有 contract test。—— 新增 `extension/content/selectize-dropdown-interaction.js`，選項文字比對直接沿用 `lib/vuetify-dropdown.js` 的 `findMatchingOptionIndex`（純文字比對邏輯跟元件技術無關，已有 contract test 覆蓋，不重複造一份），DOM 互動邏輯依專案慣例不寫自動化測試。另外新增 `hasSelectizeDropdownWrapper`（`content/selector-resolve.js`）並補上 contract test。
- [x] `content/fill-mode.js` 能正確依元素所在的 dropdown 容器類型（Vuetify vs selectize.js）分流到對應模組，不影響既有 Vuetify 流程（既有 contract test 全綠）。—— 先偵測 `.selectize-control`，命中則走 selectize 流程；沒命中才落入原本 `kind==='custom' || hasVuetifyDropdownWrapper(el)` 的 Vuetify 判斷，兩者都不吻合才回到 `plain`/`select` 處理。
- [x] 使用者已在已通過驗證的桃園分頁上，用票券 07 建立的 profile 實際測試「路名」欄位能自動選取正確選項。—— AI 用 chrome-devtools-mcp 操作真實已安裝的「違規檢舉小幫手」擴充功能（`trigger_extension_action`＋「立即抓取並填表」）完成，見下方完成紀錄，非人工手動點擊。
- [x] 既有 extension contract test 全綠。—— `Get-ChildItem extension/tests/*.test.mjs | ForEach-Object { node $_.FullName }` 9 個測試檔全部通過。

## 完成紀錄（2026-09-19）

- 新增檔案：`extension/content/selectize-dropdown-interaction.js`（`openSelectizeMenu`/`selectSelectizeOption`/`fillSelectizeDropdown`）。
- 修改：`extension/content/selector-resolve.js`（新增 `hasSelectizeDropdownWrapper`）、`extension/content/fill-mode.js`（分流邏輯＋import selectize 模組）、`extension/manifest.json`（`web_accessible_resources` 補上新檔案——**這是本票實測時抓到的真實 bug**：漏補會導致 `import()` 被 CSP 靜默擋下、整個自動填表 IIFE 因未捕捉的 rejection 直接中止、頁面上完全沒有任何錯誤訊息或彈窗，非常像「沒反應」，已記錄進 repo memory）、`extension/tests/extension-selector-resolve-contract.test.mjs`（新增 `hasSelectizeDropdownWrapper` 測試，TDD red→green 確認過）。
- 真實 DOM 實測發現（已用真實桃園分頁驗證，供未來維護參考）：
  - selectize.js 的選項資料只存在 selectize 元件內部的 JS 狀態（`$(el)[0].selectize.options`），不會同步回原本隱藏 `<select>` 的 `<option>` DOM（即使 AJAX 已完成，隱藏 select 永遠只有 1 個空 option），所以不能用「讀隱藏 select 的 options.length」判斷資料是否載入完成。
  - 觸發用 `<input>` 全程不會變成 `disabled`，無法比照 Vuetify 用 disabled 屬性判斷連動載入是否完成；改採「點擊→檢查選單是否已開啟且已有選項→沒開啟就重試點擊」的輪詢式開啟（見 `openSelectizeMenu` 的 `retryIntervalMs`），已實測驗證行政區剛選定、AJAX 還在載入的短暫期間單次點擊不會開啟選單，但重試後會成功。
  - 打字篩選必須同時 dispatch `input` 與 `keyup` 事件，只 dispatch `input`（Vuetify 只需要這個）選單完全不會篩選。
  - 選單/選項結構是巢狀在同一個 `.selectize-control` 內（不像 Vuetify 飄到 `#app` 底下用 aria-owns 連結），直接在 triggerRoot 內 querySelector 即可，不需要額外解析 id。
  - 選單一開啟就整批渲染全部選項（實測路名選單一次渲染 540+ 筆），不像 Vuetify 只渲染約 20 筆需要打字篩選才找得到超出範圍的選項；但仍保留打字篩選以維持跟 Vuetify 流程一致的行為與 `filterText`／段號前綴處理。
- 瀏覽器驗收：AI 用 chrome-devtools-mcp（`--categoryExtensions=true --autoConnect`）連到使用者已開啟且已通過驗證的桃園分頁與已安裝的擴充功能，先在來源分頁（`https://jack8609.github.io/`，`#ve-road`）填入測試地址「桃園市桃園區三民路一段100號」，再 `trigger_extension_action` 觸發 popup、點擊「立即抓取並填表」，最後直接讀 DOM 確認：隱藏 `<select id="selectize_Road">` 的 `value` 為 `4`、`selectedIndex` 對應文字為「三民路一段」，且畫面上 selectize UI 也正確顯示「三民路一段」為已選項目——不是只看填表結果彈窗的文字摘要。**未點擊送出**，避免真的送出一筆政府檢舉案。
- code review（`/code-review`，diff 基準 `HEAD` = commit `7399cc7`）：Standards 與 Spec 兩軸皆無硬性違規；Standards 軸提出兩個判斷題（`selectize-dropdown-interaction.js` 的 `waitFor`/`dispatchFullClick` 與 Vuetify 版本重複、`fill-mode.js` 兩個 dropdown 流程分支骨架相似）——皆屬本 repo 既有「per-file 顯式複製優於抽象共用」慣例下的合理選擇，未進一步重構。

## 需要使用者手動驗收的項目

無——本票已由 AI 用 chrome-devtools-mcp 操作真實擴充功能在真實桃園分頁上完成端到端驗證（見上方完成紀錄），不需要使用者再手動重複測試。若想抽查，可自行在桃園分頁選好行政區後點「路名」欄位確認選單仍可正常開啟/篩選（不受本票異動影響）。

## 交給下一輪的起手 prompt

> 票券 07（桃園 mapping profile，除 violation/evidenceImages 外）已完成引擎擴充（`lib/address-parser.js` 新增 alley/lane/subLane/houseNumber/subNumber 解析、`lib/schema.js`/`lib/fill-engine.js`/`content/fill-mode.js`/`content/mapping-mode.js` 新增對應的 `city`/`alley`/`lane`/`subLane`/`houseNumber`/`subNumber` LOCATION_ROLES）與可直接匯入的 profile JSON（`extension/profiles/taoyuan-mapping-profile-issue07.json`），但「路名」（`selectize_Road`）欄位因為現有 `custom` kind 的互動邏輯是寫死給 Vuetify 用的，暫時無法自動選取，這張票（14）就是要補上這個能力。建議先讀 `.scratch/six-cities-mapping/spec.md`、`.scratch/six-cities-mapping/issues/07-taoyuan-mapping-profile.md`（含桃園實際 DOM 結構筆記）、`.scratch/six-cities-survey/taoyuan.md`，再讀 `extension/content/vuetify-dropdown-interaction.js` + `extension/lib/vuetify-dropdown.js` 作為要仿造的既有實作範例。
