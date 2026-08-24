# 01 — 引擎擴充：固定多槽位附件上傳（新 kind `file-slots`）

**What to build：** 讓 `evidenceImages` 欄位可以綁定「頁面載入時就固定存在 N 個獨立、非 multiple 的原生 `<input type=file>`」這種上傳模式（臺南 6 槽 `Upfile1`~`Upfile6`、桃園 5 槽 `files1`~`files5`），使用者選好 N 個檔案後，擴充功能能依序把第 i 個檔案指定給第 i 個綁定的 input。這是繼 `file-trigger` 之後的第三種上傳模式，不影響既有兩種模式。

**Blocked by：** None — can start immediately.

**Status:** ready-for-agent

## 驗收標準

- [ ] `extension/lib/schema.js` 新增 `'file-slots'` kind，加進 `FIELD_KINDS`；`validateProfile` 允許 `evidenceImages` 欄位在此 kind 下綁定多個 selector item（不像 `file-trigger` 限制只能 1 個），並有對應 contract test。
- [ ] `extension/content/mapping-mode.js` 對 `evidenceImages` 欄位新增「僅 `file-slots` kind 解除單一 item 限制」的分支：使用者可以依序點選多個固定 `<input type=file>`，逐一加入 selector 陣列；`file-trigger` 既有的「只能 1 個 item」限制不受影響。
- [ ] `extension/content/evidence-upload.js` 新增「依序把第 i 個使用者選擇的檔案指定給第 i 個綁定 input」的直接賦值邏輯（純函式部分要有 contract test）：每個 input 各自 `DataTransfer` 賦值＋dispatch `change`；若選擇的檔案數超過綁定槽位數，多出的檔案標記為無法自動上傳，不猜測塞進不存在的槽位；若選擇的檔案數少於槽位數，只填有對應檔案的槽位。
- [ ] 既有 extension contract test 全綠（含新增測試）。
- [ ] `/code-review` 兩軸（Standards + Spec）皆已執行，沒有未處理的硬性違規。
- [ ] 使用者已用真實瀏覽器（臺南或桃園其中一都）驗收：綁定 N 個固定附件 input 後，選擇 2~3 個檔案，確認依序正確填入對應槽位，且重整頁面後 mapping 綁定仍在。

## 需要使用者手動驗收的項目

- 對應模式（mapping-mode）的實際點選流程：依序點選臺南/桃園頁面上的多個固定附件 input，確認面板正確記錄成多個 `file-slots` item（這步驟涉及擴充功能 popup/content script 互動，chrome-devtools-mcp 無法操作，需使用者親自在瀏覽器裡點）。
- 真正選擇 2~3 個檔案觸發自動上傳，確認檔案正確出現在對應的臺南/桃園附件欄位（不要用真實個資檔名，用測試圖片/影片即可）。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt，需包含：這張票做了什麼、改了哪些檔案、下一步建議接哪張票（例如 09/11）、需要讀哪些背景文件。）
