# 10 — 桃園 violation 欄位綁定

**What to build：** 在票 07 已建立的桃園 mapping profile 上，補上 `violation` 欄位的綁定，使用票 03 完成的「候選元素群組」引擎能力，讓 `chose_type`（動態/靜態）與 `chosen1`/`chosen2` 能依來源違規文字自動判斷並正確選取。

**Blocked by：** 03（候選元素群組引擎擴充）、07（桃園 mapping profile 其餘欄位）。

**Status:** pending-user-verification

## 2026-09-19 實作記錄

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
- [ ] 使用者已在已通過驗證的桃園分頁上分別測試「命中動態違規清單」「命中靜態違規清單」兩種情境，確認自動切換與選取正確，且另一候選 select 的值有被清空。
- [x] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

1. 開啟擴充功能 popup →「匯入」→ 重新選擇 `extension/profiles/taoyuan-mapping-profile-issue07.json`（已包含本票新增的 `violation` 綁定），確認匯入成功。
2. 在已通過驗證的桃園分頁上，用「立即抓取並填表」分別測試：
   - 一則**動態違規**測試文字（例如「未戴安全帽」，對應 `chosen1` 清單）：確認 `chose_type` 自動切到「動態違規」、`chosen1` 選到正確條文、`chosen2` 的值被清空。
   - 一則**靜態違規**測試文字（例如「併排停車」，對應 `chosen2` 清單）：確認 `chose_type` 自動切到「靜態違規」、`chosen2` 選到正確條文、`chosen1` 的值被清空。
   - 一則兩邊都比對不到的文字，確認回報「找不到符合的選項，請手動選取」而非誤選。
3. 若匯入失敗或想改用對應模式手動綁定，才需要走「+ 綁定候選群組控制型 select」「+ 新增候選 select」流程（票 03 已實作）。

驗收通過後，請把上面第二條勾選、把票券狀態改成 `done`。

## 交給下一輪的起手 prompt

> 票券 10（桃園 violation 欄位綁定）程式碼與 JSON 已完成，唯一剩下的是「使用者真實瀏覽器手動驗收」尚未執行，請先讀完這段再接手。
>
> **這張票做了什麼：** 在票 07 建立的 `extension/profiles/taoyuan-mapping-profile-issue07.json` 補上 `violation` 欄位綁定，使用票 03 完成的「候選元素群組」引擎能力——`#chose_type` 標記為 `candidate-controller`，`#chosen1`/`#chosen2` 標記為 `candidate` 並各自帶 `controllerValue`（「動態違規」/「靜態違規」，逐字取自 `.scratch/six-cities-survey/taoyuan.md`）。`fieldOrder` 補上 `violation`。**只改了這一個 JSON 檔案**，未修改任何 `lib`/`content` 程式碼（引擎能力已在票 03 完成且未變動）。
>
> **驗證過的事項：** `validateProfile()` 回傳 `valid: true`；`buildFillPlan()` 對 `violation` 欄位三個 item 皆回傳 `skipReason: 'candidate-group-pending'`（符合設計，真正的候選群組賦值邏輯在 `content/fill-mode.js` 的 `applyViolationCandidateGroup()`，只能在真實瀏覽器 DOM 跑）；9 個既有 extension contract test 全綠。
>
> **尚未完成：** 使用者需要在已通過驗證的桃園分頁上，用「立即抓取並填表」分別測試「命中動態違規」「命中靜態違規」「兩邊都沒命中」三種情境（見上面「需要使用者手動驗收的項目」），確認自動切換 `chose_type`、選到正確候選條文、且非目標候選 select 的值有被清空。驗收通過後把票券狀態改成 `done`。
>
> **下一步建議接哪張票：** 若驗收發現問題，先處理回報的問題；若驗收通過，桃園整組工作（07/03/10）就全部完成，可接票 09（臺南附件綁定）、11（桃園附件綁定）、12（高雄附件綁定）、13（高雄 date/time 綁定）或 14（selectize.js 互動模組）之一，彼此互相獨立。
>
> **需要讀哪些背景文件：** `.scratch/six-cities-mapping/spec.md`、本票券檔案、票 03（`03-taoyuan-violation-candidate-group.md`，引擎能力設計與已驗證技術事實）、票 07（`07-taoyuan-mapping-profile.md`，profile 其餘欄位背景）、`.scratch/six-cities-survey/taoyuan.md`（`chose_type`/`chosen1`/`chosen2` 選項文字實測記錄）。
