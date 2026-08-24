# 05 — 臺中 mapping profile（全欄位）

**What to build：** 建立臺中違規檢舉網站（`tvrweb.police.taichung.gov.tw`）的完整 mapping profile，涵蓋 date/time/plate/location/description/violation/evidenceImages 全部欄位。全部欄位皆落在既有 `plain`/`select`/`custom`＋`LOCATION_ROLES` 語意內，`evidenceImages` 跟臺北市模式同構（hidden `<input multiple>` + 觸發按鈕，現有 `file-trigger` 的 `assign-all` 分支可直接用），**不需要**任何引擎擴充。

**Blocked by：** None — can start immediately.

**Status:** ready-for-agent

## 驗收標準

- [ ] 對應模式（mapping-mode）綁定臺中網站全部 7 個邏輯欄位，其中 `location` 依 `district`/`road`/`remainder` role 正確標記，`evidenceImages` 綁定為 `file-trigger`。
- [ ] `violation` 欄位（條文具體、非籠統分類）能正確用文字比對/模糊比對選到選項。
- [ ] 使用者已用真實瀏覽器完整跑過一次自動填表（測試假資料），確認所有欄位皆正確填入、`evidenceImages` 能自動上傳多個檔案。
- [ ] 重新整理頁面後，已綁定的 mapping profile 仍在。
- [ ] 既有 extension contract test 全綠（本票券預期不需要新增/修改程式碼，只是新增 mapping profile 資料，若過程中發現既有引擎有 bug 才需要修程式碼並補測試）。

## 需要使用者手動驗收的項目

- 對應模式的實際綁定操作（點選臺中網站上的每個欄位，逐一設定角色/kind），這步驟必須在瀏覽器裡親自完成。
- 完整跑一次「測試填入假資料」的自動填表流程，確認所有欄位（含附件多檔上傳）都正確填入，特別留意 `violation` 條文選取是否正確命中。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt，需包含：這張票做了什麼、下一步建議接哪張票、需要讀哪些背景文件。）
