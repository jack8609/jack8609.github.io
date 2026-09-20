# 12 — 高雄 evidenceImages 綁定

**What to build：** 在票 08 已建立的高雄 mapping profile 上，補上 `evidenceImages` 欄位的綁定，使用票 02 完成的「兩段式上傳確認鈕」引擎能力，讓選檔後能自動點擊「上傳」按鈕。

**Blocked by：** 02（兩段式上傳確認鈕引擎擴充）、08（高雄 mapping profile 其餘欄位）。

**Status:** done

## 2026-09-20 實作與驗收記錄

本票不需要改任何引擎程式碼（`schema.js`/`mapping-mode.js`/`evidence-upload.js`/`fill-engine.js` 皆未修改），票 02 的「單一 file-slots 槽位本身是 multiple input」分支已完整支援高雄這個情境。

**綁定方式（chrome-devtools-mcp 實際操作 mapping-mode UI，非直接手寫 JSON，依使用者要求完整模擬真人操作流程）**：對已連線的高雄分頁（作用中分頁，`--categoryExtensions=true --autoConnect`）觸發擴充功能 popup →「編輯這個網站的欄位對應」進入對應模式 → 對 `evidenceImages` 欄位點「綁定」，點選畫面上的「選擇檔案」（`#ContentPlaceHolder1_fl_File`），面板正確判斷成 `file-slots` kind；面板隨即出現「+ 綁定確認上傳鈕（選填）」按鈕（只有主要 item 剛好 1 個時才會顯示，驗證了票 02 修正過的分流規則），點下去後點選「上傳」按鈕（`#ContentPlaceHolder1_btnMailFile`），面板顯示 `file-trigger:#ContentPlaceHolder1_btnMailFile [確認上傳按鈕]`。點「完成」存檔後讀 `chrome.storage.local` 確認實際存檔結構：

```json
"evidenceImages": {
  "riskField": false,
  "selector": [
    { "kind": "file-slots", "value": "#ContentPlaceHolder1_fl_File" },
    { "kind": "file-trigger", "role": "confirm-upload", "value": "#ContentPlaceHolder1_btnMailFile" }
  ]
}
```

再把同樣內容同步寫回 `extension/profiles/kaohsiung-mapping-profile-issue08.json`（`fieldOrder` 補上 `evidenceImages`），讓票券資產與已驗證的 storage 狀態一致。

**功能驗收（chrome-devtools-mcp，AI 直接操作，無需使用者介入）**：
1. popup 點「立即抓取並填表」，結果彈窗新增一行「ℹ️ 證據影像上傳：請按下面「選擇附件並上傳」按鈕選取檔案」，確認 `evidenceImages` 被正確辨識為 `file-slots` 模式。
2. 用 `upload_file` 對「選擇附件並上傳」按鈕選取 3 個測試小圖檔（`extension/icons/icon16.png`/`icon32.png`/`icon48.png`，非真實個資檔案），觸發原生選檔視窗完成注入。
3. 高雄站的「上傳」按鈕（`btnMailFile`）是傳統 `<input type=submit>`，點擊後會觸發整頁 postback（非 AJAX/UpdatePanel），符合預期地整頁重新載入。
4. `evaluate_script` 直接讀重新載入後的 DOM 真實狀態確認：站方附件計數文字從「目前已上傳0個檔案」變成「目前已上傳3個檔案，總大小：88.16 KB」，附件清單明確列出 `icon16.png`、`icon32.png`、`icon48.png` 三個檔名——證實兩段式上傳（選檔 + 自動點擊確認鈕）確實讓檔案累加進站方附件清單，不是只有前端賦值而已。

## 驗收標準

- [x] 對應模式綁定高雄 `fl_File`（multiple）與「上傳」確認按鈕。—— 2026-09-20 用 chrome-devtools-mcp 完整模擬使用者點擊操作完成綁定（非手寫 JSON），見上方記錄。
- [x] 使用者已用真實瀏覽器驗收：選擇檔案後自動點擊確認鈕，附件確實累加進清單。—— 本次由 AI 直接透過 chrome-devtools-mcp 操作擴充功能完成驗證（見上方記錄），非使用者手動操作；站方附件計數與檔名清單確認 3 個檔案成功累加。
- [x] 既有 extension contract test 全綠（9 個全綠，本票未新增/修改測試，沿用票 02 既有覆蓋）。

## 需要使用者手動驗收的項目

無——本票全程由 AI 透過 chrome-devtools-mcp 直接操作擴充功能完成綁定與驗收（高雄網站填欄位前無身分驗證閘門，且目前 MCP 設定已能操作擴充功能 popup 與 mapping-mode 對應模式）。若使用者想自行再次確認，可在瀏覽器開啟高雄分頁，用擴充功能匯入 `extension/profiles/kaohsiung-mapping-profile-issue08.json` 後「立即抓取並填表」，點「選擇附件並上傳」選幾個測試檔案，比對附件計數是否正確累加。

## 交給下一輪的起手 prompt

> 票券 12（高雄 evidenceImages 綁定）已完成並經 chrome-devtools-mcp 直接操作擴充功能 mapping-mode UI 驗證通過（2026-09-20，**票券狀態：done**），不需要使用者手動介入。
>
> **改了哪些檔案：** 只有 `extension/profiles/kaohsiung-mapping-profile-issue08.json`——`evidenceImages` 欄位新增兩個 selector item（`file-slots:#ContentPlaceHolder1_fl_File` + `file-trigger:#ContentPlaceHolder1_btnMailFile [confirm-upload]`），`fieldOrder` 補上 `evidenceImages`。沒有修改任何引擎程式碼（`schema.js`/`mapping-mode.js`/`evidence-upload.js`/`fill-engine.js` 皆不變），票 02 的能力已完整支援。
>
> **本票的做法跟票 08 不同**：票 08 是直接寫 JSON 再匯入驗證；本票依使用者明確要求，**完整模擬使用者透過 mapping-mode UI 點擊綁定**（觸發 popup →「編輯這個網站的欄位對應」→ 點選「選擇檔案」→ 點「+ 綁定確認上傳鈕」→ 點選「上傳」→「完成」存檔），驗證了 mapping-mode.js 面板本身的判斷邏輯（`file-slots` 分流、「主要 item 剛好 1 個才顯示確認鈕按鈕」），而不只是驗證資料結構。存檔後才讀 `chrome.storage.local` 確認結構，同步寫回 profile JSON。
>
> **驗證過的事項：** 用 `upload_file` 選 3 個測試圖片（`extension/icons/icon16.png`/`icon32.png`/`icon48.png`），確認自動點擊「上傳」鈕後觸發整頁 postback（高雄站是傳統 postback，非 AJAX），reload 後用 `evaluate_script` 讀 DOM 確認站方附件計數從 0 變成 3、檔名清單正確列出三個檔案，總大小 88.16 KB。
>
> **9 個既有 extension contract test 全綠**（本票未新增測試，沿用票 02 既有覆蓋）。
>
> **下一步建議：** 接票 13（高雄 date/time 綁定，依賴票 04 與票 08，兩者皆已 done）或票 14（selectize.js 互動模組，已完成，見既有 commit），彼此互相獨立。高雄整組工作（08/02/04/12/13）完成後即完整。
>
> **需要讀的背景文件：** `.scratch/six-cities-mapping/spec.md`、本票券檔案全文、票 02（`.scratch/six-cities-mapping/issues/02-kaohsiung-two-stage-upload.md`，兩段式上傳引擎能力）、`.scratch/six-cities-mapping/browser-verification-playbook.md`（chrome-devtools-mcp 操作擴充功能的完整手冊）。
