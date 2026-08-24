# 桃園市檢舉網站調查

## 網站基本資訊

- 網址：`https://tvrweb.typd.gov.tw:3444/TTPB/D0102?verityCode=...&verifyEmail=...&verifyId=...&verifyApplyDate=...`
- 頁面標題：「桃園市政府警察局交通違規檢舉專區」
- 是否需要登入/驗證：網址本身已帶有 `verityCode` / `verifyEmail` / `verifyId` / `verifyApplyDate` 四組 token 參數，代表使用者是透過一組已完成驗證流程（信箱認證連結）的網址進入，本次調查開啟時**頁面已直接顯示完整檢舉表單**，沒有出現額外的驗證關卡頁面。

## 身分驗證閘門（2026-08-24 使用者手動操作後更正）

> **更正**：本節先前結論「本次調查未卡在驗證頁面」只反映「本次調查用的分頁網址剛好已帶有驗證後 token」這個特例，**不代表桃園網站本身沒有驗證閘門**。使用者實際操作証實：桃園網站跟台北市一樣，**必須先手動填寫檢舉人個資並完成信箱驗證，才會顯示違規資料填寫頁面**（即上面網址列的 4 組 token 参数就是驗證完成後才拿得到的憑證）。因此桃園比照台北市規則：**AI 不會自己觸發 reload/navigate 使用者的桃園分頁**，一律等使用者手動完成驗證流程並告知後，才在使用者已開好、已通過驗證的分頁上操作。以下逐欄調查即是在使用者已手動輸入假個資、通過驗證後的填寫違規資料頁面上進行。

## 逐欄調查

### date（違規日期）
- DOM 元素：`<input type="text" id="cardate" name="cardate" class="border_report Wdate">`，屬性 `readonly` 未設但實務上由 `onfocus` 綁定 My97 DatePicker（`WdatePicker({dateFmt:'yyyy/MM/dd', ...})`）彈出圖形化日期選擇器。
- 元件種類：底層是一個普通 `<input type="text">`，點擊會彈出 iframe 內嵌的 My97 DatePicker 彈窗（`<iframe>` 動態載入 `calendar.js`），但 **2026-08-24 已實測確認可以當 plain 直接賦值繞過**：用 JS 直接設 `el.value` 並 dispatch `input`/`change`/`blur` 事件後，值穩定寫入且未被清空，欄位 class 保持 `valid`（非錯誤狀態），也未意外嗚出 My97 彈窗。**結論：桃園的 date/time 可以歸類為 `plain`**，不需要新建 custom 互動模組（同一結論是否適用於高雄的 air-datepicker 尚未驗證，不可直接套用）。
- 日期格式：`yyyy/MM/dd`，經實際點開日期選擇器確認彈窗內 `onclick="day_Click(2026, 8, 1, ...)"` 使用**西元年（Gregorian）**，並非民國年。

### time（違規時間）
- DOM 元素：`<input type="text" id="carTime" name="carTime" class="border_report Wdate" value="08:00" required maxlength="20">`，同樣透過 `onfocus` 綁定另一組 My97 DatePicker 時間選擇模式（`dateFmt:'HH:mm'`）。
- 元件種類：**custom**（同 date，彈出圖形化時間選擇器），非單純可直接賦值的 plain input。
- 與 date 為**兩個獨立欄位**（分開填寫，非合併成單一 datetime 欄位），且 time 欄位有預設值 `08:00`。

### plate（違規車牌）
- DOM 元素：兩個獨立 `<input type="text" id="CarNum" maxlength="4">` 與 `<input type="text" id="CarNum2" maxlength="4">`，中間以靜態文字 `-` 分隔。
- 元件種類：**plain**（兩個文字輸入框），但邏輯上車牌被拆成「前段」「後段」兩組（各最多 4 碼），程式需自行處理車牌字串的拆分邏輯，而非單一輸入框。

### location（違規地址）
- 元件組成（由上而下）：
  - `city`：`<select id="city">`，選項僅「請選擇 / 桃園市 / 其他」，屬性 role = **district**（縣市層級）。kind = **select**。
  - `village`：`<select id="village">`，選項為桃園市 13 個行政區（桃園區、中壢區…），role = **district**（區級）。kind = **select**。此清單透過 AJAX（`POST ../TTPB/Village?id=<city值>`）依 city 的選擇動態載入，屬於**連動欄位**。
  - `selectize_Road`：底層為隱藏的 `<select style="display:none">`，實際 UI 由 selectize.js 產生一個可搜尋的下拉輸入框（`#selectize_Road-selectized`）。role = **road**。kind = **custom**（需點擊觸發搜尋式下拉、輸入關鍵字、點選選項，不能只對隱藏 select 賦值）。此清單同樣透過 AJAX（`POST ../TTPB/ROAD?id=<village值>`）依 village 的選擇動態載入，屬於**連動欄位**。
  - `addStreet` / `addAlley`（巷）/ `addLane`（弄）/ `addSubLane`（衖）/ `addNo`（號）：五個獨立 `<input type="text" maxlength="5" size="5">`，各自對應「街／巷／弄／衖／號」等標準地址片段。因欄位本身已經是站方預先拆好的結構化輸入格，語意明確，可視為 role = **road** 的延伸片段（門牌相關），不需要地址解析器再自行猜測；若判斷困難的部分（例如「衖」與「弄」在部分地址中界線模糊），建議標記為「無法自動判斷，需人工複核」。
  - `selectize_Road2`：另一組 selectize 搜尋式下拉（交叉路口，非必填），kind = **custom**，用途為「交叉路口」輔助定位，非地址主體。
  - `shouhou` / `shouhou2`：一組（隱藏）文字輸入 + `<textarea id="shouhou2">` 自由文字欄位，role = **remainder（無法可靠拆分時的整體地址備註）**。
- **連動欄位（重要）**：
  1. `city` → `village`：AJAX 動態載入行政區選項。
  2. `village` → `selectize_Road`：AJAX 動態載入路段選項。
  3. `city` 選擇「其他」（value `9999`）時，會**隱藏** `village`、`selectize_Road`（含 selectize UI）、`addStreet`、`addAlley`、`addLane`、`addSubLane`、`addNo` 及對應的「2」版本欄位（`add_Road2`/`Road2` 等），並**改為顯示且必填** `shouhou2`（自由文字地址備注），驗證規則也會即時切換（`village`/`selectize_Road` 從必填變成非必填，`shouhou2` 變成必填）。
- **地址欄位是否需要拆分**：**需要**，且站方本身已經用 district（city+village）/ road（selectize_Road）/ 門牌片段（addStreet/addAlley/addLane/addSubLane/addNo）預先結構化拆好，只有在使用者選擇「其他」時才會退回成單一自由文字欄位（shouhou2）。因此地址解析器只需在「city=其他」的分支才需要處理整段字串的拆分，其餘情況可直接對應到既有的結構化欄位。

### description（案件敘述/補充說明）
- 本站**沒有獨立、常駐顯示的「案件敘述」自由文字欄位**。實際觀察到兩個条件式出現的 `<textarea>`：
  - `case_note`（placeholder「請輸入違規事項」）：僅當「違規法條」下拉（`chosen1` 動態違規清單或 `chosen2` 靜態違規清單）選到值 `9999`（清單中的「其他」選項）時才顯示，性質偏向 violation 的補充說明，而非泛用的 description。
  - `shouhou2`：僅當 `city` 選「其他」時顯示，性質是地址備註（見上方 location 段）。
- **無法確定**：schema 中的邏輯欄位 `description` 在此站是否應對應到 `case_note`（違規事項其他說明）或完全沒有對應項，建議標記為需要人工複核。

### violation（違規事項）
- `chose_type`：`<select id="chose_type">`，選項「動態違規 / 靜態違規」，kind = **select**。
- `chosen1`：`<select id="chosen1" name="chosen">`，當 `chose_type=動態違規` 時顯示，內含約 60+ 筆具體法條文字選項（例如「未戴安全帽。」「（高、快速公路）未依規定使用車道。」等完整敘述句）。
- `chosen2`：`<select id="chosen2" name="chosen">`（與 chosen1 共用 `name="chosen"`），當 `chose_type=靜態違規` 時顯示，選項數量少（6 筆，如「佔用身障停車格。」「併排停車。」等）。
- **連動欄位（2026-08-24 補充：與其他都市性質不同，需特別標記）**：`chose_type` 決定顯示 `chosen1` 或 `chosen2` 其中之一（互斥顯示/隱藏，且共用 name 便於表單送出）；`chosen1`/`chosen2` 選到「其他」（value `9999`）時觸發顯示 `case_note` 自由文字欄位。
  - 這跟臺南/高雄的「大類→細項二層連動」**表面相似、底層機制不同**：臺南/高雄是同一個 DOM 元素（同一個 `<select>`）依大類 AJAX 換選項；桃園是**兩個完全獨立的 `<select>` 元素**（`chosen1`/`chosen2`），只有其中一個依 `chose_type` 顯示，且「該用哪一個」取決於**來源違規文字本身屬於動態還是靜態**（不是網站固定不變的性質），現有 schema 的 selector item 模型（每個 item 各自綁定一個固定 DOM 元素）沒有「依資料內容決定要操作哪個候選元素、並先切換控制欄位」的概念，直接套用既有「select 欄位可有多個 item」語意可能導致：綁定當下看到的是 `chosen1`（動態），實際違規屬於靜態時，引擎會嘗試在 `chosen1` 的選項清單裡比對，找不到就誤判為 `not-found`，而不會知道應該先把 `chose_type` 切成「靜態違規」再改用 `chosen2`。**這是本次調查新發現的落差，不在 SUMMARY.md 原本的落差 1～4 之列，建議列為落差 5，需要設計討論而非直接寫 mapping profile。**
- kind = **select**（原生下拉），非 custom 元件。

### evidenceImages（附件）
- DOM 元素：`files1` ~ `files5`，即 **5 個獨立的原生 `<input type="file" name="files">`**（非 `multiple` 屬性的單一輸入框，也不是先點觸發按鈕才顯示 input 的 file-trigger 模式），每個都各自設定 `accept="image/jpg,image/jpeg,image/png,image/gif,video/mp4,video/x-matroska,video/x-flv,video/mpeg,video/quicktime,video/avi,video/x-ms-wmv,application/zip,application/rar"`。
- 每個附件輸入框旁都有一個獨立的「X」清除按鈕（`clearfilename` ~ `clearfilename5`）。
- kind = **file**（多槽位模式：5 個固定存在、各自獨立的原生檔案輸入框，一次對應一個檔案，而非一次選取多檔或彈窗式觸發）。
- 站方規則（頁面文字）：總量限制 80MB、至多 5 個檔案、單檔限制 50MB，允許格式含圖片（jpg/jpeg/gif/png）與多種影片格式（mp4/mpeg/mkv/mov/avi）。

## 附件上傳機制

5 個固定存在的原生 `<input type="file">`（`files1`~`files5`，`name` 皆為 `files`），使用者對每一個各自選取一個檔案；非「彈窗觸發後才出現 input」的模式，也非單一 `multiple` 輸入框一次選取多檔。每個輸入框旁附一個獨立「X」按鈕可清除該槽位已選檔案。

## 檢舉條文內容

`chosen1`（動態違規，約 60+ 筆）與 `chosen2`（靜態違規，6 筆）皆為**完整法條敘述句**（如「汽車駕駛人於行駛道路時，以手持方式使用行動電話，但機車不在此限。」），文字具體、非籠統分類代碼，足夠讓程式做文字比對或模糊比對（例如關鍵字比對「安全帽」「闖紅燈」「併排停車」等）。兩份清單皆有一個「其他」選項（value `9999`），選中後會顯示自由文字 `case_note` 供補充敘述無法歸類的違規事項。

## 無法確定 / 需要人工複核的項目

1. `description` 邏輯欄位在本站沒有明確、常駐對應項，是否應對應到條件式顯示的 `case_note`（違規事項其他說明）需要人工確認。
2. 地址片段中「巷」「弄」「衖」在少數地址表達方式上界線模糊，語意上無法保證能自動正確分類到對應輸入框，建議此類片段標記為「無法自動判斷」。
3. 由於安全鐵律要求不可填入任何真實或假造個資，本次調查未實際送出表單，因此無法確認：
   - 表單送出後的驗證錯誤訊息內容與時機（僅能由前端 jQuery Validate 規則片段推測）。
   - `selectize_Road2`（交叉路口）欄位是否為必填、及其連動觸發條件的完整細節。
   - `village`/`selectize_Road` 的 AJAX 回應資料結構（僅能看到呼叫的 API 路徑 `../TTPB/Village?id=` 與 `../TTPB/ROAD?id=`，未實際檢視回傳 JSON schema）。
4. **`chose_type`/`chosen1`/`chosen2` 的「類別互斥雙元件」實際切換細節**——**2026-08-24 已用 chrome-devtools-mcp 對已驗證分頁實測確認**：`chosen1`/`chosen2` 兩個 `<select>` **同時存在於 DOM**（都未設 `disabled`，僅以 `style.display` 控制顯示/隱藏）；切換 `chose_type` 後可見性確實互換，但舊選值**不會被清空**；呱共用 `name="chosen"` 且都未 `disabled`，用 `new FormData(form)` 實測確認**兩個 select 的值會同時被序列化送出**（不是只有可見那個）——代表若引擎切換 `chose_type` 後不主動清空非目標那個 select 的舊值，送出時會同名重複送出兩筆 `chosen`（後端如何處理重複 key 未知，建議引擎方案主動清空非目標那個避免歧義）。這些細節已列入 SUMMARY.md 落差 5 的設計輸入。
