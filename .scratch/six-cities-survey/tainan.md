# 臺南市檢舉網站調查

## 網站基本資訊

- 網址：`https://tr.tnpd.gov.tw/TrafficMailbox/Create?checkRead=agree&id=<guid>`（交通檢舉信箱-臺南市政府警察局全球資訊網）
- 頁面標題：交通檢舉信箱-臺南市政府警察局全球資訊網
- 表單型態：**單頁式表單**——「檢舉人資料」與「檢舉內容」兩大區塊同時渲染在同一個 `<form>` 內，並非分成兩個不同網址/畫面的步驟。頁面上方文字說明的三步驟（填寫檢舉人資料 → 寄送並完成認證信 → 填寫檢舉內容並送出）是**流程**上的順序要求，不是 DOM 結構上的鎖定（見下方「身分驗證閘門」）。

## 身分驗證閘門

- 表單同時包含「檢舉人資料」（身分證姓名、電話、身分證字號、地址、E-MAIL、性別 select）與「檢舉內容」（主題、違規地點/時間/車號/事項、附件、驗證碼）兩區塊，全部欄位在 DOM 中都是 `disabled=false`／`readOnly=false`，可直接互動，**沒有觀察到任何欄位級別的鎖定或隱藏來強制「先驗證信箱才能碰檢舉內容」**。
- 頁面提供「寄送認證郵件」按鈕（`button` 文字「寄送認證郵件」），流程說明指出：填 email → 按下該鈕 → 收信點連結認證 → 才能繼續完成檢舉內容送出。實際的驗證強制力應是**送出（`送出` submit）時的伺服端檢查**，而非前端 DOM 鎖定；本次調查未實際送出表單去驗證真實行為（避免使用真實個資），故此點列為無法完全確認。
- 目前分頁 URL 帶有 `checkRead=agree&id=<guid>`，`Name`/`TEL`/`Pid`/`Address`/`Email` 欄位目前皆為空值（長度為 0），未攜帶任何真實個資，本次調查未輸入任何檢舉人資料。
- 结论：**這不是一個會在 DOM 上把「違規內容」欄位藏起來、逼你先完成驗證才「看得到」的閘門**；程式若要自動化，仍需先完成「寄送認證信→人工收信點擊」這個無法自動化的人工步驟，才能讓最終送出成功。

## 逐欄調查

### date（違規日期）
- **DOM 元素種類**：`plain` 中的一種特化——原生 `<select id="violation_date" name="violation_date">`，屬於 `select` kind。
- **連動欄位**：否，不依賴其他欄位。
- **格式細節**：選項為西元（非民國）日期字串，格式 `YYYY/MM/DD`，例如 `2026/08/24`。**只提供「當天往前推 6 天」共 7 個可選日期**（加上一個「請選擇」預設空選項），不是任意日期選擇器，也不支援輸入未在清單中的日期。頁面載入時預設值為「請選擇」（未預填）。

### time（違規時間）
- **DOM 元素種類**：`select` kind，但是**拆成兩個原生 `<select>`**：`violation_time1`（時，選項 `0`~`23`）與 `violation_time2`（分，選項 `0`~`59`），旁邊各自跟著靜態文字「時」「分」。另外各自搭配一個 `hidden` input（`hviolation_time1`/`hviolation_time2`）。
- **連動欄位**：否。
- **格式細節**：時、分是**分開**的兩個下拉選單（非單一 `1630` 字串輸入）。觀察到頁面載入時 `violation_time1`/`violation_time2` 已**預設為目前系統時間**（例如載入當下顯示 9 時 46 分），需要使用者自行改成違規發生時間；`violation_date` 則沒有這種自動預設行為。

### plate（違規車號）
- **DOM 元素種類**：`plain` kind，但**拆成兩個文字輸入框**：`violation_carno1`（placeholder「例：AAA」，車牌前段）與 `violation_carno2`（placeholder「例：0000」，車牌後段），中間有靜態文字「-」相連，UI 呈現類似 `AAA-0000`。兩者皆為必填（`data-val-required="車號欄位必填"`），皆無 `maxlength` 限制。
- **連動欄位**：否，欄位一開始就直接顯示，不需要先選違規事項才出現（跟題目範例提到「新北市要先選違規類型才顯示車牌」的模式不同）。
- **格式細節**：純文字輸入，無自動格式化或遮罩，需要自行組合成 `AAA-0000` 型式後再拆開填入兩格。

### location（違規地點）
- location 在此站是 **district / road / remainder 三個獨立欄位組成**，不是單一字串輸入框：
  1. **district（`violation_place_area`）**：原生 `<select>`，可見（非隱藏），41 個選項。選項內容混合「行政區」（新營區、鹽水區…共 37 區）與「快速公路路線」（台61線快速公路、台84線快速公路、台86線快速公路），角色上等同 district，但語意上包含「快速公路」這種非行政區類別，需注意不能單純假設此欄一定是行政區名稱。
  2. **road（`violation_place_road_search` + 隱藏 `violation_place_road`）**：**`custom` kind**。可見的是一個唯讀（`readonly` 屬性存在）文字框 `#violation_place_road_search`（placeholder「請選擇或輸入道路名稱...」，但因為 `readonly` 實際上**不能直接打字**，這是 UI 文案與行為不一致之處），搭配一個 `<div class="dropdown-list" id="roadDropdownList">` 承載選項（`<div class="dropdown-item">路名</div>`，本次觀察到選了「新營區」後灌入 192 筆路名）。原生 `<select id="violation_place_road">` 被 `style="display:none"` 隱藏，HTML 註解明寫「新的可搜尋下拉選單」/「保留原始的隱藏select以維持表單提交邏輯」，證實這是自訂 widget 疊在隱藏 select 上、實際表單送出仍讀隱藏 select 的值。
  3. **remainder（`violation_place`）**：`plain` kind，原生文字輸入框，placeholder「請輸入違規地址」，必填（`data-val-required="違規地址必填"`）。用途是門牌號、巷弄、公里數等無法拆進 district/road 的其餘地址片段，符合「remainder：其餘、語意上無法可靠拆分」的定義，屬於**無法自動判斷、需人工填寫**的自由文字。
- **連動欄位（重要）**：**road 依賴 district**——選定 `violation_place_area` 後才會觸發 `GET /TrafficRoaddatas/GetRoads?id=<area值>` 取得該區路名清單填入 `roadDropdownList`；`violation_place_road` 原生 select 在未選 district 前只有一個「請選擇」選項。實測：把 `violation_place_area` 設為「1」（新營區）後，`roadDropdownList` 立即被灌入 192 筆路名。

### description（主題/檢舉描述）
- **DOM 元素種類**：`plain` kind，原生 `<input id="Subject" name="Subject" maxlength="200" placeholder="請輸入主旨">`，必填（`data-val-required="主旨必填"`）。
- **連動欄位**：否。
- **格式細節**：單行文字輸入（非多行 textarea），上限 200 字，用來敘述檢舉違規過程及事實行為。
- 附註：頁面另有一個隱藏的 `<textarea name="Content">`（父層 `display:none`，預設值「無資料」，非必填），不屬於使用者可見/可填的欄位，推測是後端相容用的殘留欄位，**不對應** schema 的 description。

### violation（違規事項）
- **DOM 元素種類**：`select` kind，原生 `<select id="itemno" name="itemno">`。
- **連動欄位（重要）**：**完全依賴 district（`violation_place_area`）**。頁面載入時 `itemno` 只有一個選項「請先選擇上方違規地點」；選定 district 後會觸發 `GET /TrafficMailbox/GetViolationItems?id=<area值>`，回填出實際違規項目清單（實測選「新營區」後灌入 39 個選項，起始仍保留一個空白「請選擇」）。
- **格式細節（檢舉條文內容是否具體）**：選項文字採「條號+具體違規描述」格式，例如：
  - `道交30-1-2所載貨物滲漏、飛散、脫落、掉落`
  - `道交31-6未戴安全帽`
  - `道交31之1-1汽車駕車手持行動電話(不含機車)`
  - `道交43-1-1蛇行或危險方式駕車`
  
  文字內容**足夠具體**（含法條號＋白話描述），適合拿來做關鍵字/模糊比對；但注意此清單**會隨 district 不同而不同**，程式若要預先建立條文對照表，需要對每個 district 分別呼叫 `GetViolationItems` 取得完整清單，不能只抓一次當全域清單。

### evidenceImages（附件上傳）
- **DOM 元素種類**：`file` kind（**原生 `<input type="file">`，一次給 6 個固定欄位**，不是 `file-trigger` 模式）：`Upfile1`～`Upfile6`，各自搭配 UI 上的「選擇檔案」按鈕（此按鈕即瀏覽器對 `<input type=file>` 原生渲染的樣式，不是需要先點擊才「彈出/展開」出隱藏 input 的觸發按鈕）。
- **連動欄位**：否，6 個欄位一開始就同時存在於 DOM，非逐一注入。
- **格式細節**：僅 `Upfile1` 為必填（`data-val-required="至少第一個檔案必須上傳"`），`Upfile2`~`Upfile6` 為選填。限制：6 檔案總大小不得超過 60MB；僅支援圖片/影片格式（`*.avi, *.mp4, *.wmv, *.mov, *.3gp, *.jpeg, *.jpg, *.png, *.bmp`）；自 111 年 6 月 1 日起不支援 `*.gif, *.zip, *.rar`；檔名不可包含 `+#%` 等特殊符號。

## 附件上傳機制

固定 6 個獨立的原生 `<input type="file">`（`Upfile1`~`Upfile6`），全部平行存在於 DOM，非彈窗觸發、非逐一增量注入、也非單一 `multiple` 一次全選的 input。自動化填寫時可依序對 `Upfile1`→`Upfile6` 分別指定各一個檔案，只有第一格為必填。

## 檢舉條文內容

`itemno`（違規事項）選項文字包含明確法條編號＋具體違規行為描述（如「道交31-6未戴安全帽」），文字具體度足夠支援關鍵字/模糊比對。**但清單內容隨 district 動態變化**（由 `GET /TrafficMailbox/GetViolationItems?id=<area>` 依所選 `violation_place_area` 回填），並非固定的全站共用清單，程式若要建立違規條文比對表需針對每個 district 分別取值。

## 無法確定 / 需要人工複核的項目

1. **驗證信箱是否真的在伺服端阻擋送出**：本次未實際點擊「寄送認證郵件」或送出表單（避免使用真實個資），因此「未完成信箱認證時，按下『送出』會被伺服端擋下」這件事只根據頁面說明文字推論，未經實測驗證。
2. **`violation_place_road_search` 的「或輸入道路名稱」文案與其 `readonly` 屬性互相矛盾**：文案暗示可以打字搜尋，但實測該欄位有 `readonly` 屬性、無法直接輸入文字，實際互動方式（是否有其他觸發方式讓它變成可輸入）未進一步測試，列為待複核。
3. **`violation_place_area` 選項同時混雜「行政區」與「快速公路路線」兩種語意**，若程式要把此欄位單純對應 schema 的 `district` role，需要額外處理「快速公路」這幾個非行政區選項要怎麼分類，本次調查未深入判斷。
4. **驗證碼（`checkCode`）為圖形驗證碼**，本次僅確認其存在與必填，未嘗試辨識或繞過。
5. **送出後的實際行為（成功頁面、案件編號格式等）未調查**，因為完整送出需要真實檢舉人資料與通過信箱認證，本次調查未執行送出。
