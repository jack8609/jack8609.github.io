# 03 — 引擎擴充：違規事項欄位「候選元素群組」（桃園 `chose_type`→`chosen1`/`chosen2`）

**What to build：** 讓 `violation` 欄位可以宣告「一個控制型 select（`chose_type`）＋多個互斥候選 select（`chosen1`/`chosen2`）」的結構，`fill-engine.js` 依來源違規文字比對出屬於哪個候選清單，決定切換控制型 select 到哪個值，並在賦值前主動清空其他候選 select 的值，避免共用 `name` 造成送出時的重複值歧義。

**Blocked by：** None — can start immediately（技術細節已於 2026-08-24 用 chrome-devtools-mcp 對桃園已驗證分頁唯讀實測確認，見 `.scratch/six-cities-survey/taoyuan.md` 與 `SUMMARY.md` 落差 5）。

**Status:** ready-for-agent

## 已知技術事實（供實作參考，不需重新驗證）

- `chosen1`/`chosen2` 兩個 `<select>` 同時存在於 DOM、皆未 `disabled`，僅用 `style.display` 切換可見性。
- 切換 `chose_type` 後，舊選值**不會**被自動清空。
- 兩者共用 `name="chosen"`，`FormData` 唯讀讀取確認兩者的值會同時被序列化（即使一個是 `display:none`）——這代表引擎切換候選時必須**主動清空**非目標候選的值。

## 驗收標準

- [ ] `extension/lib/schema.js`：新增「候選元素群組」的 selector item 結構（例如一個 item 標記為控制型、多個 item 各自標記所屬候選群組），有對應驗證邏輯與 contract test。
- [ ] `extension/content/mapping-mode.js`：對應模式能讓使用者依序綁定控制型 select 與各個候選 select（含各自的選項清單來源）。
- [ ] `extension/lib/fill-engine.js`：新增比對邏輯——依來源違規文字（`resolveOptionMatch` 或類似邏輯）分別跟每個候選清單比對，決定命中哪一個候選群組；決定後回傳「需要先把控制型 select 切到哪個值」＋「需要清空的其他候選 select」＋「目標候選 select 該選的選項」，交給 `content/fill-mode.js` 依序執行（先切控制值、等可見性切換、清空非目標候選、再對目標候選賦值）。
- [ ] 純函式部分（比對邏輯、決定要清空哪些候選）有 contract test，涵蓋「命中候選 1」「命中候選 2」「兩邊都沒命中」三種情境。
- [ ] 既有 extension contract test 全綠。
- [ ] `/code-review` 兩軸（Standards + Spec）皆已執行，沒有未處理的硬性違規。
- [ ] 使用者已用真實瀏覽器對桃園網站驗收：分別測試「來源文字命中動態違規清單」與「命中靜態違規清單」兩種情境，確認 `chose_type` 正確切換、目標 select 選到正確條文、另一個候選 select 的值確實被清空。

## 需要使用者手動驗收的項目

- 對應模式綁定控制型 select＋候選 select 群組的實際操作流程（需在瀏覽器裡親自完成，chrome-devtools-mcp 無法操作 popup/對應模式面板）。
- 分別測試「違規文字對應動態違規清單」「違規文字對應靜態違規清單」兩種真實填表情境，確認自動選取結果正確、且沒有殘留另一組的舊值。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt，需包含：這張票做了什麼、改了哪些檔案、下一步建議接哪張票（例如 10）、需要讀哪些背景文件。）
