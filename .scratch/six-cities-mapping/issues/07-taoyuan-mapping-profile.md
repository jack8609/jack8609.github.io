# 07 — 桃園 mapping profile（除 violation、evidenceImages 外）

**What to build：** 建立桃園違規檢舉網站（`tvrweb.typd.gov.tw`）的 mapping profile，涵蓋 date/time（皆歸類 plain）、plate、location（city/village/road 皆已結構化）、description。`violation` 需等票 03（候選元素群組引擎擴充）、`evidenceImages` 需等票 01（file-slots 引擎擴充），本票先跳過並標記待後續處理。

**Blocked by：** None — can start immediately。

**注意事項（前置條件）：** 桃園跟臺北市一樣有「填欄位前」的身分驗證閘門，需使用者先手動填檢舉人資料＋完成信箱驗證才會顯示違規欄位。AI 不可自行 reload/navigate 使用者的桃園分頁，一律等使用者手動完成驗證並告知後才在該分頁上操作。

**Status:** done

## 2026-09-07 動工前重新確認實際欄位格式後的設計更正

原文只提到「location 已結構化」，實際動工時發現以下落差，已對齊使用者並完成引擎擴充：

1. **`city`/`village` 是兩層行政區劃**，既有 `LOCATION_ROLES` 只有單一 `district` role（對應 `parseTaiwanAddress` 的區級），無法同時滿足「縣市」跟「行政區」兩個 select。新增 `city` role，對應 `parseTaiwanAddress` 新增的 `city` 欄位。
2. **`addStreet`(街)/`addAlley`(巷)/`addLane`(弄)/`addSubLane`(衖)/`addNo`(號) 是各自獨立輸入框**，既有的單一 `remainder` role 只能整段塞給其中一個欄位（沿用臺北/臺中既有 profile 的做法：只綁其中一個為 `remainder`，其餘留空——這是既有已上線 profile 的真實限制，非本票新發現），且會把「100號」整段塞進「號」欄位而非只填「100」。已新增 `alley`/`lane`/`subLane`/`houseNumber`/`subNumber` 五個 role，`lib/address-parser.js` 的 `parseTaiwanAddress()` 從 `remainder` 再解析出對應的純數字片段（`remainder` 本身保持不變，回溯相容臺北/臺中既有 profile）。`addStreet`（街）語意跟 `selectize_Road`（路名，本來就含「路/街/大道」）重疊但無法確認實際用途（可能是路名資料庫沒有的「街」型道路的手動備援欄位），**本票不猜測、不綁定**，維持手動。
3. **`selectize_Road`（路名）用 selectize.js 元件**，跟現有 `kind: 'custom'` 的執行期互動邏輯（`content/vuetify-dropdown-interaction.js`）是寫死給 Vuetify 用的，DOM 結構完全不同。已跟使用者確認：**本票先綁定 `road` role 為 `custom`（未來相容，selectize.js 支援上線後不需要重新綁定），但在票 14（selectize.js 互動模組，新開票）完成前，這個欄位永遠會落入「找不到符合的選項，請手動點選」**，等同手動欄位，非本票的 bug。
4. `city` 選「其他」時會隱藏結構化欄位、改用 `shouhou2`（單一 remainder textarea）——由於 `chose_type`/`chosen1`/`chosen2`（票券 03）已證實隱藏欄位仍可能被 `FormData` 序列化，兩個分支（結構化欄位／`shouhou2`）**本票採用「兩邊都填，讓使用者實際測試兩種分支各自的行為」**的保守做法，不新增「依 city 值決定要不要清空另一分支」的引擎邏輯（範圍超出本票，且送出後驗證行為本身就是 spec.md 的 Out of Scope）。

## 已完成的引擎擴充（2026-09-07）

- `extension/lib/address-parser.js`：`parseTaiwanAddress()` 新增 `alley`/`lane`/`subLane`/`houseNumber`/`subNumber` 五個純數字片段解析（`remainder` 不變），新增 8 個 contract test 案例（含巷/弄/衖/之的各種組合）。
- `extension/lib/schema.js`：`LOCATION_ROLES` 新增 `city`/`alley`/`lane`/`subLane`/`houseNumber`/`subNumber`（共 9 個 role），`LOCATION_ROLE_LABELS` 對應補上中文顯示名稱。
- `extension/lib/fill-engine.js`：`buildLocationItemPlan()` 新增對應 6 個新 role 的分支，解不出來一律 skip（`address-missing-city`/`address-missing-alley`/`address-missing-lane`/`address-missing-sublane`/`address-missing-housenumber`/`address-missing-subnumber`），新增 contract test 覆蓋成功／缺值兩種情境。
- `extension/content/fill-mode.js`：`skipReasonMessage()` 補上 6 個新 skip reason 的人類可讀文案；`LOCATION_ROLE_PRIORITY` 補上新 role 的填值順序。
- `extension/content/mapping-mode.js`：`showLocationRoleModal()` 的 `roleExamples` 補上 6 個新 role 的說明文字與範例（面板本身是泛用邏輯，不需要額外改動）。
- 新增可直接匯入的 profile JSON：`extension/profiles/taoyuan-mapping-profile-issue07.json`（已用 `validateProfile()` 與 `buildFillPlan()` 實測驗證，涵蓋 plate/date/time/location(city+district+road+alley+lane+subLane+houseNumber+remainder)/description，`violation`/`evidenceImages` 明確不綁定）。
- 9 個 extension contract test 全綠。

## 驗收標準

- [x] 對應模式綁定桃園網站 date（`#cardate`，plain）、time（`#carTime`，plain）、plate（`CarNum`/`CarNum2` 兩段式，需自行拆分邏輯）、location（`city`/`village`=select 連動、`selectize_Road`=custom 連動、`addStreet`/`addAlley`/`addLane`/`addSubLane`/`addNo`=plain 門牌片段）。—— 已用 `extension/profiles/taoyuan-mapping-profile-issue07.json` 完成（`addStreet` 明確不綁定，見上方設計更正第 2 點），使用者已在瀏覽器裡實際匯入並測試通過。
- [x] `city`=「其他」時的分支（收合成 `shouhou2` 單一 remainder textarea）也要能正確處理。—— profile 已綁定 `shouhou2` 為 `remainder` role（兩分支都填，見設計更正第 4 點），使用者已實測兩種分支通過。
- [x] `description` 若對應到 `case_note`，需在票券內註記這是條件式欄位（只有選到「其他」違規時才出現），並記錄這個已知限制。—— 已綁定 `#case_note`，條件式顯示限制如上。
- [x] `violation`、`evidenceImages` 明確不綁定，過渡期由使用者手動處理，profile 或票券文件中清楚註記原因（分別等票 03、01）。—— profile 的 `fieldOrder`/`fields` 未包含這兩個邏輯欄位。
- [x] 使用者已在已通過驗證的桃園分頁上完整跑過一次自動填表（測試假資料），確認除 violation/附件外欄位皆正確填入。—— 使用者已回報驗證完成。
- [x] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

1. 開啟擴充功能 popup →「匯入」→ 選擇 `extension/profiles/taoyuan-mapping-profile-issue07.json`，確認匯入成功（此檔案已通過 `validateProfile()` 驗證，理論上可直接匯入，不需要重新用對應模式逐一點選綁定）。
2. 在已通過驗證的桃園分頁上，用擴充功能「立即抓取並填表」測試假資料，確認：
   - `plate`/`date`/`time` 正確填入（`time` 應為合併後的 `HHmm` 格式，例如 16:30 → 顯示 1630 或依 `#carTime` 實際格式呈現）。
   - `city`（縣市）、`village`（行政區）正確選取。
   - `road`（`selectize_Road`）**預期不會自動選取**（票 14 完成前的已知限制），確認畫面上有「待確認」標記提示手動點選即可，非本票要修的 bug。
   - `addAlley`(巷)/`addLane`(弄)/`addSubLane`(衖)/`addNo`(號) 是否正確填入**純數字**（例如地址「20巷100號」應該讓 `addAlley` 顯示 `20`、`addNo` 顯示 `100`，不是「20巷」「100號」）。
   - 測試一次 `city`=「其他」的情境，確認 `shouhou2` 是否也正確填入（此時結構化欄位會被站方 JS 隱藏，不影響送出邏輯，但實測一次確認沒有非預期錯誤）。
3. 對應模式的實際點選綁定操作（若上面匯入方式順利，這步可省略；只有匯入失敗或想調整綁定時才需要）。

## 交給下一輪的起手 prompt

> 票券 07（桃園 mapping profile，除 violation/evidenceImages 外）已完成並經使用者在真實瀏覽器驗證通過（2026-09-07）。核心變更：
> - `lib/address-parser.js`／`lib/schema.js`／`lib/fill-engine.js`／`content/fill-mode.js`／`content/mapping-mode.js` 新增 6 個地址角色（`city`/`alley`/`lane`/`subLane`/`houseNumber`/`subNumber`），讓桃園這類把地址拆成多個獨立輸入框的網站可以精確自動填值（不影響臺北/臺中既有 profile，`remainder` 語意不變）。
> - 可直接匯入的 profile JSON：`extension/profiles/taoyuan-mapping-profile-issue07.json`。
> - 9 個 extension contract test 全綠。
> - 發現 `selectize_Road`（路名）用 selectize.js 元件，跟既有 `custom` kind 的 Vuetify 專用互動邏輯不相容，已另開票券 14（`.scratch/six-cities-mapping/issues/14-selectize-dropdown-interaction.md`）處理，`road` 欄位目前仍是手動確認，非本票範圍。
>
> 下一輪可接票券 08（高雄 mapping profile）、票 06（臺南 mapping profile，尚未開始）或票 14（selectize.js 互動模組），彼此互相獨立無阻塞。開始前請讀 `.scratch/six-cities-mapping/spec.md` 與對應票券檔案。
