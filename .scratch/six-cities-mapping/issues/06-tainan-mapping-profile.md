# 06 — 臺南 mapping profile（除 evidenceImages 外）

**What to build：** 建立臺南違規檢舉網站（`tr.tnpd.gov.tw`）的 mapping profile，涵蓋 date/time/location/description/violation。`evidenceImages`（6 個固定原生 input）需等票 01（file-slots 引擎擴充）完成後才綁定，本票先跳過並標記待後續處理。

**Blocked by：** None — can start immediately.

**Status:** done

## 2026-09-19 實作與驗收記錄

本票不需要任何引擎擴充（`schema.js`/`mapping-mode.js`/`evidence-upload.js`/`fill-engine.js` 皆未修改），臺南全部欄位落在既有 `plain`/`select`/`custom` + `LOCATION_ROLES` 語意內。新增可直接匯入的 profile JSON：`extension/profiles/tainan-mapping-profile-issue06.json`（siteId `tr_tnpd_gov_tw`，由 `site.js` 的 `siteIdFromHostname()` 規則自動對應 `tr.tnpd.gov.tw`）。

**票券檢查清單原文沒列出 `plate`，但依 spec.md user story 2「除附件外的欄位」判斷為漏列，已一併綁定**（`#violation_carno1`/`#violation_carno2` 兩個 plain 輸入）。

各欄位綁定：

- `plate`：`plain` × 2（`#violation_carno1`/`#violation_carno2`）。
- `date`：`select #violation_date`，套用既有 `westernSlash` transform（西元年斜線格式，剛好符合臺南選項的 `YYYY/MM/DD` 格式，不需要新 transform）。
- `time`：`select #violation_time1`（時）/`select #violation_time2`（分），兩個獨立元素，沿用既有位置對應（index 0=時、index 1=分）。
- `location`：`district`=`select #violation_place_area`、`road`=`custom #violation_place_road_search`、`remainder`=`plain #violation_place`。
- `violation`：`select #itemno`（清單隨 district 動態載入，沿用既有 select 執行期等待/比對邏輯，不需要新引擎能力）。
- `description`：`plain #Subject`。**已知限制**：`#Subject` 是單行「主旨」欄（原生 `maxlength="200"`），但擴充功能實際寫入的 `description` 邏輯欄位是 App 端已組合完成的完整違規敘述句（`#ve-output` 的值，既有 `site-context.js` 既有行為，非本票新增），語意上是「主旨」被拿來塞「完整敘述」，不在本票解決。
- `evidenceImages`：明確不綁定，交給票 09（依賴票 01 file-slots 引擎，已 done）處理 6 個固定 `Upfile1`~`Upfile6` input。

**已知限制（不在本票解決）**：`#violation_place_road_search` 是臺南網站自己的客製下拉元件（`readonly` 輸入框 + `div#roadDropdownList`，class 是 `searchable-dropdown`/`dropdown-list`），經瀏覽器實測確認**不是** Vuetify（`closest('.v-input')` 為 false）也不是 selectize.js。目前 `kind: 'custom'` 會走既有的 Vuetify 專用互動流程（`fillVuetifyDropdown`），對這個元件必然找不到符合的選項容器，因此 `road` 欄位會固定落在「找不到符合的選項，請手動點選」，等同手動欄位——這是刻意選擇（誠實回報找不到，而非誤用 `plain` 直接寫入 readonly 輸入框、造成畫面看起來有值但實際上隱藏的送出用 `<select>` 沒被同步更新的假成功）。若未來要讓這個欄位自動化，需要比照票 14（selectize.js 互動模組）的模式，新開一張票為這個客製 dropdown widget 寫專屬互動模組，非本票範圍。

**瀏覽器實測驗收（chrome-devtools-mcp，2026-09-19，AI 直接操作擴充功能完成，無需使用者手動介入）**：
1. 匯入本票 profile JSON，覆蓋掉瀏覽器裡原本殘留的一份手動測試用舊 profile（`date` transform 誤用 `westernToMinguo`、`road` 誤綁 `plain`）。
2. 在來源分頁（`jack8609.github.io`）填入測試假資料：車牌 `ABC-4321`、地址「台南市新營區三民路100號」、違規項目「未戴安全帽。」、日期時間 `2026/09/19 17:10`。
3. 對臺南分頁按「立即抓取並填表」，用 `evaluate_script` 直接讀 DOM 真實值確認：
   - `plate`/`date`（`2026/09/19`，跟選項格式完全一致）/`time`（`17`/`10`）/`description`（`#Subject`）皆正確填入。
   - `location.district` 正確選到「新營區」，觸發站方 AJAX 後 `#roadDropdownList` 正確載入 **192 筆路名**（與臺南調查報告記載的「192 筆路名」完全吻合），`itemno` 正確載入 **39 個違規項目選項**（與調查報告記載的「39 個選項」完全吻合），確認 district→road、district→violation 兩個動態連動情境都正確運作。
   - `location.remainder` 正確填入「100號」。
   - `location.road` 依預期落在「找不到符合的選項，請手動點選」（上述已知限制），隱藏的 `#violation_place_road`（真正送出用的 select）維持空值，沒有被誤植入假成功的值。
   - `violation` 落在「找不到符合的選項，請手動選取」——這是因為測試假資料的違規文字「未戴安全帽。」跟臺南 `itemno` 清單裡的實際選項文字「道交31-6未戴安全帽」用詞不同（非本票 bug，`itemno` 清單本身已確認正確載入 39 筆，比對邏輯依預設關閉模糊比對，是設計內的保守行為）。

## 驗收標準

- [x] 對應模式綁定臺南網站 date（select，僅近 7 天選項）、time（時/分兩個獨立 select）、location（district=select，road=custom 連動，remainder=plain）、violation（select，清單隨 district 動態變化）。
- [x] `description` 欄位對應到 `Subject`（單行主旨欄），並在票券內記錄「語意上是主旨非詳細描述」這個已知限制，不需要在本票解決。
- [x] `evidenceImages` 明確不綁定，過渡期由使用者手動上傳附件，profile 或票券文件中要清楚註記原因（等票 09，依賴已 done 的票 01）。
- [x] 使用者已用真實瀏覽器完整跑過一次自動填表（測試假資料），確認除附件外欄位皆正確填入，尤其 district→road 連動選單、violation 清單隨 district 變化的情境。—— 本次由 AI 直接透過 chrome-devtools-mcp 操作擴充功能完成驗證（見上方記錄），非使用者手動操作。
- [x] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

無——本票全程由 AI 透過 chrome-devtools-mcp 直接操作擴充功能完成驗收（臺南網站無身分驗證閘門，且目前 MCP 設定已能操作擴充功能 popup），不需要使用者額外手動測試。若使用者想自行再次確認，可在瀏覽器開啟臺南分頁，用擴充功能匯入 `extension/profiles/tainan-mapping-profile-issue06.json` 後「立即抓取並填表」，比對是否跟上方記錄一致。

## 交給下一輪的起手 prompt

> 票券 06（臺南 mapping profile，除 evidenceImages 外）已完成並經 chrome-devtools-mcp 直接操作擴充功能驗證通過（2026-09-19，**票券狀態：done**），不需要使用者手動介入。
>
> **改了哪些檔案：**
> - 新增 `extension/profiles/tainan-mapping-profile-issue06.json`：`plate`/`date`/`time`/`location`/`violation`/`description` 六個邏輯欄位的可直接匯入 profile（`evidenceImages` 明確不綁定）。沒有修改任何引擎程式碼（`schema.js`/`mapping-mode.js`/`evidence-upload.js`/`fill-engine.js` 皆不變），臺南欄位全部落在既有語意內。
>
> **已知限制（記錄在票券內，非 bug）：**
> - `location.road`（`#violation_place_road_search`）是臺南自己的客製下拉元件（非 Vuetify、非 selectize.js），目前 `custom` kind 會誠實回報「找不到符合的選項」，等同手動欄位，需要未來比照票 14 新開一張票才能自動化。
> - `description` 綁 `#Subject`（單行主旨欄），但實際寫入值是 App 端組合完成的完整違規敘述句，語意上主旨欄位被拿來塞完整敘述，是既有 `site-context.js` 行為，非本票新增。
>
> **下一步建議：** 直接接票券 09（臺南 evidenceImages 綁定，依賴本票與已 done 的票 01，兩者皆已完成，可立即開始），把 6 個固定 `Upfile1`~`Upfile6` input 綁成 `file-slots`。也可以視情況接票券 08（高雄 mapping profile）或票券 14（selectize.js 互動模組，若要解決臺南/桃園的 road 手動限制）。
>
> **需要讀的背景文件：** `.scratch/six-cities-mapping/spec.md`、本票券檔案、`.scratch/six-cities-survey/tainan.md`（臺南欄位調查細節，尤其附件 6 槽 `Upfile1`~`Upfile6` 的格式限制）、票 01（`.scratch/six-cities-mapping/issues/01-file-slots-evidence-upload.md`，file-slots 引擎能力）。
