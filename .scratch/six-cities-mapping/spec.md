# 六都違規檢舉網站 mapping profile 與引擎擴充

> 承接 `.scratch/six-cities-survey/`（臺中/臺南/桃園/高雄 4 份逐都報告 + SUMMARY.md）的調查結論，以及 2026-08-24 對桃園、高雄已驗證分頁做的即時技術驗證（詳見 SUMMARY.md 落差 4/5 與 repo memory）。本 spec 不重複調查過程，只整理已確認的技術事實與待實作決策。

## Problem Statement

擴充功能目前只支援臺北市、新北市兩個違規檢舉網站的半自動填表。使用者已完成臺中、臺南、桃園、高雄 4 個都市網站的欄位結構調查，其中臺中的欄位結構跟既有引擎能力完全相容，但臺南/桃園的附件上傳、高雄的附件上傳與違規日期時間欄位、桃園的違規事項欄位，都用到現有 `schema.js`/`mapping-mode.js`/`evidence-upload.js`/`fill-engine.js` 尚未支援的 DOM 互動模式。使用者無法在不擴充引擎的情況下，替這幾都建立可用的 mapping profile。

## Solution

依「引擎擴充」與「各都 mapping profile」兩類工作分開處理：

1. 新增 3 個獨立的引擎擴充能力（各自不依賴彼此，可平行進行）：
   - 固定多槽位附件上傳（新 kind，供臺南、桃園共用）。
   - 兩段式上傳確認鈕（高雄專用）。
   - 違規事項欄位的「候選元素群組」（桃園 `chose_type` 互斥雙 select 專用）。
   - 高雄 date/time 合併欄位的複合賦值支援。
2. 每個都市各自一份 mapping profile，能自動填的欄位盡量自動填，暫時無法自動化的欄位（需等引擎擴充完成）明確跳過並標記待人工確認，不猜測。
3. 每張票完成後，實作者需在票券檔案內補一段「交給下一輪 AI 的起手 prompt」與「需要使用者手動驗收的項目」，讓後續工作階段不需要使用者重新解釋上下文，也讓使用者清楚知道哪些行為必須自己在瀏覽器裡確認（因為 chrome-devtools-mcp 無法操作擴充功能的 popup UI）。

## User Stories

1. 作為使用者，我想要在臺中違規網站上一鍵自動填完所有欄位（含附件），這樣我就不用逐一手動輸入。
2. 作為使用者，我想要在臺南違規網站上自動填完除附件外的欄位，這樣我只需要手動處理附件上傳。
3. 作為使用者，我想要在臺南附件引擎擴充完成後，自動把檔案分別填入 6 個固定附件欄位，這樣我不用一個一個手動選檔。
4. 作為使用者，我想要在桃園違規網站上自動填完地址、車牌、車種等結構化欄位，這樣我只需要手動處理附件與違規事項。
5. 作為使用者，我想要桃園的違規日期/時間欄位能自動填入（透過 plain 賦值），這樣我不需要手動操作 My97 選擇器。
6. 作為使用者，我想要桃園的違規事項欄位能依我輸入的違規文字，自動判斷該選「動態違規」或「靜態違規」，並在對應的下拉選單選到正確條文，這樣我不需要自己先切換類別再找選項。
7. 作為使用者，我想要桃園附件引擎擴充完成後，自動把檔案分別填入 5 個固定附件欄位。
8. 作為使用者，我想要在高雄違規網站上自動填完除附件、日期時間外的欄位（含車牌拆分、行政區、轄區分局）。
9. 作為使用者，我想要高雄附件引擎擴充（兩段式上傳確認鈕）完成後，選好檔案並自動點擊「上傳」按鈕，不需要我自己記得再點一次。
10. 作為使用者，我想要高雄的違規日期/時間欄位能自動組出正確格式字串並填入合併欄位，不需要我手動點選日曆與時間滑桿。
11. 作為使用者，我想要每張票券完成後拿到一段可以直接貼給下一輪新對話的起手 prompt，這樣我不需要每次重新講解上下文。
12. 作為使用者，我想要每張票券明確告訴我哪些行為需要我自己在瀏覽器裡手動驗收（例如擴充功能 popup 互動），這樣我知道該測什麼、不會漏測。
13. 作為使用者，我想要引擎擴充的票券彼此獨立、互不修改對方碰的檔案區塊，這樣拆給不同輪次的新對話實作時不會互相衝突或破壞彼此的成果。

## Implementation Decisions

### 引擎擴充 1：固定多槽位附件上傳（新 kind，暫稱 `file-slots`）

- 適用：臺南（`Upfile1`~`Upfile6`，6 槽）、桃園（`files1`~`files5`，5 槽）。頁面載入時就固定存在 N 個獨立、非 `multiple` 的原生 `<input type=file>`，不是「觸發按鈕→動態長出新節點」也不是「單一 multiple 輸入一次全選」。
- `schema.js`：新增 `'file-slots'` kind；驗證邏輯需允許 `evidenceImages` 欄位在此 kind 下綁定多個 selector item（每個 item 直接指向一個固定 input），跟現有 `file-trigger` kind「固定只允許 1 個 item」的限制分開判斷，不影響 `file-trigger` 既有規則。
- `mapping-mode.js`：解除 `evidenceImages` 只能綁 1 個 item 的限制，但**僅對 `file-slots` kind 解除**，`file-trigger` 仍維持原限制。使用者在對應模式下需能依序點選 N 個固定 input，逐一加入 selector 陣列。
- `evidence-upload.js`：新增「依序把第 i 個使用者選擇的檔案指定給第 i 個綁定 input」的直接賦值邏輯——不需要祖先鏈解析、不需要點擊觸發、不需要偵測新增節點，每個 input 各自 `DataTransfer` 賦值＋dispatch `change`。若使用者選的檔案數量超過綁定的槽位數，多出的檔案標記為無法自動上傳，不猜測塞進不存在的槽位。

### 引擎擴充 2：兩段式上傳確認鈕（高雄專用）

- 適用：高雄 `fl_File`（`multiple`）選檔後不會直接算數，需再點一次獨立的「上傳」`<input type=submit>` 按鈕，才會被站方累加進附件清單。
- `evidenceImages` 的 mapping 除了原本的檔案輸入本身，新增一個**選填**的「確認上傳」按鈕 item。
- `evidence-upload.js` 的 `assign-all` 分支完成賦值＋`change` 事件後，若欄位有綁定確認鈕，自動點擊它；沒有綁定就維持現有行為不變（不影響臺北/新北既有 profile）。

### 引擎擴充 3：違規事項欄位「候選元素群組」（桃園 `chose_type`→`chosen1`/`chosen2` 專用）

- 已驗證技術事實（2026-08-24 chrome-devtools-mcp 唯讀實測）：`chosen1`/`chosen2` 兩個 `<select>` 同時存在於 DOM、皆未 `disabled`，僅用 `style.display` 切換可見性；切換 `chose_type` 後舊選值不會被清空；`FormData` 唯讀讀取確認兩個 select 的值會同時被序列化（即使一個是 `display:none`）。
- 需要新增「候選元素群組」概念：violation 欄位允許宣告一個**控制型 select**（`chose_type`）與多個**互斥候選 select**（`chosen1`/`chosen2`，各自附自己的選項清單）。`fill-engine.js` 依來源違規文字比對出屬於哪個候選清單，決定要把控制型 select 切到哪個值，並在真正對目標候選 select 賦值前，**主動清空所有其他候選 select 的值**（依 2026-08-24 驗證結果，這步是必要的，否則送出時 `chosen` 會有同名重複值的歧義）。
- 只在 violation 欄位需要這個新概念時才啟用，不影響其他欄位既有的「一組固定 item 各自綁定」模型。

### 引擎擴充 4：date/time 合併欄位（高雄 `#ContentPlaceHolder1_ViolationDate` 專用）

- 已驗證技術事實（2026-08-24）：欄位可用 `plain` 賦值方式（直接設 `.value` + dispatch `input`/`change`/`blur`）寫入 `YYYY-MM-DD HH:mm` 格式字串，未被攔截、未觸發 air-datepicker 彈窗。因此**不需要**設計新的 custom widget 互動模組，只需要引擎層面支援「兩個邏輯欄位（`date`+`time`）合併寫入同一個 DOM 元素」。
- 需要新增「複合欄位」概念：允許某個 selector item 同時宣告服務於 `date`＋`time`，`fill-engine.js` 讀取兩個邏輯欄位各自的原始值，組成正確格式字串後，用 `plain` 賦值方式一次寫入該元素一次（不能各自賦值兩次互相覆蓋）。
- 具體的合併字串格式（`YYYY-MM-DD HH:mm`）與是否需要透過 `transform` 或直接在 `fill-engine.js` 新增專門函式，留給實作票券依當時 `fill-engine.js` 現況決定，本 spec 只定調「引擎需要支援這個能力」與「賦值方式是 plain，不是 custom 互動」。

### 各都 mapping profile

- 臺中：全部欄位落在既有 `plain`/`select`/`custom`＋`LOCATION_ROLES` 語意內，`evidenceImages` 跟臺北模式同構（`file-trigger`），**不需要**引擎擴充。
- 臺南：`date`/`time`/`location`/`description`/`violation` 皆為既有語意，`evidenceImages` 需等引擎擴充 1。
- 桃園：`location` 已被站方結構化（`city`/`village`/`selectize_Road`/門牌片段），`date`/`time` 可直接歸類 `plain`，`violation` 需等引擎擴充 3，`evidenceImages` 需等引擎擴充 1。
- 高雄：`plate`/`location`/`description` 為既有語意，`date`/`time` 需等引擎擴充 4，`evidenceImages` 需等引擎擴充 2。

### 票券交接慣例（本 spec 新增的專案慣例，非引擎程式碼決策）

- 每張票券完成、驗收標準全數勾選後，實作者要在票券檔案結尾補一段「## 交給下一輪的起手 prompt」，內容包含：這張票做了什麼、改了哪些檔案、下一步建議接哪張票、需要讀哪些背景文件（至少包含本 spec 與對應都市的調查報告）。
- 每張票券要有「## 需要使用者手動驗收的項目」區塊，列出無法用 chrome-devtools-mcp 驗證的行為（例如擴充功能 popup 互動、對應模式的實際點選流程）與具體驗收步驟。

## Testing Decisions

- 沿用現有 extension contract test 慣例（`extension/tests/*.test.mjs`）：純函式邏輯（`resolveOptionMatch`、`planEvidenceInjection` 類的新函式）要有對應的 contract test，涵蓋正常案例＋至少 1~2 個邊界案例。
- DOM 互動類的新邏輯（例如點擊確認上傳鈕、依序賦值多槽位 input）比照既有 `evidence-upload.js` 慣例，不強制寫測試，但要在真實網站上用 chrome-devtools-mcp 唯讀驗證過（僅新北市這類無驗證閘門的網站可由 AI 自行反覆測試；臺南/桃園/高雄若牽涉會清掉使用者已填資料的操作，一律先問使用者）。
- 每張票券的驗收標準要包含「8 個既有 extension contract test（或當時實際數量）全綠」。

## Out of Scope

- 表單「送出」後的伺服端驗證行為（4 都皆未實測，仍是待人工確認事項，不在本輪任何票券範圍）。
- `description` 邏輯欄位在桃園/臺南沒有可靠對應項的問題，本輪先維持「無對應則不猜測」，不特別開票處理。
- 高雄 18 個違規大類細項清單內容的逐一驗證（連動關係已確認，內容窮舉不影響引擎設計）。
- 桃園 `selectize_Road2`（交叉路口）是否必填的細節，mapping profile 先以非必填處理，若之後有失敗案例再檢討。

## Further Notes

- 桃園、臺北比照辦理「AI 不自動 reload/navigate 使用者的分頁，等使用者手動完成身分驗證後才操作」的規則。
- 引擎擴充 1~4 彼此獨立，只共用同一批核心檔案（`schema.js`/`mapping-mode.js`/`evidence-upload.js`/`fill-engine.js`），建議依序（而非同時）合併進 main，避免多輪平行修改同一檔案造成衝突；若真的要平行進行，實作者要在動工前先看一次該檔案當時的最新狀態。
- 詳細技術依據見 `.scratch/six-cities-survey/SUMMARY.md`（落差 1~5）與 `taoyuan.md`/`kaohsiung.md` 的 2026-08-24 更新段落。
- 若需使用 `chrome-devtools*` mcp, 請委派 `sub agent`工作, 主context只收結果, 避免過多測試與分析噪音汙染.