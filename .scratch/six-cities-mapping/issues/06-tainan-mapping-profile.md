# 06 — 臺南 mapping profile（除 evidenceImages 外）

**What to build：** 建立臺南違規檢舉網站（`tr.tnpd.gov.tw`）的 mapping profile，涵蓋 date/time/location/description/violation。`evidenceImages`（6 個固定原生 input）需等票 01（file-slots 引擎擴充）完成後才綁定，本票先跳過並標記待後續處理。

**Blocked by：** None — can start immediately.

**Status:** ready-for-agent

## 驗收標準

- [ ] 對應模式綁定臺南網站 date（select，僅近 7 天選項）、time（時/分兩個獨立 select）、location（district=select，road=custom 連動，remainder=plain）、violation（select，清單隨 district 動態變化）。
- [ ] `description` 欄位對應到 `Subject`（單行主旨欄），並在票券內記錄「語意上是主旨非詳細描述」這個已知限制，不需要在本票解決。
- [ ] `evidenceImages` 明確不綁定，過渡期由使用者手動上傳附件，profile 或票券文件中要清楚註記原因（等票 01）。
- [ ] 使用者已用真實瀏覽器完整跑過一次自動填表（測試假資料），確認除附件外欄位皆正確填入，尤其 district→road 連動選單、violation 清單隨 district 變化的情境。
- [ ] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

- 對應模式的實際綁定操作（臺南網站無身分驗證閘門，可由 AI 或使用者操作，但擴充功能 popup 互動仍需使用者親自完成）。
- 完整跑一次自動填表流程，特別驗證「先選 district 才出現 road/violation 選項」的連動情境是否正確處理。
- 確認附件欄位確實維持手動狀態，不會被誤填或報錯。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt，需包含：這張票做了什麼、下一步建議接哪張票（例如 09）、需要讀哪些背景文件。）
