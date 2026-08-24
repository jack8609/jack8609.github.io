# 12 — 高雄 evidenceImages 綁定

**What to build：** 在票 08 已建立的高雄 mapping profile 上，補上 `evidenceImages` 欄位的綁定，使用票 02 完成的「兩段式上傳確認鈕」引擎能力，讓選檔後能自動點擊「上傳」按鈕。

**Blocked by：** 02（兩段式上傳確認鈕引擎擴充）、08（高雄 mapping profile 其餘欄位）。

**Status:** ready-for-agent

## 驗收標準

- [ ] 對應模式綁定高雄 `fl_File`（multiple）與「上傳」確認按鈕。
- [ ] 使用者已用真實瀏覽器驗收：選擇檔案後自動點擊確認鈕，附件確實累加進清單。
- [ ] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

- 對應模式綁定檔案輸入與確認按鈕的實際操作流程。
- 選擇多個測試檔案，確認自動點擊上傳鈕後附件正確累加，留意是否需要等待站方 AJAX 回應才能繼續下一筆。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt。）
