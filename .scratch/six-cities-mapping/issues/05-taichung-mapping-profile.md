# 05 — 臺中 mapping profile（全欄位）

**What to build：** 建立臺中違規檢舉網站（`tvrweb.police.taichung.gov.tw`）的完整 mapping profile，涵蓋 date/time/plate/location/description/violation/evidenceImages 全部欄位。`plate`/`location`/`description`/`violation`/`evidenceImages` 皆落在既有 `plain`/`select`/`custom`＋`LOCATION_ROLES` 語意內，`evidenceImages` 跟臺北市模式同構（hidden `<input multiple>` + 觸發按鈕，現有 `file-trigger` 的 `assign-all` 分支可直接用）。

**2026-08-24 動工前重新確認實際欄位格式後更正**（原文誤判為「不需要任何引擎擴充」）：臺中 `date`/`time` 的實際 DOM 格式跟臺北/新北都不同，需要 `fill-engine.js` 兩處小型純函式擴充，範圍遠小於 spec 的「引擎擴充 1~4」（不碰 `schema.js`/`mapping-mode.js`/`evidence-upload.js`），已跟使用者對齊：

- **date**：單一 `plain` 輸入框，`maxlength="7"`，格式是民國年緊湊數字、無分隔符（例如西元 2026-08-24 → `1150824`）。`applyDateTransform()` 新增第 4 種轉換 `westernToMinguoCompact`；`mapping-mode.js` 的 `promptDateTransform()` 新增對應第 4 個選項（三選一→四選一）。
- **time**：單一 `plain` 輸入框，`maxlength="4"`，格式是時分合併 4 碼 24 小時制數字（例如 16:30 → `1630`），不是臺北/新北那種時/分兩個獨立元素。`buildItemPlan()` 的 `time` 分支需依「該欄位 selector 陣列長度」分流：綁 1 個 item 時合併 `hour+minute`；綁 2 個時維持現有位置對應行為（臺北/新北不受影響）。

**Blocked by：** None — can start immediately.

**Status:** ready-for-agent

## 驗收標準

- [ ] `fill-engine.js` 新增 `westernToMinguoCompact` 日期轉換與 `time` 欄位單一 item 合併賦值邏輯，並補 contract test（含 hour/minute 其中之一缺值時應回傳 `no-source-value`、不猜測的邊界案例）。
- [ ] `mapping-mode.js` 的 `promptDateTransform()` 新增「民國緊湊數字格式（例如 1150824）」選項。
- [ ] 對應模式（mapping-mode）綁定臺中網站全部 7 個邏輯欄位，其中 `location` 依 `district`/`road`/`remainder` role 正確標記，`evidenceImages` 綁定為 `file-trigger`，`date` 綁定時選擇「民國緊湊數字格式」，`time` 只綁定 1 個元素。
- [ ] `violation` 欄位（條文具體、非籠統分類）能正確用文字比對/模糊比對選到選項。
- [ ] 使用者已用真實瀏覽器完整跑過一次自動填表（測試假資料），確認所有欄位皆正確填入（`date` 為 7 碼民國數字、`time` 為 4 碼合併數字）、`evidenceImages` 能自動上傳多個檔案。
- [ ] 重新整理頁面後，已綁定的 mapping profile 仍在。
- [ ] 既有 + 新增 extension contract test 全綠。

## 需要使用者手動驗收的項目

- 對應模式的實際綁定操作（點選臺中網站上的每個欄位，逐一設定角色/kind），這步驟必須在瀏覽器裡親自完成。
- 完整跑一次「測試填入假資料」的自動填表流程，確認所有欄位（含附件多檔上傳）都正確填入，特別留意 `violation` 條文選取是否正確命中。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt，需包含：這張票做了什麼、下一步建議接哪張票、需要讀哪些背景文件。）
