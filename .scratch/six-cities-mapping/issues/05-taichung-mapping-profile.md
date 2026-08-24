# 05 — 臺中 mapping profile（全欄位）

**What to build：** 建立臺中違規檢舉網站（`tvrweb.police.taichung.gov.tw`）的完整 mapping profile，涵蓋 date/time/plate/location/description/violation/evidenceImages 全部欄位。`plate`/`location`/`description`/`violation`/`evidenceImages` 皆落在既有 `plain`/`select`/`custom`＋`LOCATION_ROLES` 語意內，`evidenceImages` 跟臺北市模式同構（hidden `<input multiple>` + 觸發按鈕，現有 `file-trigger` 的 `assign-all` 分支可直接用）。

**2026-08-24 動工前重新確認實際欄位格式後更正**（原文誤判為「不需要任何引擎擴充」）：臺中 `date`/`time` 的實際 DOM 格式跟臺北/新北都不同，需要 `fill-engine.js` 兩處小型純函式擴充，範圍遠小於 spec 的「引擎擴充 1~4」（不碰 `schema.js`/`mapping-mode.js`/`evidence-upload.js`），已跟使用者對齊：

- **date**：單一 `plain` 輸入框，`maxlength="7"`，格式是民國年緊湊數字、無分隔符（例如西元 2026-08-24 → `1150824`）。`applyDateTransform()` 新增第 4 種轉換 `westernToMinguoCompact`；`mapping-mode.js` 的 `promptDateTransform()` 新增對應第 4 個選項（三選一→四選一）。
- **time**：單一 `plain` 輸入框，`maxlength="4"`，格式是時分合併 4 碼 24 小時制數字（例如 16:30 → `1630`），不是臺北/新北那種時/分兩個獨立元素。`buildItemPlan()` 的 `time` 分支需依「該欄位 selector 陣列長度」分流：綁 1 個 item 時合併 `hour+minute`；綁 2 個時維持現有位置對應行為（臺北/新北不受影響）。

**Blocked by：** None — can start immediately.

**Status:** in-progress（引擎擴充已 commit，等待使用者手動綁定＋真實瀏覽器驗收）

## 驗收標準

- [x] `fill-engine.js` 新增 `westernToMinguoCompact` 日期轉換與 `time` 欄位單一 item 合併賦值邏輯，並補 contract test（含 hour/minute 其中之一缺值時應回傳 `no-source-value`、不猜測的邊界案例）。
- [x] `mapping-mode.js` 的 `promptDateTransform()` 新增「民國緊湊數字格式（例如 1150817）」選項。
- [ ] 對應模式（mapping-mode）綁定臺中網站全部 7 個邏輯欄位，其中 `location` 依 `district`/`road`/`remainder` role 正確標記，`evidenceImages` 綁定為 `file-trigger`，`date` 綁定時選擇「民國緊湊數字格式」，`time` 只綁定 1 個元素。
- [ ] `violation` 欄位（條文具體、非籠統分類）能正確用文字比對/模糊比對選到選項。
- [ ] 使用者已用真實瀏覽器完整跑過一次自動填表（測試假資料），確認所有欄位皆正確填入（`date` 為 7 碼民國數字、`time` 為 4 碼合併數字）、`evidenceImages` 能自動上傳多個檔案。
- [ ] 重新整理頁面後，已綁定的 mapping profile 仍在。
- [x] 既有 + 新增 extension contract test 全綠（9 個 extension contract test）。

## 需要使用者手動驗收的項目

- 對應模式的實際綁定操作（點選臺中網站上的每個欄位，逐一設定角色/kind），這步驟必須在瀏覽器裡親自完成；`date` 綁定時請選擇新增的「民國緊湊數字格式」選項，`time` 只需綁定該網站唯一的合併輸入框（1 個 item 即可，不需要像臺北/新北那樣分別綁時/分兩個元素）。
- 完整跑一次「測試填入假資料」的自動填表流程，確認所有欄位（含附件多檔上傳）都正確填入，特別留意 `violation` 條文選取是否正確命中、`date` 是否為 7 碼無分隔符數字（例如 `1150824`）、`time` 是否為合併後的 4 碼數字（例如 `1630`）。

## 交給下一輪的起手 prompt

> 本輪（2026-08-24）已完成票券 05 的引擎擴充部分並 commit（`4dd9efe`）：`fill-engine.js` 新增 `westernToMinguoCompact` 日期轉換（民國年+月+日無分隔符緊湊數字，例如 `1150824`）與 `time` 欄位「只綁 1 個 item 時合併 hour+minute 成 HHmm」的邏輯（2 個 item 時維持臺北/新北既有位置對應行為不變）；`mapping-mode.js` 的 `promptDateTransform()` 新增對應第 4 個選項；補了 contract test（含 hour/minute 缺值不猜測的邊界案例），9 個 extension contract test 全綠，`/code-review` 兩軸皆無阻塞（僅 3 項非硬性 judgement call：字串當列舉、既有 if/else 鏈變長、參數略多，可留待之後有更多都市欄位差異時再考慮重構，非本票必須處理）。
>
> **尚未完成**：實際在對應模式裡綁定臺中網站全部 7 個邏輯欄位、以及真實瀏覽器完整跑一次測試填入假資料，這兩步都需要使用者親自在瀏覽器裡操作（AI 無法操作擴充功能 popup UI）。下一輪如果是接續本票，直接請使用者在瀏覽器裡完成上述「需要使用者手動驗收的項目」並回報結果即可，不需要重新讀本票以外的背景文件；如果要改接其他票券，可讀 `.scratch/six-cities-mapping/spec.md` 挑票券 06~08（臺南/桃園/高雄 mapping profile）或票券 03/04（桃園違規事項候選元素群組／高雄 date-time 合併欄位引擎擴充），彼此互相獨立無阻塞。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt，需包含：這張票做了什麼、下一步建議接哪張票、需要讀哪些背景文件。）
