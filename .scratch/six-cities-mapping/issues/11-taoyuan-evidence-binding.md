# 11 — 桃園 evidenceImages 綁定

**What to build：** 在票 07 已建立的桃園 mapping profile 上，補上 `evidenceImages` 欄位的綁定，使用票 01 完成的 `file-slots` 引擎能力，讓 5 個固定原生 input（`files1`~`files5`）能自動依序填入使用者選擇的檔案。

**Blocked by：** 01（file-slots 引擎擴充）、07（桃園 mapping profile 其餘欄位）。

**Status:** ready-for-agent

## 驗收標準

- [ ] 對應模式依序綁定桃園 5 個固定附件 input 為 `file-slots` kind。
- [ ] 使用者已在已通過驗證的桃園分頁上驗收：選擇 2~3 個測試檔案，確認依序正確填入對應槽位。
- [ ] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

- 對應模式綁定 5 個附件 input 的實際點選流程。
- 選擇多個測試檔案，確認自動依序填入正確槽位。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt。）
