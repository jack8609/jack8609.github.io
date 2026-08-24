# 02 — 引擎擴充：兩段式上傳確認鈕（高雄專用）

**What to build：** 讓 `evidenceImages` 欄位除了原本的檔案輸入本身，能再選填綁定一個「確認上傳」按鈕（高雄 `fl_File` 選檔後需再點一次獨立的「上傳」`<input type=submit>` 按鈕，才會被站方累加進附件清單）。賦值完成後，擴充功能自動點擊該確認鈕，不需要使用者自己記得再點一次。

**Blocked by：** None — can start immediately.

**Status:** implemented-pending-manual-verification

## 驗收標準

- [x] `extension/lib/schema.js`/`mapping-mode.js`：`evidenceImages` 欄位新增一個**選填**的「確認上傳按鈕」item 類型（不影響必填的檔案輸入 item 本身），對應模式面板可以額外綁定這個按鈕。**2026-08-24 使用者真實瀏覽器驗收發現並已修正的設計缺陷**：高雄 `fl_File` 是單一原生 `multiple` input，使用者直接點選它（畫面上的「選擇檔案」）會被記錄成單一個 `file-slots` item（沿用票券 01 的分流規則），但原本的限制寫死「確認上傳鈕只能搭配 `file-trigger` 主要 item」，導致綁定「選擇檔案」後完全不會出現「+ 綁定確認上傳鈕」按鈕，只有誤綁「上傳」鈕本身當主要 item 才會出現（兩個 item 因此都指向同一個 `#ContentPlaceHolder1_btnMailFile`，如使用者截圖所示）。已改成「確認上傳鈕只能搭配剛好 1 個主要 item，不限 kind」，`fill-mode.js` 也新增「單一 file-slots 槽位若本身是 `multiple` input，全部檔案一次塞入（等同 assign-all）」的執行期分支。
- [x] 賦值完成後，若欄位有綁定確認鈕，自動點擊它；沒有綁定就維持現有行為不變（不影響臺北/新北既有 profile 的既有測試）。**實作位置更正**：實際點擊邏輯落在 `extension/content/fill-mode.js` 的 `uploadEvidenceFiles()`（`assign-all`、`incremental`、單一 `file-slots` 三個分支都會點），不是票券原文寫的 `evidence-upload.js`——本檔案裡所有 DOM 副作用（賦值、點擊觸發按鈕）本來就統一放在 `fill-mode.js`，`evidence-upload.js` 只放純函式，沿用既有分工慣例。
- [x] 新增邏輯有對應 contract test（純函式部分），既有 extension contract test 全綠（9 個全綠，含本票新增的 `partitionEvidenceSelector` 與 schema 防呆規則測試，已依上述修正調整）。
- [x] `/code-review` 兩軸（Standards + Spec）皆已執行，沒有未處理的硬性違規。
- [ ] 使用者已用真實瀏覽器對高雄網站驗收：選擇檔案後，確認自動點擊「上傳」鈕，檔案確實累加進附件清單。**請先在對應模式面板對 `evidenceImages` 按「清除」重新綁定**：先「綁定」點選畫面上的「選擇檔案」（即 `fl_File` 原生輸入本身，會被記錄成 1 個 `file-slots` item），再按「+ 綁定確認上傳鈕（選填）」點選「上傳」按鈕，兩個 item 應該指向不同元素。

## 需要使用者手動驗收的項目

- **請先清除既有的 `evidenceImages` 綁定再重新綁定**（2026-08-24 第一次真實瀏覽器驗收時發現的舊綁定是錯的：主要 item 跟確認鈕 item 都指向「上傳」按鈕本身，選擇檔案的原生 input 完全沒被綁到）：先按「綁定」點選畫面上的「選擇檔案」（即 `fl_File`），再按「+ 綁定確認上傳鈕（選填）」點選「上傳」。綁完後面板應顯示兩個不同的 selector（一個 `file-slots`、一個 `file-trigger`＋`[確認上傳按鈕]` 標記）。
- 對應模式綁定「確認上傳按鈕」的實際點選流程（需在瀏覽器裡親自操作 popup/對應模式面板）。
- 選擇檔案後觀察「上傳」按鈕是否被自動點擊、附件是否真的累加進高雄網站的附件清單（可能需要等待站方 AJAX 回應才能確認，觀察清單是否即時更新）。
- 若高雄「上傳」按鈕點擊後需要等待 AJAX 回應才能點下一次（SUMMARY.md 列為未實測項目），本票券驗收時請一併確認多檔案情境下是否需要間隔等待，若發現問題請回報但不必在本票券內解決，可另開票。

## 交給下一輪的起手 prompt

> 票券 02（高雄兩段式上傳確認鈕）程式碼已實作完成，僅剩使用者真實瀏覽器手動驗收這一項未打勾。**2026-08-24 使用者第一輪真實瀏覽器驗收失敗並已修正**：原設計把「確認上傳鈕只能搭配 file-trigger 主要 item」寫死，但高雄 `fl_File` 是使用者直接點選會被記錄成 `file-slots` kind 的單一 multiple input，導致綁定「選擇檔案」後看不到「+ 綁定確認上傳鈕」選項（使用者因此誤綁成「上傳」按鈕本身當主要 item，兩個 item 都指向同一元素）。已改成「確認上傳鈕只能搭配剛好 1 個主要 item，不限 kind」，並在 `fill-mode.js` 新增「單一 file-slots 槽位若本身是 multiple input，全部檔案一次塞入」的執行期分支。改了 4 個檔案：`extension/lib/schema.js`（`EVIDENCE_ROLES`/`EVIDENCE_ROLE_LABELS`/`partitionEvidenceSelector`，`validateProfile` 三條規則：確認鈕最多 1 個、只能搭配剛好 1 個主要 item、不能只綁確認鈕沒有主要 item）、`extension/content/mapping-mode.js`（面板「+ 綁定確認上傳鈕」按鈕改成「主要 item 剛好 1 個」時顯示，不限 kind；`+ 新增元素` 在已綁確認鈕時停用，避免破壞 1 對 1 的搭配；`handlePick`/`summarizeEvidenceImagesTestFill`/`appendSelectorDescription` 都用 `partitionEvidenceSelector` 拆分）、`extension/content/fill-mode.js`（`resolveEvidenceUploadTarget` 的 `file-slots` 分支也會解析確認鈕；`uploadEvidenceFiles` 的 `assign-all`／`incremental`／單一 `file-slots` 三個分支完成注入後都會自動點擊確認鈕）、`extension/tests/extension-schema-contract.test.mjs`（更新為「確認鈕可搭配單一 file-slots，但不能搭配 2 個以上」的測試）。9 個 extension contract test 全綠。
>
> 下一步建議：(1) 請使用者先在對應模式面板把 `evidenceImages` 清除重新綁定（見上方「需要使用者手動驗收的項目」的具體步驟），再對高雄網站做真實瀏覽器驗收，驗收通過後把本票券標成 done；(2) 或直接接票券 03（桃園違規事項候選元素群組）或票券 04（高雄 date/time 合併欄位），兩者都無阻塞、跟本票互相獨立。
>
> 需要讀的背景文件：`.scratch/six-cities-mapping/spec.md`（尤其「引擎擴充 2」一節）、本票券檔案全文、`/memories/repo/chrome-extension-project.md`（六都調查段落）。
