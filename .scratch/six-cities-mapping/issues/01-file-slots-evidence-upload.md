# 01 — 引擎擴充：固定多槽位附件上傳（新 kind `file-slots`）

**What to build：** 讓 `evidenceImages` 欄位可以綁定「頁面載入時就固定存在 N 個獨立、非 multiple 的原生 `<input type=file>`」這種上傳模式（臺南 6 槽 `Upfile1`~`Upfile6`、桃園 5 槽 `files1`~`files5`），使用者選好 N 個檔案後，擴充功能能依序把第 i 個檔案指定給第 i 個綁定的 input。這是繼 `file-trigger` 之後的第三種上傳模式，不影響既有兩種模式。

**Blocked by：** None — can start immediately.

**Status:** ready-for-agent

## 驗收標準

- [x] `extension/lib/schema.js` 新增 `'file-slots'` kind，加進 `FIELD_KINDS`；`validateProfile` 允許 `evidenceImages` 欄位在此 kind 下綁定多個 selector item（不像 `file-trigger` 限制只能 1 個），並有對應 contract test。
- [x] `extension/content/mapping-mode.js` 對 `evidenceImages` 欄位新增「僅 `file-slots` kind 解除單一 item 限制」的分支：使用者可以依序點選多個固定 `<input type=file>`，逐一加入 selector 陣列；`file-trigger` 既有的「只能 1 個 item」限制不受影響。
- [x] `extension/content/evidence-upload.js` 新增「依序把第 i 個使用者選擇的檔案指定給第 i 個綁定 input」的直接賦值邏輯（純函式部分要有 contract test）：每個 input 各自 `DataTransfer` 賦值＋dispatch `change`；若選擇的檔案數超過綁定槽位數，多出的檔案標記為無法自動上傳，不猜測塞進不存在的槽位；若選擇的檔案數少於槽位數，只填有對應檔案的槽位。
- [x] 既有 extension contract test 全綠（含新增測試）。
- [x] `/code-review` 兩軸（Standards + Spec）皆已執行，沒有未處理的硬性違規。
- [ ] 使用者已用真實瀏覽器（臺南或桃園其中一都）驗收：綁定 N 個固定附件 input 後，選擇 2~3 個檔案，確認依序正確填入對應槽位，且重整頁面後 mapping 綁定仍在。

## 需要使用者手動驗收的項目

- 對應模式（mapping-mode）的實際點選流程：依序點選臺南/桃園頁面上的多個固定附件 input，確認面板正確記錄成多個 `file-slots` item（這步驟涉及擴充功能 popup/content script 互動，chrome-devtools-mcp 無法操作，需使用者親自在瀏覽器裡點）。
- 真正選擇 2~3 個檔案觸發自動上傳，確認檔案正確出現在對應的臺南/桃園附件欄位（不要用真實個資檔名，用測試圖片/影片即可）。

## 交給下一輪的起手 prompt

> 票券 01（file-slots 固定多槽位附件上傳）程式碼已實作完成，`/code-review` 兩軸都跑過並修掉唯一一個雙軸皆抓到的硬性問題，只剩使用者真實瀏覽器手動驗收待完成。
>
> **改了哪些檔案：**
> - `extension/lib/schema.js`：`FIELD_KINDS` 新增 `'file-slots'`，`validateProfile` 沿用「無特別限制」即允許多個 item（跟 `file-trigger` 固定 1 個的限制分開判斷）。
> - `extension/content/mapping-mode.js`：`handlePick()` 新增判斷——`evidenceImages` 欄位點擊到的元素若本身就是 `<input type="file">`，記錄成 `kind: 'file-slots'`（不像 `file-trigger` 走祖先鏈反推，直接記錄點到的 input 本身）；點到其他元素（例如按鈕）仍記錄成 `file-trigger`。`file-slots` 允許用「+ 新增元素」依序累加多個 item（僅在既有綁定也全部是 `file-slots` 時才累加），`file-trigger` 維持原本「只能 1 個」限制不受影響。`addBtn.disabled`／「測試填入假資料」摘要文字（新增 `summarizeFileSlotsTestFill`）都依 kind 分流。
> - `extension/content/evidence-upload.js`：新增純函式 `planFileSlotsInjection(slotCount, files)`（依槽位數/檔案數決定每個檔案對應第幾個槽位，溢出的檔案只回報數量不猜測塞入）與 DOM 副作用函式 `injectFilesIntoSlots(slotInputs, files)`（依規劃結果逐一呼叫既有的 `injectFilesIntoInput`）。
> - `extension/content/fill-mode.js`：`resolveEvidenceUploadTarget()` 新增 `file-slots` 分支（逐一 `resolveWithRetry` 解析每個綁定的 input，找不到齊全就標記待確認但不中斷），回傳值改成 `{ mode, ... }` 讓 `uploadEvidenceFiles()` 依 `mode`（`file-slots`／`file-trigger`）分流處理；順手清掉一段因為新增「未選檔案」提前 return 而變成永遠走不到的死碼分支（`code-review` 雙軸都有抓到同一處）。
> - `extension/lib/fill-engine.js`：`buildItemPlan` 的 kind guard 補上 `'file-slots'`，跟 `'file'`/`'file-trigger'` 一樣一律 `unsupported-kind`（這個欄位走專用流程，不套用一般 `applyItem`）。
> - 對應的 3 個 contract test 檔案（schema/evidence-upload/fill-engine）都補了新測試；另外**順手修正**一個跟本票無關、原本就會失敗的既有斷言（`extension-schema-contract.test.mjs` 的 `LOGICAL_FIELDS` 期望順序跟 commit `825bdea`「調整對應面板順序」之後的實際順序不符），這樣「既有 extension contract test 全綠」才成立，9 個 extension contract test 目前全綠。
>
> **尚未完成：** 驗收標準最後一項——使用者需在臺南或桃園頁面用真實瀏覽器綁定 N 個固定附件 input（依序點選多個 `<input type=file>`），選 2~3 個檔案確認依序正確填入對應槽位，且重整頁面後 mapping 綁定仍在。完成後才能把本票標成 done。
>
> **下一步建議：** 票券 01 done 後可接票券 02（高雄兩段式上傳確認鈕）或票券 03（桃園違規事項候選元素群組），兩者都無阻塞、互相獨立，建議依序而非同時進行（同一批核心檔案）。
>
> **需要讀的背景文件：** `.scratch/six-cities-mapping/spec.md`（尤其「引擎擴充 1」一節）、本票券檔案、`.scratch/six-cities-survey/SUMMARY.md`（落差 1/2 的技術依據，臺南/桃園附件 DOM 結構調查細節）。
