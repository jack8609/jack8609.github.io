# 03 — 引擎擴充：違規事項欄位「候選元素群組」（桃園 `chose_type`→`chosen1`/`chosen2`）

**What to build：** 讓 `violation` 欄位可以宣告「一個控制型 select（`chose_type`）＋多個互斥候選 select（`chosen1`/`chosen2`）」的結構，`fill-engine.js` 依來源違規文字比對出屬於哪個候選清單，決定切換控制型 select 到哪個值，並在賦值前主動清空其他候選 select 的值，避免共用 `name` 造成送出時的重複值歧義。

**Blocked by：** None — can start immediately（技術細節已於 2026-08-24 用 chrome-devtools-mcp 對桃園已驗證分頁唯讀實測確認，見 `.scratch/six-cities-survey/taoyuan.md` 與 `SUMMARY.md` 落差 5）。

**Status:** done

## 已知技術事實（供實作參考，不需重新驗證）

- `chosen1`/`chosen2` 兩個 `<select>` 同時存在於 DOM、皆未 `disabled`，僅用 `style.display` 切換可見性。
- 切換 `chose_type` 後，舊選值**不會**被自動清空。
- 兩者共用 `name="chosen"`，`FormData` 唯讀讀取確認兩者的值會同時被序列化（即使一個是 `display:none`）——這代表引擎切換候選時必須**主動清空**非目標候選的值。

## 驗收標準

- [x] `extension/lib/schema.js`：新增「候選元素群組」的 selector item 結構（例如一個 item 標記為控制型、多個 item 各自標記所屬候選群組），有對應驗證邏輯與 contract test。
- [x] `extension/content/mapping-mode.js`：對應模式能讓使用者依序綁定控制型 select 與各個候選 select（含各自的選項清單來源）。
- [x] `extension/lib/fill-engine.js`：新增比對邏輯——依來源違規文字（`resolveOptionMatch` 或類似邏輯）分別跟每個候選清單比對，決定命中哪一個候選群組；決定後回傳「需要先把控制型 select 切到哪個值」＋「需要清空的其他候選 select」＋「目標候選 select 該選的選項」，交給 `content/fill-mode.js` 依序執行（先切控制值、等可見性切換、清空非目標候選、再對目標候選賦值）。
- [x] 純函式部分（比對邏輯、決定要清空哪些候選）有 contract test，涵蓋「命中候選 1」「命中候選 2」「兩邊都沒命中」三種情境。
- [x] 既有 extension contract test 全綠。
- [x] `/code-review` 兩軸（Standards + Spec）皆已執行，沒有未處理的硬性違規。
- [x] 使用者已用真實瀏覽器對桃園網站驗收：分別測試「來源文字命中動態違規清單」與「命中靜態違規清單」兩種情境，確認 `chose_type` 正確切換、目標 select 選到正確條文、另一個候選 select 的值確實被清空。

## 驗收過程中發現並修正的根因（2026-09-06 補記）

手動驗收一開始卡在「不管怎麼綁定都提示找不到對應的違規項目」，用 chrome-devtools-mcp 對已驗證分頁做唯讀實測後定位到兩個根因並修正：

1. `chosen1`/`chosen2` 的選項文字幾乎都帶結尾句號（例如「未戴安全帽。」），但 `modules/app/violation-items.txt` 桃園市清單原本不帶句號，`fuzzyMatchAllowed` 預設 `false` 時完全比對不到。修正：`extension/lib/fill-engine.js` 新增 `stripTrailingTerminalPunctuation()` 與比對層 `terminal-punctuation-normalized`（跟既有的路段幾段數字轉換同等級，屬等價比對、不受 `fuzzyAllowed` 限制），並補上 contract test。
2. `modules/app/violation-items.txt` 的桃園市清單本身跟真實網站選項用字有落差，已依實測抓到的 `chose_type`/`chosen1`/`chosen2` 選項全數改成逐字相同（50 筆）。

控制型 select 切換候選 select 可見性的合成 `change` 事件機制經實測確認運作正常，不是問題來源。

## 需要使用者手動驗收的項目

- 對應模式綁定控制型 select＋候選 select 群組的實際操作流程（需在瀏覽器裡親自完成，chrome-devtools-mcp 無法操作 popup/對應模式面板）。
- 分別測試「違規文字對應動態違規清單」「違規文字對應靜態違規清單」兩種真實填表情境，確認自動選取結果正確、且沒有殘留另一組的舊值。

## 交給下一輪的起手 prompt

> 本票券的程式碼與 contract test 已完成，唯一剩下的是「使用者真實瀏覽器手動驗收」尚未執行，請先讀完這段再接手。
>
> **這張票做了什麼：** 讓 `violation` 邏輯欄位支援「候選元素群組」——一個控制型 select（role: `candidate-controller`）切換顯示哪個候選 select（role: `candidate`，各自帶 `controllerValue` 標記自己對應控制型 select 的哪個選項文字）才生效。填表時（`content/fill-mode.js` 的 `applyViolationCandidateGroup()`）依來源違規文字跑 `lib/fill-engine.js` 新增的 `resolveCandidateGroupMatch()` 決定命中哪個候選群組，依序：切控制型 select → 等可見性切換 → 清空其他候選 select 的值 → 對目標候選 select 賦值。對應模式（`content/mapping-mode.js`）新增兩顆專屬按鈕（「+ 綁定候選群組控制型 select」「+ 新增候選 select」），候選 select 綁定時會問使用者「這個候選對應控制型 select 的哪個選項」（優先讀取已綁定控制型 select 當下真實選項清單讓使用者點選，讀不到才退回自由輸入文字）。
>
> **改了哪些檔案：**
> - `extension/lib/schema.js`：新增 `VIOLATION_ROLES`/`VIOLATION_ROLE_LABELS`/`partitionViolationCandidateGroup()`，`validateProfile` 新增候選元素群組的結構驗證（控制型最多 1 個；有候選就必須剛好 1 個控制型，但允許只綁控制型、還沒綁候選的中間狀態；候選必須帶不重複的 `controllerValue`）。
> - `extension/lib/fill-engine.js`：新增 `resolveCandidateGroupMatch()`（純函式）；`buildItemPlan()` 對 violation 欄位的候選群組 item 一律回傳 `skipReason: 'candidate-group-pending'`，不落入一般 select 賦值分支。
> - `extension/content/fill-mode.js`：新增 `applyViolationCandidateGroup()`；`run()` 偵測到 violation 欄位有候選群組時改呼叫這個函式，不走一般 `applyItem` 逐 item 迴圈。
> - `extension/content/mapping-mode.js`：新增兩顆專屬綁定按鈕、`promptCandidateControllerValue()`/`showTextPromptModal()`、`handlePick()` 的候選群組分支（角色指定、controllerValue 詢問、selector 陣列組裝時保留既有控制型/候選 item）、`summarizeViolationCandidateGroupTestFill()`（測試填入假資料時只驗證解析、不模擬填值/切換）、`appendSelectorDescription()` 顯示候選群組角色。**順手修掉一個發現的既有真 bug**（跟本票無關）：`renderPanel()` 裡 `const actions`/`const body` 各自重複宣告了兩次，這是會讓整個 `mapping-mode.js` 直接 `SyntaxError`、完全無法載入的阻塞性錯誤（`node --check` 可驗證），已合併成各自宣告一次；順手也拿掉一個重複的 `body.appendChild(list)`。
> - `extension/tests/extension-schema-contract.test.mjs`、`extension/tests/extension-fill-engine-contract.test.mjs`：新增對應 contract test。
>
> **9 個既有 extension contract test 全綠**（`Get-ChildItem extension/tests/*.test.mjs | ForEach-Object { node $_.FullName }`），`/code-review` 兩軸皆已跑過，Standards/Spec 兩軸都沒有硬性違規（Spec 軸額外確認了上面那個 bugfix 屬於必要的阻塞性修正，不算 scope creep）。
>
> **需要使用者手動驗收：** 見下面「需要使用者手動驗收的項目」，這步驟 chrome-devtools-mcp 無法代勞（popup/對應模式面板互動）。驗收通過後，把上面最後一條驗收標準勾選、把票券狀態改成 done。
>
> **下一步建議接哪張票：** 票券 04（高雄 date/time 合併欄位），跟本票互相獨立、無阻塞。也可以視使用者驗收本票的回饋，先處理任何真實瀏覽器測試中發現的問題。
>
> **需要讀哪些背景文件：** `.scratch/six-cities-mapping/spec.md`（「引擎擴充 3」一節）、本票券檔案、`.scratch/six-cities-survey/taoyuan.md` 與 `SUMMARY.md` 落差 5（已驗證的技術事實背景）。
