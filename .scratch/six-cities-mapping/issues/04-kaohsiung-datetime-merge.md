# 04 — 引擎擴充：date/time 合併欄位（高雄 `#ContentPlaceHolder1_ViolationDate`）

**What to build：** 讓 `date`／`time` 兩個邏輯欄位可以合併寫入同一個 DOM 元素（高雄違規日期/時間欄位是單一 `<input class="Wdate">`，值格式 `YYYY-MM-DD HH:mm`）。引擎需要組出正確格式字串後，用 `plain` 賦值方式一次寫入，不能各自賦值兩次互相覆蓋。

**Blocked by：** None — can start immediately（2026-08-24 已用 chrome-devtools-mcp 對高雄已驗證分頁唯讀實測確認：直接對該欄位 `plain` 賦值＋dispatch input/change/blur 事件穩定寫入，未被攔截清空，未觸發 air-datepicker 彈窗，見 `.scratch/six-cities-survey/kaohsiung.md`）。

**Status:** ready-for-agent

## 已知技術事實（供實作參考，不需重新驗證）

- 底層是普通 `<input>`，直接賦值可行，**不需要**設計新的 custom widget 互動模組。
- 值格式固定為 `YYYY-MM-DD HH:mm`。

## 驗收標準

- [ ] `extension/lib/schema.js`：新增「複合欄位」的 selector item 結構，允許某個 item 同時宣告服務於 `date`＋`time`，有對應驗證邏輯與 contract test。
- [ ] `extension/lib/fill-engine.js`：新增邏輯讀取 `date`、`time` 兩個邏輯欄位各自的原始值，組成 `YYYY-MM-DD HH:mm` 格式字串（純函式，需有 contract test，涵蓋日期/時間補零等邊界案例）。
- [ ] `content/fill-mode.js`（或對應執行邏輯）確保這個複合 item 只被賦值一次（不會因為 `date` 迴圈跑一次、`time` 迴圈又跑一次而互相覆蓋）。
- [ ] 既有 extension contract test 全綠。
- [ ] `/code-review` 兩軸（Standards + Spec）皆已執行，沒有未處理的硬性違規。
- [ ] 使用者已用真實瀏覽器對高雄網站驗收：綁定此複合欄位後，確認自動填入的日期時間字串正確、格式符合站方要求。

## 需要使用者手動驗收的項目

- 對應模式綁定「複合欄位」的實際操作流程（需在瀏覽器裡親自完成）。
- 確認自動填入後欄位顯示的日期/時間值符合站方預期格式，且沒有觸發任何驗證錯誤或彈出 air-datepicker 選擇器。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt，需包含：這張票做了什麼、改了哪些檔案、下一步建議接哪張票（例如 13）、需要讀哪些背景文件。）
