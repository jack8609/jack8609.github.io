# 10 — 桃園 violation 欄位綁定

**What to build：** 在票 07 已建立的桃園 mapping profile 上，補上 `violation` 欄位的綁定，使用票 03 完成的「候選元素群組」引擎能力，讓 `chose_type`（動態/靜態）與 `chosen1`/`chosen2` 能依來源違規文字自動判斷並正確選取。

**Blocked by：** 03（候選元素群組引擎擴充）、07（桃園 mapping profile 其餘欄位）。

**Status:** ready-for-agent

## 驗收標準

- [ ] 對應模式綁定 `chose_type` 為控制型 select、`chosen1`/`chosen2` 為互斥候選 select。
- [ ] 使用者已在已通過驗證的桃園分頁上分別測試「命中動態違規清單」「命中靜態違規清單」兩種情境，確認自動切換與選取正確，且另一候選 select 的值有被清空。
- [ ] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

- 對應模式綁定控制型/候選 select 群組的實際操作流程。
- 分別用「動態違規」「靜態違規」兩類測試文字跑一次自動填表，確認選取結果正確。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt。）
