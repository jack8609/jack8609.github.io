# 瀏覽器驗收操作手冊（chrome-devtools-mcp + 違規檢舉小幫手擴充功能）

給下一手 AI：讀完本檔 + 對應票券檔案，即可自動完成開發並在真實瀏覽器操作驗收。

## 0. 前置設定（`.vscode/` 有 gitignore，此設定不會被 commit，可能要自己補）

`.vscode/mcp.json`：

```json
{
  "servers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--categoryExtensions=true", "--autoConnect"]
    }
  }
}
```

- `--categoryExtensions=true` → 解鎖 `list_extensions`/`trigger_extension_action`/`install_extension`/`reload_extension` 這幾個工具。
- `--autoConnect` → 連到使用者「真實在跑」的 Chrome（保留登入/身分驗證狀態），不是另開乾淨 profile。
- 改完 mcp.json 要請使用者重啟 MCP server 才會生效。

## 1. 連線步驟

1. 使用者需先手動開一個真實 Chrome，前往 `chrome://inspect/#remote-debugging` 並勾選允許遠端偵錯（AI 不能自己 navigate `chrome://` 網址，工具會擋）。**每次開新 Chrome 視窗都要重新勾一次。**
2. 呼叫 `list_pages` 確認連線成功、能看到使用者已開的分頁。
3. 呼叫 `list_extensions` 確認「違規檢舉小幫手」擴充功能已安裝、取得它的 ID（沒裝就用 `install_extension(path)` 指向 `extension/` 資料夾，unpacked 安裝）。

## 2. 操作擴充功能（等同使用者手動點 popup）

1. 用 `select_page(pageId, bringToFront: true)` 把**目標網站**（例如桃園檢舉分頁）切成作用中分頁——popup 的邏輯是抓「目前作用中分頁」，不是抓來源分頁。
2. 呼叫 `trigger_extension_action(id)` 模擬點擊工具列圖示，popup 會變成一個真的 Extension Page，出現在下一次 `list_pages` 結果裡。
3. 對這個 popup page 用 `take_snapshot` 拿 uid，`click`/`fill`/`upload_file` 跟操作一般網頁完全一樣。
4. 常用按鈕：「編輯這個網站的欄位對應」（對應模式）、「立即抓取並填表」、「更多設定」展開後有「匯入 JSON」（file input，可以直接 `upload_file` 塞路徑，不用手動選檔）。
5. popup 成功動作後會 `setTimeout` 自動關閉（~800ms），失敗才會留著顯示錯誤訊息。

## 3. 驗證填表結果

- 不要只看 accessibility snapshot 的文字（`markNeedsReview` 標記的「✅/⚠️」是給人看的摘要，可能被舊面板疊在一起造成誤判）。
- 一律用 `evaluate_script` 直接讀 DOM 真實狀態，例如：
  ```js
  () => ({ value: document.getElementById('cardate').value, cls: document.getElementById('cardate').className })
  ```
- 驗證 select 類欄位時連 `display`/`value` 一起讀（例如桃園候選 select 群組要確認非目標候選的值真的被清空、不是只有畫面上看不到）。

## 4. 已知陷阱

- **重複注入會被靜默擋下**：`extension/content/fill-mode.js` 用 `window.__violationHelperFillModeActive` 全域旗標防重複注入，只有使用者點掉填表結果彈窗的「知道了」按鈕才會 `teardown()` 重置。**每次「立即抓取並填表」後，若要再測一次，一定要先把上次彈窗的「知道了」點掉**，否則下一次呼叫從頭到尾完全不執行、也不會有任何錯誤訊息，很像「沒反應」。
- **官方文件互相矛盾**：GitHub 文件說 `--categoryExtensions` 不相容 `--autoConnect`（要等 v149），但 Chrome for Developers 官方頁面示範兩者併用。實測（2026-09 當下 Chrome 版本）兩者可以一起用，若未來又不行，改回只用 `--autoConnect`，靠使用者手動點 popup 配合 AI 讀 DOM 驗證。
- **不可自行 reload/navigate 使用者已完成身分驗證的分頁**（桃園、臺北這類有驗證閘門的網站）。要測試新情境（換違規文字等）時，去改「違規檢舉小幫手」來源分頁（`https://jack8609.github.io/`）的欄位值，不要碰目標網站分頁本身。
- 新開的 Chrome 視窗預設沒有使用者原本分頁；要請使用者重新開來源分頁 + 目標網站分頁（含身分驗證）。

## 5. 完整票券工作流程

1. 讀 `spec.md` + 對應票券檔案，理解「What to build」「Blocked by」「驗收標準」。
2. 照既有慣例改 `extension/lib/*.js`／`extension/content/*.js`／profile JSON。
3. 補 contract test，跑 `Get-ChildItem extension/tests/*.test.mjs | ForEach-Object { node $_.FullName }` 全綠。
4. 依上面 1~3 節在真實瀏覽器操作驗收（能自動做的都自動做，不用等使用者手動重複）。
5. 更新票券檔案：勾驗收標準、補「交給下一輪的起手 prompt」與「需要使用者手動驗收的項目」（真的無法自動化的部分才留給使用者）。
6. **驗收完成後立刻 `git add` + `commit` + `push` 到目前分支**（每張票都要做，不要留到最後一次補推）。
