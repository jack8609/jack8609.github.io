# 13 — 高雄 date/time 綁定

**What to build：** 在票 08 已建立的高雄 mapping profile 上，補上 `date`/`time` 欄位的綁定，使用票 04 完成的「複合欄位」引擎能力，讓兩個邏輯欄位能合併寫入 `#ContentPlaceHolder1_ViolationDate` 這一個 DOM 元素。

**Blocked by：** 04（date/time 合併欄位引擎擴充）、08（高雄 mapping profile 其餘欄位）。

**Status:** ready-for-agent

## 驗收標準

- [ ] 對應模式綁定此複合欄位（同時服務 `date`＋`time`）。
- [ ] 使用者已用真實瀏覽器驗收：自動填入的日期時間字串格式正確、未觸發驗證錯誤或意外彈出 air-datepicker。
- [ ] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

- 對應模式綁定複合欄位的實際操作流程。
- 確認自動填入結果符合站方預期格式，且欄位旁「檢舉日期距違規終了日期逾 7 日不予舉發」的限制沒有被誤觸。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt。）
