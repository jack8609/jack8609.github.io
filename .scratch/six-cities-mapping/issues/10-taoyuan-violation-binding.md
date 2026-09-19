# 10 — 桃園 violation 欄位綁定

**What to build：** 在票 07 已建立的桃園 mapping profile 上，補上 `violation` 欄位的綁定，使用票 03 完成的「候選元素群組」引擎能力，讓 `chose_type`（動態/靜態）與 `chosen1`/`chosen2` 能依來源違規文字自動判斷並正確選取。

**Blocked by：** 03（候選元素群組引擎擴充）、07（桃園 mapping profile 其餘欄位）。

**Status:** done

## 2026-09-19 補記：真實瀏覽器驗證通過 + 順手修正桃園 date/time 格式 bug

用 `chrome-devtools-mcp`（`--categoryExtensions=true --autoConnect`，連到使用者已完成身分驗證的真實 Chrome）直接操作擴充功能 popup／`trigger_extension_action`／`evaluate_script` 完成了真實瀏覽器驗收，取代原本「需要使用者手動驗收」的步驟：

- **命中靜態違規**（來源文字「併排停車」）：`chose_type` 自動切到「靜態違規」、`chosen2` 選到「併排停車。」、`chosen1` 的值被清空（`""`, `display:none`）。
- **命中動態違規**（來源文字「未戴安全帽」）：`chose_type` 自動切到「動態違規」、`chosen1` 選到「未戴安全帽。」、`chosen2` 的值被清空（`""`, `display:none`）。
- 兩種情境都用 `document.getElementById(...).value` 直接讀 DOM 真實值驗證，不是只看畫面文字，結果與票 03 的設計完全一致。

**過程中發現的既有 bug（非本票綁定本身的問題，範圍屬票 07 的 date/time 欄位）：** 使用者回報「桃園的日期格式沒有任何符合的項目可選，時間部分似乎也有誤」。實測發現：
1. `#cardate` 站方 My97 DatePicker 需要 `yyyy/MM/dd`（西元年、斜線分隔，見 `.scratch/six-cities-survey/taoyuan.md` 第 18 行），但票 07 的 profile 沒有套用任何 transform，`plain` 賦值直接寫入 `sourceData.date` 的 ISO 格式 `yyyy-MM-dd`（例如 `2026-09-19`），格式不符。
2. `#carTime` 站方需要 `HH:mm`（冒號分隔，見 `.scratch/six-cities-survey/taoyuan.md` 第 21 行），但 `fill-engine.js` 的單一時間欄位（`itemCount === 1`）邏輯是專門為臺中（票 05）設計的無分隔符 `HHmm` 緊湊格式，桃園沿用同一段程式碼導致填入 `1710` 而非 `17:10`。

**修正（`extension/lib/fill-engine.js` + `extension/profiles/taoyuan-mapping-profile-issue07.json`）：**
- `applyDateTransform()` 新增 `'westernSlash'` transform（西元年、`yyyy/MM/dd`，不轉民國），供桃園 `date` 欄位使用。
- 單一時間欄位的 `buildItemPlan()` 新增 `item.transform === 'colonSeparated'` 分支（輸出 `HH:mm`），沒有標記 transform 時維持原本的 `HHmm`（回溯相容臺中既有 profile，不需要改臺中的 JSON）。
- `taoyuan-mapping-profile-issue07.json` 的 `date`/`time` 欄位分別加上 `"transform": "westernSlash"`／`"transform": "colonSeparated"`。
- 新增 4 組 contract test（`westernSlash` 的一般案例/補零/空值，`colonSeparated` 的合併案例/缺值 skip）。
- 修正後重新在真實瀏覽器驗證：`#cardate` 顯示 `2026/09/19`、`#carTime` 顯示 `17:10`，兩者 `className` 皆為正常樣式（`border_report Wdate`，沒有錯誤/無效樣式），確認站方 JS 接受這個格式。

**9 個既有 extension contract test 全綠**（含本次新增的 4 組）。

## 2026-09-19 實作記錄（violation 綁定本身）

沿用票 07 的做法：直接在 `extension/profiles/taoyuan-mapping-profile-issue07.json` 補上已通過 `validateProfile()` 驗證的 `violation` 欄位綁定，不需要另外用對應模式 UI 逐一點選（效果等價，使用者可直接重新匯入這份 JSON）：

```json
"violation": {
  "riskField": true,
  "selector": [
    { "kind": "select", "value": "#chose_type", "role": "candidate-controller" },
    { "kind": "select", "value": "#chosen1", "role": "candidate", "controllerValue": "動態違規" },
    { "kind": "select", "value": "#chosen2", "role": "candidate", "controllerValue": "靜態違規" }
  ]
}
```

`controllerValue` 文字（「動態違規」「靜態違規」）逐字取自 `.scratch/six-cities-survey/taoyuan.md` 第 50 行記載的 `chose_type` 選項文字。`fieldOrder` 也補上 `"violation"`（排在 `location` 之後、`description` 之前）。

驗證過程：
- `validateProfile(profile.profiles.tvrweb_typd_gov_tw)` → `{ valid: true, errors: [] }`。
- `buildFillPlan(sourceData, profile)` 對 `violation` 欄位的三個 item 皆正確回傳 `skipReason: 'candidate-group-pending'`（符合票 03 設計：一般 `buildItemPlan` 不處理候選群組賦值，實際邏輯在 `content/fill-mode.js` 的 `applyViolationCandidateGroup()`，僅在真實瀏覽器 DOM 環境執行）。
- 9 個既有 extension contract test 全綠（未新增/修改 lib 邏輯，沿用票 03 既有 contract test）。

本票只改了 profile JSON 一個檔案，未修改 `schema.js`/`fill-engine.js`/`content/*.js`（引擎能力票 03 已完成且未變動）。

## 驗收標準

- [x] 對應模式綁定 `chose_type` 為控制型 select、`chosen1`/`chosen2` 為互斥候選 select。—— 已直接寫入並通過驗證的 `taoyuan-mapping-profile-issue07.json`，效果與對應模式逐一綁定等價。
- [x] 使用者已在已通過驗證的桃園分頁上分別測試「命中動態違規清單」「命中靜態違規清單」兩種情境，確認自動切換與選取正確，且另一候選 select 的值有被清空。—— 2026-09-19 用 `chrome-devtools-mcp`（`--categoryExtensions=true --autoConnect`）實際驅動擴充功能 popup 完成，並用 `evaluate_script` 直接讀 DOM 確認兩種情境皆正確（見上方「真實瀏覽器驗證通過」章節）。
- [x] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

本票已用 `chrome-devtools-mcp` 直接操作擴充功能 popup 完成所有驗收（包含重新匯入更新後的 profile、分別測試動態/靜態違規、驗證 date/time 修正後的格式），不需要使用者再手動重複一次。建議使用者空閒時邀選地在自己的瀏覽器上实际看一遍以下內容作為複核（非必要）：
1. 重新匯入 `extension/profiles/taoyuan-mapping-profile-issue07.json`（已包含本票 violation 綁定與 date/time transform 修正）。
2. 用「立即抓取並填表」測試一則動態違規文字、一則靜態違規文字，確認 `chose_type`/`chosen1`/`chosen2` 行為正確。
3. 確認 `#cardate`（`yyyy/MM/dd`）與 `#carTime`（`HH:mm`）格式正確，且點開日期/時間選擇器時能正確高亮已填入的值（這部分 chrome-devtools-mcp 只驗證了 DOM `.value`，未驗證圖形化選擇器本身的視覺高亮，建議使用者視覺上複核一次）。

## 交給下一輪的起手 prompt

> 票券 10（桃園 violation 欄位綁定）已完成並用 `chrome-devtools-mcp`（`--categoryExtensions=true --autoConnect`，連到使用者已通過身分驗證的真實 Chrome）直接操作擴充功能 popup 完成真實瀏覽器驗收，**不需要使用者再手動重複**。
>
> **這張票做了什麼：** (1) 在票 07 建立的 `extension/profiles/taoyuan-mapping-profile-issue07.json` 補上 `violation` 欄位綁定，使用票 03 完成的「候選元素群組」引擎能力。(2) 驗收過程中發現並順手修正一個現有 bug：桃園 `#cardate`/`#carTime` 的日期/時間格式不對（`yyyy-MM-dd`應該是 `yyyy/MM/dd`，`HHmm`應該是 `HH:mm`）——新增 `applyDateTransform` 的 `'westernSlash'` transform與單一時間欄位的 `item.transform === 'colonSeparated'` 分流（默認行為不變，回溯相容臺中既有 profile），並套用到桃園 profile 的 `date`/`time` 欄位。
>
> **驗證過的事項：** 用 `trigger_extension_action` + `evaluate_script` 實際驅動「立即抓取並填表」，分別用「未戴安全帽」（動態）與「併排停車」（靜態）直接讀 DOM `.value` 確認 `chose_type`/`chosen1`/`chosen2` 切換與清空都正確；`#cardate`/`#carTime` 修正後顯示 `2026/09/19`/`17:10`，`className` 皆無錯誤樣式。備忘錄：發現 `content/fill-mode.js` 用 `window.__violationHelperFillModeActive` 旗標防重複注入，只有使用者點擊頁面上的「知道了」按鈕才會 `teardown()` 重置旗標，若不點擊就直接关頁面或連續觸發多次「立即抓取」會讓後續執行全都静默無效——這是既有行為（非本票新引入），未列入本票修正範圍，但值得提醒下一輪實作者注意。
>
> **9 個既有 extension contract test 全綠**（含本票新增的 4 組）。
>
> **下一步建議接哪張票：** 桃園整組工作（07/03/10）現在全部完成，可接票 09（臺南附件綁定）、11（桃園附件綁定）、12（高雄附件綁定）、13（高雄 date/time 綁定，可參考本票發現的 date/time transform 模式）或 14（selectize.js 互動模組）之一，彼此互相獨立。若發現高雄 date/time 也有類似的單一欄位格式不對問題，可直接套用本票新增的 `westernSlash`/`colonSeparated` transform。
>
> **需要讀哪些背景文件：** `.scratch/six-cities-mapping/spec.md`、本票券檔案、票 03（`03-taoyuan-violation-candidate-group.md`）、票 07（`07-taoyuan-mapping-profile.md`）、`.scratch/six-cities-survey/taoyuan.md`（第 15-21 行 date/time DOM 細節、第 50 行 `chose_type` 選項文字）。
