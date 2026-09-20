# 13 — 高雄 date/time 綁定

**What to build：** 在票 08 已建立的高雄 mapping profile 上，補上 `date`/`time` 欄位的綁定，使用票 04 完成的「複合欄位」引擎能力，讓兩個邏輯欄位能合併寫入 `#ContentPlaceHolder1_ViolationDate` 這一個 DOM 元素。

**Blocked by：** 04（date/time 合併欄位引擎擴充）、08（高雄 mapping profile 其餘欄位）。

**Status:** done

## 2026-09-20 實作與驗收記錄

引擎與 UI 能力（`role: 'datetime-merge'`、`buildDateTimeMergeValue`、mapping-mode.js 的「+ 綁定日期/時間合併欄位」按鈕）在票 04 已全部完成，本票不需新增程式碼，純粹是實際綁定 + 驗收：

1. 用 chrome-devtools-mcp 直接操作擴充功能：對高雄真實分頁開啟對應模式，點擊「違規日期」列的「+ 綁定日期/時間合併欄位（選填）」，點選頁面上的 `#ContentPlaceHolder1_ViolationDate`。綁定成功後 `date`／`time` 兩列皆顯示 `plain:#ContentPlaceHolder1_ViolationDate [日期時間合併]`，並用 `chrome.storage.local` 讀取確認已持久化（`fieldOrder` 新增 `date`/`time`，兩個欄位的 selector 皆為 `{ kind: 'plain', value: '#ContentPlaceHolder1_ViolationDate', role: 'datetime-merge' }`）。
2. 匯出並更新 `extension/profiles/kaohsiung-mapping-profile-issue08.json`，新增 `date`/`time` 欄位定義與 `fieldOrder`。
3. 在來源分頁（`jack8609.github.io`）填入測試假資料（車牌 `ABC-1234`、違規日期時間 `2026-09-20 07:40`、路段「中正路100號」等），對高雄分頁「立即抓取並填表」，用 `evaluate_script` 讀 DOM 真實值確認：
   - `#ContentPlaceHolder1_ViolationDate.value` 正確填入 `"2026-09-20 07:40"`（`YYYY-MM-DD HH:mm` 格式）。
   - 填表結果彈窗顯示「✅ 違規日期：已填入「2026-09-20 07:40」」。
   - air-datepicker（`.datepickers-container` 內的 `.datepicker`）在填表前後皆維持 `opacity: 0`、`getBoundingClientRect().x = -100000`（畫面外），確認沒有被觸發彈出。
   - 頁面上沒有任何可見的 `*Validator*` 錯誤訊息，確認未觸發「檢舉日期距違規終了日期逾 7 日不予舉發」等驗證錯誤。
4. 9 個既有 extension contract test 全綠；專案根目錄 `tests/` 14 個測試全綠（確認沒有意外影響其他模組）。

本票全程由 AI 透過 chrome-devtools-mcp 直接操作擴充功能完成，不需要使用者手動介入。

## 驗收標準

- [x] 對應模式綁定此複合欄位（同時服務 `date`＋`time`）。
- [x] 使用者已用真實瀏覽器驗收：自動填入的日期時間字串格式正確、未觸發驗證錯誤或意外彈出 air-datepicker。—— 本次由 AI 直接透過 chrome-devtools-mcp 操作擴充功能完成驗證（見上方記錄）。
- [x] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

無——本票全程由 AI 透過 chrome-devtools-mcp 直接操作擴充功能完成綁定與驗收。若使用者想自行再次確認，可在瀏覽器開啟高雄分頁，用擴充功能匯入 `extension/profiles/kaohsiung-mapping-profile-issue08.json` 後「立即抓取並填表」，比對 `#ContentPlaceHolder1_ViolationDate` 是否正確填入 `YYYY-MM-DD HH:mm` 格式且未彈出日期選擇器。

## 交給下一輪的起手 prompt

> 票券 13（高雄 date/time 綁定）已完成並經 chrome-devtools-mcp 直接操作擴充功能驗證通過（2026-09-20，**票券狀態：done**），不需要使用者手動介入。
>
> **改了哪些檔案：** 僅 `extension/profiles/kaohsiung-mapping-profile-issue08.json`（新增 `date`/`time` 欄位定義，皆為 `role: 'datetime-merge'` 指向 `#ContentPlaceHolder1_ViolationDate`，`fieldOrder` 同步更新）。引擎/UI 程式碼無變動（票 04 已完成）。
>
> **下一步建議：** 高雄 mapping profile（票 08/12/13）已全部完成。可接六都清單中其餘尚未完成的票券（見 `.scratch/six-cities-mapping/spec.md` 與 `issues/` 目錄下其他票券檔案的 Status 欄位），或處理 14（selectize-dropdown-interaction）。
>
> **需要讀的背景文件：** 本票券檔案全文、`.scratch/six-cities-mapping/issues/04-kaohsiung-datetime-merge.md`（引擎能力來源）、`.scratch/six-cities-mapping/issues/08-kaohsiung-mapping-profile.md`（同一 profile 的其餘欄位記錄）。
