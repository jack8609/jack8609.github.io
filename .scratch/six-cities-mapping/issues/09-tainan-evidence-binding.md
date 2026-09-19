# 09 — 臺南 evidenceImages 綁定

**What to build：** 在票 06 已建立的臺南 mapping profile 上，補上 `evidenceImages` 欄位的綁定，使用票 01 完成的 `file-slots` 引擎能力，讓 6 個固定原生 input（`Upfile1`~`Upfile6`）能自動依序填入使用者選擇的檔案。

**Blocked by：** 01（file-slots 引擎擴充）、06（臺南 mapping profile 其餘欄位）。

**Status:** done

## 2026-09-19 實作與驗收記錄

本票不需要改任何引擎程式碼（`schema.js`/`mapping-mode.js`/`evidence-upload.js`/`fill-engine.js` 皆未修改），票 01 的 `file-slots` 能力已完整支援。

**綁定方式（chrome-devtools-mcp 實際操作 mapping-mode UI，非直接手寫 JSON）**：對已通過驗證的臺南分頁（作用中分頁），觸發擴充功能 popup →「編輯這個網站的欄位對應」進入對應模式 → 對 `evidenceImages` 欄位依序點選畫面上 6 個「選擇檔案」原生 input（對應 `Upfile1`~`Upfile6`），逐一用「+ 新增元素」累加，全程由 mapping-mode.js 自己判斷 kind、自己產生 selector 字串，讀 `chrome.storage.local` 確認結果為：

```json
{
  "fieldOrder": ["plate","date","time","location","violation","description","evidenceImages"],
  "evidenceImages": { "riskField": false, "selector": [
    {"kind":"file-slots","value":"#Upfile1"}, {"kind":"file-slots","value":"#Upfile2"},
    {"kind":"file-slots","value":"#Upfile3"}, {"kind":"file-slots","value":"#Upfile4"},
    {"kind":"file-slots","value":"#Upfile5"}, {"kind":"file-slots","value":"#Upfile6"}
  ]}
}
```

再把同樣內容同步寫回 `extension/profiles/tainan-mapping-profile-issue06.json`，讓票券資產與已驗證的 storage 狀態一致。

**功能驗收（chrome-devtools-mcp，AI 直接操作，無需使用者介入）**：
1. popup 點「立即抓取並填表」，結果彈窗新增一行「ℹ️ 證據影像上傳：請按下面「選擇附件並上傳」按鈕選取檔案」，確認 `evidenceImages` 被正確辨識為 `file-slots` 模式。
2. 用 3 個測試用小型 PNG 檔案（非真實個資檔名，`test1.png`/`test2.png`/`test3.png`）透過「選擇附件並上傳」按鈕選取，彈窗狀態列顯示「✅ 已選定 3 個檔案，成功上傳 3 個」。
3. `evaluate_script` 直接讀 DOM 確認：`#Upfile1`/`#Upfile2`/`#Upfile3` 依序各自恰好被指定 1 個對應檔案（`test1.png`/`test2.png`/`test3.png`），`#Upfile4`~`#Upfile6` 維持空值——依序填入、槽位數與檔案數對應正確。

## 驗收標準

- [x] 對應模式依序綁定臺南 6 個固定附件 input 為 `file-slots` kind。
- [x] 使用者已用真實瀏覽器驗收：選擇 2~3 個測試檔案，確認依序正確填入對應槽位。—— 本次由 AI 直接透過 chrome-devtools-mcp 操作擴充功能完成驗證（見上方記錄），非使用者手動操作。
- [x] 既有 extension contract test 全綠（9 個測試檔案全部通過）。

## 需要使用者手動驗收的項目

無——本票全程由 AI 透過 chrome-devtools-mcp 直接操作擴充功能完成綁定與驗收（臺南網站無身分驗證閘門，且目前 MCP 設定已能操作擴充功能 popup 與 mapping-mode 對應模式）。若使用者想自行再次確認，可在瀏覽器開啟臺南分頁，用擴充功能匯入 `extension/profiles/tainan-mapping-profile-issue06.json` 後「立即抓取並填表」，點「選擇附件並上傳」選幾個測試檔案，比對是否跟上方記錄一致。

## 交給下一輪的起手 prompt

> 票券 09（臺南 evidenceImages 綁定）已完成並經 chrome-devtools-mcp 直接操作擴充功能驗證通過（2026-09-19，**票券狀態：done**），不需要使用者手動介入。
>
> **改了哪些檔案：**
> - `extension/profiles/tainan-mapping-profile-issue06.json`：`evidenceImages` 欄位新增 6 個 `file-slots` item（`#Upfile1`~`#Upfile6`），`fieldOrder` 補上 `evidenceImages`（排在 `description` 之後）。沒有修改任何引擎程式碼（`schema.js`/`mapping-mode.js`/`evidence-upload.js`/`fill-engine.js` 皆不變），票 01 的 `file-slots` 能力已完整支援。
>
> **本票跟先前臺南/桃園附件票的差異**：桃園票 11 是直接手寫 JSON（驗證過 DOM id 後）；本票應使用者要求，改成**真正透過 mapping-mode UI 依序點選 6 個 input**，讓 `mapping-mode.js` 自己判斷元素 kind、自己產生 selector，讀 `chrome.storage.local` 驗證後才回寫進 profile JSON，完整跑過點擊識別這段邏輯本身，結果與桃園票的手寫捷徑產生的資料結構一致（`{"kind":"file-slots","value":"#Upfile1"}` 這種格式）。
>
> **下一步建議：** 接票 08（高雄 mapping profile）、12（高雄附件綁定，兩段式上傳確認鈕）、13（高雄 date/time 綁定）或 14（selectize.js 互動模組，已完成，見 commit 31a372f）之一，彼此互相獨立。
>
> **需要讀的背景文件：** `.scratch/six-cities-mapping/spec.md`、本票券檔案、票 01（`.scratch/six-cities-mapping/issues/01-file-slots-evidence-upload.md`，file-slots 引擎能力）、`.scratch/six-cities-mapping/browser-verification-playbook.md`（chrome-devtools-mcp 操作擴充功能的完整手冊）。

