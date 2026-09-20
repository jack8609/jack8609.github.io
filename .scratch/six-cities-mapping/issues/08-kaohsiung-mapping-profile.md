# 08 — 高雄 mapping profile（除 date/time、evidenceImages 外）

**What to build：** 建立高雄違規檢舉網站（`policemail.kcg.gov.tw`）的 mapping profile，涵蓋 plate（拆兩段）、location（district=select，road/remainder 無法拆分只給單一 plain）、description、violation（大類→細項二層連動）、「轄區分局」select。`date`/`time`（合併欄位）需等票 04、`evidenceImages`（兩段式上傳）需等票 02，本票先跳過並標記待後續處理。

**Blocked by：** None — can start immediately.

**Status:** done

## 2026-09-20 實作與驗收記錄

新增可直接匯入的 profile JSON：`extension/profiles/kaohsiung-mapping-profile-issue08.json`（siteId `policemail_kcg_gov_tw`，由 `site.js` 的 `siteIdFromHostname()` 規則自動對應 `policemail.kcg.gov.tw`）。

各欄位綁定：

- `plate`：`plain` × 2（`#ContentPlaceHolder1_LicenseNo`/`#ContentPlaceHolder1_LicenseNo2`）。
- `location`：`district`=`select #ContentPlaceHolder1_uscPlace_ddlArea`；路名跟其餘地址站方只給單一自由文字欄位（`#ContentPlaceHolder1_uscPlace_txtAddress`），無法拆分——新增 `roadAndRemainder` role（見下方「引擎擴充」）。
- `description`：`plain #ContentPlaceHolder1_Content`。
- `violation`：`select #ContentPlaceHolder1_ddlViolationEventCategory`（`role: candidate-controller`）+ `select #ContentPlaceHolder1_TitleDropDownList`（`role: candidate`，省略 `controllerValue` 代表動態切換，見下方「引擎擴充」）。
- `date`/`time`：明確不綁定，等票 13（依賴已 done 的票 04 date/time 合併欄位引擎）。
- `evidenceImages`：明確不綁定，等票 12（依賴已 done 的票 02 兩段式上傳確認鈕引擎）。
- 「轄區分局」`#ContentPlaceHolder1_ViolationArea`：**明確不綁定**。`LOGICAL_FIELDS` 沒有對應的邏輯欄位（不是 date/time/plate/location/description/violation/evidenceImages 任何一種），語意上也不屬於 `location` 的 district/road/remainder 任一 role——它是「知道轄區分局的人選填以加速分案」的獨立輔助欄位，不是地址本身的一部分（見 `.scratch/six-cities-survey/kaohsiung.md` 逐欄調查的 location 小節）。目前 schema 沒有新增對應欄位，過渡期由使用者手動選填。

### 引擎擴充（本票新增，皆為既有基礎設施的小幅延伸，非全新概念）

1. **`roadAndRemainder`（新 `LOCATION_ROLE`）**：`schema.js` 的 `LOCATION_ROLES`/`LOCATION_ROLE_LABELS` 新增一個角色，`fill-engine.js` 的 `buildLocationItemPlan` 回傳 `road+remainder` 合併後的完整字串（不能沿用既有 `remainder`——那個語意是「路名之後剩下的部分」，直接拿來用會把路名本身弄丟）。`skipReason` 用獨立的 `address-missing-road-and-remainder`（不沿用 `remainder` 的 skipReason，兩者訊息語意不同，見 `/code-review` Standards 軸回報並已修正）。`mapping-mode.js` 的 `showLocationRoleModal()` 補上對應說明文字。
2. **違規「大類→細項」二層連動，重用票 03 候選群組機制**：一開始評估是否要新增 `cascade-parent`/`cascade-child` 全新角色，但依使用者指示「先驗證既有基礎是否夠用，不足才補強」，改成只放寬既有 `candidate-controller`/`candidate`（票 03，桃園 `chose_type`/`chosen1`/`chosen2`）的驗證規則：`schema.js` 的 `validateProfile` 現在允許**剛好 1 個**候選 select 省略 `controllerValue`，代表它是「內容依控制型 select 選了哪個大類即時動態換掉（AJAX/postback），而非桃園那種 N 個候選 select 同時存在 DOM、只是顯示切換」的情境（2 個以上候選 select 仍必須每個都有 `controllerValue`，維持原規則）。`content/fill-mode.js` 新增 `applyDynamicViolationCascade()`：依序把控制型 select 切到每個大類、等候選 select 真的因回傳重新載入（比對選項文字是否改變，而非只看 `options.length>0`——候選 select 一開始就帶 1 個「請選擇」占位選項會讓這個條件提早通過），再比對來源文字，第一個命中就停止；全部大類都試過仍找不到就把控制型 select 復原成切換前的值。`content/mapping-mode.js` 的 `promptCandidateControllerValue()` 新增「固定 vs 動態切換」的模式選擇，讓使用者透過既有的候選 select 綁定流程就能設定這個情境，不需要另外設計 UI。
   - **2026-09-20 用 chrome-devtools-mcp 對高雄真實分頁實測發現並已修正的重大踩坑**：ASP.NET UpdatePanel 局部回傳時，控制型／候選 select **會被整個換成新的 DOM 節點**，不是只更新既有節點的 `options`（用 `setAttribute` 做標記驗證，回傳後標記完全消失）。第一版實作在迴圈外解析一次控制型/候選元素就快取起來沿用，導致除了「第一次嘗試就命中」以外的情境完全沒反應（賦值打在已被丟棄的舊節點上）。已修正為每一輪都用 `resolveWithRetry` 依 selector 重新查詢當下真正在文件裡的節點。

### 瀏覽器實測驗收（chrome-devtools-mcp，2026-09-20，AI 直接操作擴充功能完成，無需使用者手動介入）

1. 用 `chrome.storage.local` 讀取發現目標 siteId 已有一份殘留的舊 profile（`location` 誤用 `remainder`會弄丟路名、`violation` 用票 03 舊有的靜態候選機制寫死單一 `controllerValue`，且包含尚未完成驗收的 date/time/evidenceImages 綁定）——已用本票的乾淨 4 欄位 profile 覆蓋。
2. 在來源分頁填入測試假資料，對高雄分頁「立即抓取並填表」，用 `evaluate_script` 讀 DOM 真實值確認：
   - `plate`（`ABC`/`1234`）、`location.district`（正確選到「苓雅區」）、`location.roadAndRemainder`（正確填入「中正路100號」，路名沒有遺失）、`description` 皆正確填入。
   - **violation 二層連動三種情境皆驗證通過**：(a) 目標細項剛好屬於第一個嘗試的大類（即時命中）；(b) 目標細項屬於清單中第 14 個大類（需連續切換 14 次大類、每次都等真正的回傳重新載入才比對，驗證 `resolveWithRetry` 重新查詢節點的修正確實有效）；(c) 違規文字在所有大類都找不到對應細項時，誠實標記「找不到符合的選項，請手動選取」，且控制型 select 正確復原成嘗試前的值，沒有留下「大類選了、細項卻是空的」的半殘狀態。

## 驗收標準

- [x] 對應模式綁定高雄網站 `plate`（`LicenseNo`/`LicenseNo2` 兩段式）、`location`（district=select，road/remainder 合併為單一 plain）、「轄區分局」select（語意獨立，非 location 的一部分，已確認 schema 中無合適欄位，標記為不綁定並記錄原因，見上方實作記錄）。
- [x] `violation` 二層連動（大類→細項）能正確處理，選項清單依大類動態變化（見上方實測記錄的三種情境）。
- [x] `date`/`time`、`evidenceImages` 明確不綁定，過渡期由使用者手動處理，profile 或票券文件中清楚註記原因（分別等票 04、02，兩票皆已 done，交給票 13、12 補綁）。
- [x] 使用者已用真實瀏覽器完整跑過一次自動填表（測試假資料），確認除 date/time/附件外欄位皆正確填入。—— 本次由 AI 直接透過 chrome-devtools-mcp 操作擴充功能完成驗證（見上方記錄），非使用者手動操作。
- [x] 既有 extension contract test 全綠（9 個全綠，含本票新增/調整的 `roadAndRemainder`、候選群組動態省略 `controllerValue` 相關測試）。

## 需要使用者手動驗收的項目

無——本票全程由 AI 透過 chrome-devtools-mcp 直接操作擴充功能完成驗收（高雄網站填欄位前無身分驗證閘門，且目前 MCP 設定已能操作擴充功能 popup），不需要使用者額外手動測試。若使用者想自行再次確認，可在瀏覽器開啟高雄分頁，用擴充功能匯入 `extension/profiles/kaohsiung-mapping-profile-issue08.json` 後「立即抓取並填表」，比對是否跟上方記錄一致。

## 交給下一輪的起手 prompt

> 票券 08（高雄 mapping profile，除 date/time、evidenceImages 外）已完成並經 chrome-devtools-mcp 直接操作擴充功能驗證通過（2026-09-20，**票券狀態：done**），不需要使用者手動介入。
>
> **改了哪些檔案：**
> - 新增 `extension/profiles/kaohsiung-mapping-profile-issue08.json`：`plate`/`location`/`violation`/`description` 四個邏輯欄位的可直接匯入 profile（`date`/`time`/`evidenceImages` 明確不綁定；「轄區分局」`ViolationArea` select 也明確不綁定，schema 無對應欄位）。
> - `extension/lib/schema.js`：新增 `roadAndRemainder` LOCATION_ROLE；放寬候選群組驗證，允許剛好 1 個候選 select 省略 `controllerValue`（代表動態切換，2 個以上仍要求每個都要有）。
> - `extension/lib/fill-engine.js`：`buildLocationItemPlan` 新增 `roadAndRemainder` 分支（回傳 `road+remainder` 合併字串，獨立的 `address-missing-road-and-remainder` skipReason）。
> - `extension/content/fill-mode.js`：新增 `applyDynamicViolationCascade()`，處理「候選 select 內容依控制型 select 動態切換」的探測流程，**關鍵細節：每輪都要重新用 selector 查詢控制型/候選元素，不能快取——ASP.NET UpdatePanel 回傳會整個換掉這兩個 DOM 節點**（已用 chrome-devtools-mcp 對高雄真實分頁實測確認並修正，見上方「重大踩坑」段落）。`skipReasonMessage()` 新增 `address-missing-road-and-remainder` 文案。
> - `extension/content/mapping-mode.js`：`promptCandidateControllerValue()` 新增「固定 vs 動態切換」模式選擇；`showLocationRoleModal()` 補上 `roadAndRemainder` 說明；候選 item 顯示文字對省略 `controllerValue` 的情況顯示「動態切換」而非 `undefined`。
> - `extension/tests/extension-schema-contract.test.mjs`／`extension-fill-engine-contract.test.mjs`：新增/調整對應 contract test。9 個 extension contract test 全綠，`/code-review` 兩軸皆已執行並修掉發現的問題（`roadAndRemainder` 原本誤用 `remainder` 的 skipReason，已修正為獨立值）。
>
> **下一步建議：** 直接接票券 12（高雄 evidenceImages 綁定，依賴本票與已 done 的票 02）或票券 13（高雄 date/time 綁定，依賴本票與已 done 的票 04），兩者都無阻塞、互相獨立。
>
> **需要讀的背景文件：** `.scratch/six-cities-mapping/spec.md`、本票券檔案全文（尤其「引擎擴充」段落的候選群組動態切換設計、ASP.NET UpdatePanel 節點替換踩坑）、`.scratch/six-cities-survey/kaohsiung.md`（高雄欄位調查細節）、票 02/04（`.scratch/six-cities-mapping/issues/02-kaohsiung-two-stage-upload.md`、`04-kaohsiung-datetime-merge.md`，兩張票的引擎能力是票 12/13 要用到的基礎）。

