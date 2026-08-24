# 08 — 高雄 mapping profile（除 date/time、evidenceImages 外）

**What to build：** 建立高雄違規檢舉網站（`policemail.kcg.gov.tw`）的 mapping profile，涵蓋 plate（拆兩段）、location（district=select，road/remainder 無法拆分只給單一 plain）、description、violation（大類→細項二層連動）、「轄區分局」select。`date`/`time`（合併欄位）需等票 04、`evidenceImages`（兩段式上傳）需等票 02，本票先跳過並標記待後續處理。

**Blocked by：** None — can start immediately.

**Status:** ready-for-agent

## 驗收標準

- [ ] 對應模式綁定高雄網站 `plate`（`LicenseNo`/`LicenseNo2` 兩段式）、`location`（district=select，road/remainder 合併為單一 plain）、「轄區分局」select（語意獨立，非 location 的一部分，需確認在 schema 中如何歸類，若無合適欄位可標記為不綁定並記錄原因）。
- [ ] `violation` 二層連動（大類→細項）能正確處理，選項清單依大類動態變化。
- [ ] `date`/`time`、`evidenceImages` 明確不綁定，過渡期由使用者手動處理，profile 或票券文件中清楚註記原因（分別等票 04、02）。
- [ ] 使用者已用真實瀏覽器完整跑過一次自動填表（測試假資料），確認除 date/time/附件外欄位皆正確填入。
- [ ] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

- 對應模式的實際綁定操作（高雄網站無填欄位前的驗證閘門，但擴充功能 popup 互動仍需使用者親自完成）。
- 完整跑一次自動填表流程，特別驗證違規大類→細項的二層連動情境。
- 確認「轄區分局」欄位的處理方式符合預期（綁定或明確不綁定）。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt，需包含：這張票做了什麼、下一步建議接哪張票（例如 12、13）、需要讀哪些背景文件。）
