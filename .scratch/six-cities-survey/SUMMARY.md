# 六都檢舉網站調查總彙整（臺中/臺南/桃園/高雄）

> 個別報告：[taichung.md](taichung.md)、[tainan.md](tainan.md)、[taoyuan.md](taoyuan.md)、[kaohsiung.md](kaohsiung.md)。
> 台北市/新北市既有結論見 `PLAN.md`/`PLAN_B.md`，此處僅在比較時引用重點，不重複調查。

## 1. 逐欄跨站比較

| 欄位 | 臺北(既有) | 新北(既有) | 臺中 | 臺南 | 桃園 | 高雄 |
|---|---|---|---|---|---|---|
| 身分驗證閘門 | **有**，需先填資料+認證信箱才顯示違規欄位 | 無 | 無（全欄位同頁可見） | 無（DOM 未鎖，推測送出時才驗） | **有**（同臺北），本次調查用的分頁網址已帶驗證後 token 才誤判成無閘門，2026-08-24 使用者實測確認需先手動填檢舉人資料+信箱驗證才會顯示違規欄位 | 無（驗證發生在送出**之後**，寄信確認） |
| date | 民國年，plain | — | 民國年 7 碼，**plain** | 西元，**select**（僅近 7 天） | 西元，`custom`(My97 iframe，底層仍是 input)，**2026-08-24 實測確認可 plain 直接賦值繞過** | 西元，與 time **合併同一欄位**，`custom`(air-datepicker) |
| time | — | — | 24hr 4 碼合併，**plain** | 時/分兩個獨立 **select** | 西元，`custom`(My97)，與 date 分開，**同上已驗證可 plain 繞過** | 與 date 合併於同一 `custom` 欄位 |
| plate | plain | 需先選違規類型才顯示 | custom(車種)+2×plain | 2×plain（無車種） | 2×plain（無車種） | 2×plain（無車種，且明示不支援多車牌） |
| location | district=custom, road/公里/巷/弄/号=plain | — | district=custom, road=custom(連動,需先選district), 公里/巷/弄/号+交叉路口=plain(同樣連動) | district=select, road=custom(連動), remainder=plain | **站方已結構化**：city/village=select(連動), road=custom selectize(連動), street/巷/弄/衖/号=plain；**選 city=其他時整組收合成單一 remainder textarea** | district=select, road/remainder **無法拆分**只給單一 plain 欄位；另有語意獨立的「轄區分局」select（非 location 的一部分） |
| description | plain | — | plain(textarea) | plain（單行 `Subject`，隱藏 `Content` 非目標） | **無常駐對應欄位**，只有條件式出現的 `case_note`（掛在 violation 而非 description） | plain(textarea) |
| violation | custom | — | custom，條文具體 | select，條文具體，**清單隨 district 動態變化** | select，**`chose_type`(動態/靜態) 切換兩個獨立 select 元件 `chosen1`/`chosen2`（互斥顯示，非同一元素換選項）**，選其他觸發 case_note，見落差 5 | select，**大類→細項二層連動**，條文具體 |
| evidenceImages | file-trigger + 彈窗按鈕 | file-trigger + 逐一增量注入 | file-trigger + `multiple` 一次全選 ✅同臺北模式 | **6 個固定原生 input，非 multiple、非 trigger** | **5 個固定原生 input，非 multiple、非 trigger** | 單一 `multiple` input + **需另按「上傳」鈕才確實送出** |

## 2. 現有 schema/fill-engine 能力 vs 落差

### ✅ 現有能力可直接覆蓋（只需建立新 mapping profile，不用動程式碼）
- **臺中**：date/time/plate/location/description/violation 全部落在既有 `plain`/`select`/`custom` + `LOCATION_ROLES` 語意內；evidenceImages 是「hidden `<input multiple>` + 觸發按鈕」，跟臺北模式完全同構，`file-trigger` 現有的 `assign-all` 分支可直接用。**臺中可以只寫 mapping profile，不需要動 `schema.js`/`fill-engine.js`。**
- **臺南**：date/time/location/description/violation 全部是 `select`/`custom`/`plain` 既有語意（含「district 連動 road/violation」的 API 動態載入模式——這種「選 A 後才 AJAX 灌選項」跟新北市/現有連動邏輯性質相同，引擎不需要知道背後是不是 AJAX，只要選項出現後照樣選取即可）。**但 evidenceImages（6 個固定原生 input）不是現有兩種上傳模式，需要引擎擴充才能自動化**（見下）。

### ⚠️ 需要先擴充 `schema.js`/`fill-engine.js`/`content/evidence-upload.js`/`content/mapping-mode.js` 才能處理的落差

1. **「固定多槽位」附件上傳（臺南 6 槽、桃園 5 槽）**——新的第三種上傳模式。
   - 現況：`evidenceImages` 被 `mapping-mode.js` **寫死**只能綁 1 個 `file-trigger` item，`evidence-upload.js` 只認「`multiple=true` 一次全選」或「點按鈕→比對祖先鏈找新增槽位」兩種模式，都假設「有一個會變化的觸發元件」。
   - 臺南/桃園的情境是「頁面載入時就已經有 N 個固定命名的 `<input type=file>`（`Upfile1~6`／`files1~5`），彼此獨立、不長出新節點、也不是 multiple 屬性」——三種既有模式都套不上。
   - 需要：新增第三種 kind（例如 `file-slots`）或放寬 `evidenceImages` 允許綁定多個 `file`-系 item（每個 item 直接指向一個固定 input），`mapping-mode.js` 解除「evidenceImages 只能 1 個 item」限制（僅對這個新 kind 解除），`evidence-upload.js` 新增「依序把第 i 個檔案指定給第 i 個綁定 input」的直接賦值邏輯（不需要祖先鏈解析、不需要點擊觸發、不需要偵測新增節點）。
   - 影響範圍：臺南、桃園兩都都需要這個擴充才能自動化附件上傳；在擴充完成前，這兩都的 mapping profile 可以「先跳過 evidenceImages，其餘欄位照常自動填」。

2. **「選檔後需另按確認/上傳鈕」的兩段式附件流程（高雄）**——第四種上傳模式。
   - 高雄的 `fl_File`(multiple) 選檔後不會直接算數，必須再點一次獨立的「上傳」`<input type=submit>` 按鈕，才會被站方累加進附件清單；目前 `evidence-upload.js` 的 `assign-all` 分支選完檔案後就結束，不會、也不知道要再點一顆額外按鈕。
   - 需要：讓 evidenceImages 的 mapping 除了觸發/檔案輸入本身，能再選填綁定一個「確認上傳」按鈕，`evidence-upload.js` 在 `assign-all` 完成賦值＋`change` 事件後，若有綁定確認鈕就自動點擊它。這跟情境 1 是不同的擴充點，建議分開設計/分開票券。
   - 在擴充完成前，高雄的 mapping profile 一樣可以先跳過 evidenceImages。

3. **date/time 合併成單一 DOM 欄位（高雄）**——目前的邏輯欄位模型是「一個 profile.fields 各自獨立」，同一個 DOM 元素被 `date` 綁一次、又被 `time` 綁一次時，兩次賦值會互相覆蓋，套不進現有模型。
   - 需要討論：是否新增「複合欄位」概念（例如允許某個 selector item 同時宣告服務於 `date`+`time`，由 fill-engine 讀取兩個邏輯欄位的原始值合併成一個字串再賦值一次），或是換一個角度——只在 `date` 底下綁定，並讓該 item 的 `transform` 有能力讀到 `time` 的來源值（目前 transform 簽章只拿得到自己欄位的值，這點需要確認 `fill-engine.js` 現況才能定案）。
   - 這是本次調查發現裡**設計影響最大**的一項，建議列為需要先開會/開票討論的項目，不要邊做邊改。

4. **Vuetify 以外的 `custom` 元件技術（桃園 My97 DatePicker / 高雄 air-datepicker）——兩都均已於 2026-08-24 實測確認可行，本落差完全解除**：現有 `custom` 互動邏輯（`vuetify-dropdown.js`、`vuetify-dropdown-interaction.js`）本來跟 iframe 內嵌的 My97、或 air-datepicker 這種完全不同的 widget 技術不相容，但實測確認兩都都可以繞過 widget。
   - **桃園**：`plain` 直接賦值＋dispatch `input`/`change`/`blur` 事件，值穩定寫入不被清空，欄位維持 `valid` class 無驗證錯誤，My97 彈窗未被意外觸發。
   - **高雄**：同樣用 chrome-devtools-mcp 實測確認，直接賦值 `'2026-08-01 13:45'`（`YYYY-MM-DD HH:mm` 格式）並 dispatch 三個事件後穩定寫入，未出現驗證錯誤樣式，air-datepicker 彈窗（一直存在於 DOM 但 `opacity:0` 且定位在畫面外的 idle 狀態）未被意外嗚起。
   - **結論**：桃園/高雄的 date/time 均可直接歸類為 `plain`，不需要新建 custom 互動模組。高雄還留下落差 3（date/time 合併成單一 DOM 元素的資料流模型問題），但於本點已確認解法只需組出正確格式字串後單純賦值，不必模擬複雜 widget 互動，複雜度比原先預期低。

5. **違規欄位「類別互斥雙元件」（桃園 `chose_type`→`chosen1`/`chosen2`）**——2026-08-24 使用者手動操作後回報的新落差，**同日已用 chrome-devtools-mcp 對已驗證分頁實測確認細節**：不同於「同一元素 AJAX 換選項」（臺南/高雄的二層連動，現有能力可覆蓋），桃園是**兩個完全獨立的 `<select>` 元素**（`chosen1`/`chosen2`，皆未 `disabled`）由 `chose_type` 互斥切換 `display`，且「該用哪一個」取決於**來源違規文字本身**（動態/靜態），不是站台固定不變的性質。實測確認：切換後**舊選值不會被清空**，且用 `FormData` 唯讀讀取確認**兩個 select 的值會同時被序列化送出**（並非只有可見那個）——代表若引擎切換 `chose_type` 後不主動清空非目標 select 的舊值，送出時會出現同名重複值的歧義。現有 schema 的 selector item 模型（每個 item 各自綁定一個固定 DOM 元素）沒有「依資料內容決定要操作哪個候選元素、並先切換控制欄位、且要清空另一個」的概念，直接套用既有 select 比對邏輯會在文字剛好屬於未綁定那一組時誤判為 `not-found`。
   - 需要：討論是否新增「候選元素群組」概念（例如 violation 欄位允許宣告一個控制型 select + 多個互斥候選 select，fill-engine 依來源文字比對出屬於哪個候選清單，再決定切哪個控制值、等可見性切換後才對該候選元素賦值）。跟落差 3（高雄 date/time 合併）性質類似——都是「現有模型假設不成立」的核心資料流問題，建議一併排入需要先討論設計的項目，不要直接套用既有 select mapping 硬綁。
   - 在定案前，桃園的過渡版 mapping profile 可以先跳過 violation 欄位（或只手動標記需要人工複核），其餘欄位照常自動填。

## 3. 各都結論

| 縣市 | 結論 |
|---|---|
| **臺中** | 只需建立新 mapping profile，**不需要**擴充 `schema.js`/`fill-engine.js`。可直接排入下一步實作。 |
| **臺南** | 除 `evidenceImages` 外都只需 mapping profile；`evidenceImages` 需等「固定多槽位」上傳引擎擴充（落差 1）完成後才能自動化，**擴充完成前可以先做「其餘欄位自動填 + evidenceImages 手動」的過渡版 profile**。 |
| **桃園** | **與台北同樣有身分驗證閘門**（需先手動完成檢舉人資料+信箱驗證才顯示違規欄位，2026-08-24 使用者實測確認）；地址欄位已被站方結構化，mapping 相對直觀；`evidenceImages` 同樣卡在落差 1；**date/time 已實測確認可歸類 `plain`，無需等待落差 4**；violation 欄位卡在落差 5（`chose_type` 互斥雙 select，細節已實測，仍需設計討論）。**建議：先做「除 evidenceImages 與 violation 外」的過渡版 profile（含 date/time），落差 5 定案後再補 violation。** |
| **高雄** | 落差最多的一都：`evidenceImages` 卡落差 2（兩段式上傳）、date/time 卡落差 3（合併欄位，設計影響最大，但 2026-08-24 已驗證 air-datepicker 可 plain 賦值，落差 4 不再需要）。**建議：先確認落差 3 的設計方向（複合欄位 vs transform 擴權），再決定要不要投入這都的完整自動化；短期可以先做「除 date/time/evidenceImages 外都自動填」的過渡版 profile。** |

## 4. 下一步計畫

**可以直接做（不需要討論設計）：**
1. 臺中：直接寫 mapping profile，全欄位（含 evidenceImages）皆可自動化。
2. 臺南/桃園：先寫「除 evidenceImages 外」的過渡版 mapping profile，其餘欄位（含 date/time，臺南是現成 select、**桃園已實測確認可歸類 `plain`**）可自動化；桃園 violation 欄位因落差 5 尚未定案，過渡版先跳過。

**需要先討論設計，再動工（依風險排序）：**
1. **落差 3（高雄 date/time 合併欄位）**：影響 `fill-engine.js` 的核心資料流（transform 是否該能跨欄位讀值），建議先開一次設計討論/拆票，不要邊做边改核心引擎。
2. **落差 1（固定多槽位上傳，臺南+桃園共用）**：影響面是 `schema.js`（新 kind）＋`mapping-mode.js`（解除 1-item 限制）＋`evidence-upload.js`（新賦值邏輯），三個檔案都要動，建議比照當初 `file-trigger` kind 的做法先寫 spec/拆票再實作，且因為兩都共用，值得一次做完。
3. **落差 2（高雄兩段式上傳確認鈕）**：範圍較小（只需在 evidenceImages 的 mapping 上多一個可選的「確認按鈕」item + `evidence-upload.js` 補一段點擊邏輯），風險較低，可以晚一點再排。
4. **落差 4（custom 元件技術）——已完全解除**：桃園、高雄均已實測確認 plain 直接賦值可行，不再需要任何工程擴充，只是 mapping 選擇問題。
5. **落差 5（桃園 violation 類別互斥雙元件）**：2026-08-24 已實測確認細節（兩 select 同時存在、共用 name、切換不清空舊值、FormData 會同時序列化兩者），需先討論是否新增「候選元素群組」概念（含「切換控制欄位時清空非目標候選」的處理），建議跟落差 3 一併排入需要先討論設計的項目。

## 5. 需要人工再確認的不確定項目（彙整自 4 份報告 + 本次統整新增）

- **桃園違規欄位送出時若同名 `chosen` 出現兩個值，後端實際如何處理**（取第一個/最後一個/報錯）：本次僅實測前端序列化行為，未實際送出表單觀察後端反應。
- **臺南「寄送認證郵件」是否真的在伺服端擋住送出**：本次未實際送出表單，只根據頁面文案推論。
- **臺南 `violation_place_road_search` 文案與 `readonly` 屬性矛盾**（文案說可打字搜尋，實際唯讀）。
- **桃園 `selectize_Road2`（交叉路口）是否必填、AJAX 回應 JSON schema 細節**：僅看到 API 路徑，未檢視回傳格式。
- **桃園「巷/弄/衖」在少數地址表達上界線模糊**，跟臺中「地點備註是否真的完全無法規則拆分」是同性質問題，兩都都建議維持「無法自動判斷」的保守標記，除非之後有實際失敗案例再檢討。
- **高雄除「闖紅燈」大類外，其餘 18 個違規大類的細項清單內容未逐一驗證**（連動關係已確認，只是內容未窮舉）。
- **高雄附件「60MB」是單檔上限還是總量上限**、以及「上傳」按鈕點擊後的確切前端行為（是否需要等待 AJAX 回應才能點下一次）未實測。
- **description 在桃園/臺南是否真的沒有可靠對應欄位**（桃園完全沒有常駐欄位；臺南對應到 `Subject` 主旨欄，語意上是「主旨」不是「詳細描述」，是否要沿用需要人工判斷是否影響檢舉品質）。
- **臺中/臺南/桃園是否也存在跟臺北一樣「送出後才會觸發的伺服端額外驗證」**：4 都都只做到「頁面可互動」層級的調查，實際送出行為均未測試（遵守安全鐵律未輸入真實個資）。
