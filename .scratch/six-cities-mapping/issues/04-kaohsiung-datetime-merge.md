# 04 — 引擎擴充：date/time 合併欄位（高雄 `#ContentPlaceHolder1_ViolationDate`）

**What to build：** 讓 `date`／`time` 兩個邏輯欄位可以合併寫入同一個 DOM 元素（高雄違規日期/時間欄位是單一 `<input class="Wdate">`，值格式 `YYYY-MM-DD HH:mm`）。引擎需要組出正確格式字串後，用 `plain` 賦值方式一次寫入，不能各自賦值兩次互相覆蓋。

**Blocked by：** None — can start immediately（2026-08-24 已用 chrome-devtools-mcp 對高雄已驗證分頁唯讀實測確認：直接對該欄位 `plain` 賦值＋dispatch input/change/blur 事件穩定寫入，未被攔截清空，未觸發 air-datepicker 彈窗，見 `.scratch/six-cities-survey/kaohsiung.md`）。

**Status:** implemented-pending-user-verification

## 已知技術事實（供實作參考，不需重新驗證）

- 底層是普通 `<input>`，直接賦值可行，**不需要**設計新的 custom widget 互動模組。
- 值格式固定為 `YYYY-MM-DD HH:mm`。

## 驗收標準

- [x] `extension/lib/schema.js`：新增「複合欄位」的 selector item 結構，允許某個 item 同時宣告服務於 `date`＋`time`，有對應驗證邏輯與 contract test。
- [x] `extension/lib/fill-engine.js`：新增邏輯讀取 `date`、`time` 兩個邏輯欄位各自的原始值，組成 `YYYY-MM-DD HH:mm` 格式字串（純函式，需有 contract test，涵蓋日期/時間補零等邊界案例）。
- [x] `content/fill-mode.js`（或對應執行邏輯）確保這個複合 item 只被賦值一次（不會因為 `date` 迴圈跑一次、`time` 迴圈又跑一次而互相覆蓋）。
- [x] 既有 extension contract test 全綠。
- [x] `/code-review` 兩軸（Standards + Spec）皆已執行，沒有未處理的硬性違規。
- [ ] 使用者已用真實瀏覽器對高雄網站驗收：綁定此複合欄位後，確認自動填入的日期時間字串正確、格式符合站方要求。

## 需要使用者手動驗收的項目

- 對應模式綁定「複合欄位」的實際操作流程（需在瀏覽器裡親自完成）：在高雄網站的對應模式面板，`date` 欄位這一列會出現「+ 綁定日期/時間合併欄位（選填）」按鈕，點下去後點選頁面上的 `#ContentPlaceHolder1_ViolationDate` 欄位即可；綁定後 `date`、`time` 兩列狀態文字都會顯示同一個元素＋`[日期時間合併]` 標記，且兩列原本的「重新綁定」「+ 新增元素」按鈕會變成停用（要改用這顆專屬按鈕，或先按「清除」再重新綁定，清除任一邊都會兩邊一起清掉）。
- 確認自動填入後欄位顯示的日期/時間值符合站方預期格式（`YYYY-MM-DD HH:mm`，例如 `2026-08-01 13:45`），且沒有觸發任何驗證錯誤或彈出 air-datepicker 選擇器。

## 交給下一輪的起手 prompt

> 票券 04（高雄 date/time 合併欄位）的引擎與 UI 部分已實作完成並通過 `/code-review` 兩軸：
>
> - `extension/lib/schema.js`：新增 `DATETIME_ROLES`/`DATETIME_ROLE_LABELS`/`findDateTimeMergeItem()`，並在 `validateProfile()` 新增跨欄位結構檢查——`date`/`time` 若任一邊綁了 `role: 'datetime-merge'` 的合併項，兩邊就都必須恰好綁定 1 個、且 `value` 必須相同（指向同一個 DOM 元素）。
> - `extension/lib/fill-engine.js`：新增純函式 `buildDateTimeMergeValue(sourceData)`（組出 `YYYY-MM-DD HH:mm`，自行 padStart 補零，任一部分缺值回傳空字串），`buildItemPlan()` 偵測到 `role === 'datetime-merge'`（不論掛在 `date` 或 `time` 欄位下）一律呼叫這個函式計算完整合併字串。
> - `extension/content/fill-mode.js`：`run()` 新增 `handledDateTimeMergeKeys` Set，依 `item.value` 序列化去重，確保同一個合併 item 即使同時出現在 `date`、`time` 兩個欄位的 selector 陣列裡也只會被 `applyItem` 賦值一次（避免 change 事件重複觸發）。
> - `extension/content/mapping-mode.js`：只在 `date` 欄位這一列新增專屬「+ 綁定日期/時間合併欄位（選填）」/「重新綁定...」按鈕，點選後強制 `kind: 'plain'`（不套用 `detectFieldKind`／不問日期格式 transform），把同一個 item 同時寫進 `profile.fields.date` 與 `profile.fields.time`（各自 `selector: [item]`）；`clearField()` 也同步更新為「清除其中一邊時兩邊一起清掉」；`appendSelectorDescription()` 新增顯示 `[日期時間合併]` 標記。
> - 新增/更新 contract test：`extension/tests/extension-schema-contract.test.mjs`（跨欄位結構驗證的合法/不合法案例）、`extension/tests/extension-fill-engine-contract.test.mjs`（`buildDateTimeMergeValue` 含補零/缺值/`'0'`邊界案例，以及 `buildFillPlan` 對 `date`/`time` 兩邊產生相同合併值的整合案例）。9 個既有 extension contract test（含新增案例）全綠。
>
> **尚未完成**：驗收標準最後一項——使用者需在真實瀏覽器對高雄網站完整走一次「綁定合併欄位→測試填入假資料/實際自動填表→確認 `YYYY-MM-DD HH:mm` 字串正確寫入、未觸發 air-datepicker 彈窗」的流程，通過後才把票券狀態改成 done。
>
> 下一步可接票券 05~13 剩餘尚未完成的部分（見 repo memory `/memories/repo/chrome-extension-project.md` 的「2026-08-24 已完成 spec.md + 13 張票券」段落，票券 05 臺中 mapping profile 也還差真實瀏覽器綁定+驗收；09~13 是依賴引擎擴充 01~04 完成後才能補綁的各都欄位，04 完成後 13（高雄 date/time 欄位補綁）就不再被阻塞）。需要讀的背景文件：`.scratch/six-cities-mapping/spec.md`、本票券檔案、`.scratch/six-cities-survey/kaohsiung.md`（高雄逐都調查報告）。
