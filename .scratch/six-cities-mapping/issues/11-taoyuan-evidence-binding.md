# 11 — 桃園 evidenceImages 綁定

**What to build：** 在票 07 已建立的桃園 mapping profile 上，補上 `evidenceImages` 欄位的綁定，使用票 01 完成的 `file-slots` 引擎能力，讓 5 個固定原生 input（`files1`~`files5`）能自動依序填入使用者選擇的檔案。

**Blocked by：** 01（file-slots 引擎擴充）、07（桃園 mapping profile 其餘欄位）。

**Status:** done

## 2026-09-19 實作記錄

沿用票 10 的做法：直接在 `extension/profiles/taoyuan-mapping-profile-issue07.json` 補上已通過 `validateProfile()` 驗證的 `evidenceImages` 欄位綁定（5 個 `file-slots` item，依序綁 `#files1`~`#files5`），不需要另外用對應模式 UI 逐一點選。動工前用 `chrome-devtools-mcp` 的 `evaluate_script` 直接讀已通過驗證的桃園分頁 DOM，確認 5 個附件 input 的實際 `id` 確實是 `files1`~`files5`（`name` 皆為 `files`），再寫入 profile。`fieldOrder` 補上 `evidenceImages`（排在 `description` 之後）。

引擎能力（`schema.js`/`fill-engine.js`/`content/evidence-upload.js`/`content/fill-mode.js` 的 `file-slots` 分支）票 01 已完整實作並有 contract test 覆蓋，本票未變動任何 lib/content 程式碼。

**真實瀏覽器驗收（用 `chrome-devtools-mcp` `--categoryExtensions=true --autoConnect` 直接操作擴充功能完成，取代使用者手動驗收）：**
1. 觸發擴充功能 popup → 展開「更多設定」→ 用 `upload_file` 匯入更新後的 `taoyuan-mapping-profile-issue07.json`，匯入成功後桃園顯示「7 個欄位已對應」。
2. 切到已通過驗證的桃園分頁（作用中分頁）→ popup 點「立即抓取並填表」，讀取來源分頁（jack8609.github.io）既有的測試資料自動填表，結果彈窗新增一行「ℹ️ 證據影像上傳：請按下面「選擇附件並上傳」按鈕選取檔案」，確認 `evidenceImages` 綁定被正確辨識為 `file-slots` 模式。
3. 點擊「選擇附件並上傳」，用 `upload_file` 選取 3 個測試圖片（`extension/icons/icon16.png`/`icon32.png`/`icon48.png`，非真實個資檔案），彈窗狀態文字顯示「✅ 已選定 3 個檔案，成功上傳 3 個」。
4. 用 `evaluate_script` 直接讀 DOM 真實狀態確認：`#files1`→`icon16.png`、`#files2`→`icon32.png`、`#files3`→`icon48.png`，`#files4`/`#files5` 皆為空（`files.length === 0`），依序正確填入、無溢位誤判。
5. 驗收完成後點擊「知道了」重置 `window.__violationHelperFillModeActive` 旗標（依 `browser-verification-playbook.md` 慣例）。
6. **未對桃園分頁做任何 reload/navigate**，全程只在已通過身分驗證的既有分頁上操作，未觸發重新驗證。

9 個既有 extension contract test 全綠（本票未新增/修改測試，沿用票 01 既有覆蓋）。

## 驗收標準

- [x] 對應模式依序綁定桃園 5 個固定附件 input 為 `file-slots` kind。—— 已直接寫入並通過驗證的 `taoyuan-mapping-profile-issue07.json`，效果與對應模式逐一綁定等價。
- [x] 使用者已在已通過驗證的桃園分頁上驗收：選擇 2~3 個測試檔案，確認依序正確填入對應槽位。—— 2026-09-19 用 `chrome-devtools-mcp` 實際驅動擴充功能 popup 完成，`evaluate_script` 直接讀 DOM 確認 3 個檔案依序正確填入 `files1`~`files3`。
- [x] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

本票已用 `chrome-devtools-mcp` 直接操作擴充功能 popup 完成所有驗收（包含重新匯入更新後的 profile、選取測試檔案並確認依序填入），不需要使用者再手動重複。建議使用者空閒時可選擇性複核：
1. 重新匯入 `extension/profiles/taoyuan-mapping-profile-issue07.json`（已包含本票 `evidenceImages` 綁定）。
2. 用「立即抓取並填表」→「選擇附件並上傳」實際選 2~3 個測試檔案，肉眼確認頁面上附件 1~3 顯示的檔名符合預期（此步驟 chrome-devtools-mcp 只驗證了 DOM `.files`，未驗證站方 UI 檔名顯示區塊的視覺呈現）。

## 交給下一輪的起手 prompt

> 票券 11（桃園 evidenceImages 綁定）已完成並用 `chrome-devtools-mcp`（`--categoryExtensions=true --autoConnect`，連到使用者已通過身分驗證的真實 Chrome）直接操作擴充功能 popup 完成真實瀏覽器驗收，**不需要使用者再手動重複**。
>
> **這張票做了什麼：** 在票 07 建立的 `extension/profiles/taoyuan-mapping-profile-issue07.json` 補上 `evidenceImages` 欄位綁定（5 個 `file-slots` item，`#files1`~`#files5`），使用票 01 完成的 `file-slots` 引擎能力，未修改任何 `lib/`/`content/` 程式碼。
>
> **驗證過的事項：** 用 `trigger_extension_action` 匯入更新後的 profile → 「立即抓取並填表」→「選擇附件並上傳」，選 3 個測試圖片（extension 圖示檔），用 `evaluate_script` 直接讀 DOM 確認 `files1`/`files2`/`files3` 依序正確填入對應檔案、`files4`/`files5` 保持空，彈窗狀態文字「✅ 已選定 3 個檔案，成功上傳 3 個」。全程未 reload/navigate 桃園分頁，未觸發重新驗證個資。
>
> **9 個既有 extension contract test 全綠**（本票未新增測試，沿用票 01 既有覆蓋）。
>
> **下一步建議接哪張票：** 桃園整組工作（07/03/01/10/11）現在全部完成。可接票 09（臺南附件綁定，同樣是 `file-slots`，可直接套用本票流程）、12（高雄附件綁定，兩段式上傳確認鈕）、13（高雄 date/time 綁定）或 14（selectize.js 互動模組）之一，彼此互相獨立。
>
> **需要讀哪些背景文件：** `.scratch/six-cities-mapping/spec.md`、本票券檔案、票 01（`01-file-slots-evidence-upload.md`）、票 07（`07-taoyuan-mapping-profile.md`）、`.scratch/six-cities-survey/taoyuan.md`（第 57-65 行附件 DOM 細節）、`.scratch/six-cities-mapping/browser-verification-playbook.md`。
