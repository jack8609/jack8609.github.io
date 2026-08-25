# 違規檢舉小幫手專案規格書

## 目的

這是一個純前端、在瀏覽器本機完成影片處理的違規檢舉輔助工具。它提供影片預覽、TS 容器重封裝、剪輯、完整轉檔、縮圖、Canvas 編輯、車牌 OCR，以及違規資料文字產生。

主要入口是 [index.html](../index.html)。應用程式程式碼位於 [modules/app](../modules/app)，由 [modules/app/bootstrap.js](../modules/app/bootstrap.js) 唯一組裝。

## 執行環境

- 以支援 ESM、WebAssembly、Canvas 與 Service Worker 的現代瀏覽器執行。
- 請從 HTTP server 開啟，不要直接以 `file:` URL 載入。開發時可使用：

```powershell
py -m http.server 4173 --bind 127.0.0.1
```

- FFmpeg、OpenCV、Tesseract、PlateOCR 都在使用者本機下載或執行；沒有後端服務。

## 不可違反的架構規則

### 唯一共享入口

跨模組資料與行為只能由 `window.ViolationHelper` 存取：

```js
{
  dom: {},
  config: {},
  state: { ui: {}, video: {}, ffmpeg: {}, ocr: {} },
  services: {},
  modules: {},
  utils: {}
}
```

不得新增 `window.App`、`window.state`、未命名 window 欄位或第二個全域單例。模組內可有私有閉包狀態，但其他模組不可讀取它。

### 不可修改的外部資產

下列檔案與目錄是既有引擎或資料來源，除非需求明確，不能搬移、重新命名或重新封裝：

- `ffmpeg/`
- `core/`
- `plate-ocr/plate-ocr.js`
- `opencv/`
- `tesseract/`
- `coi-serviceworker.min.js`

違規項目下拉選單的初始化邏輯已合併進 `violation-editor.js`（見下方模組清單），不再有獨立的 `violation_list.js`/`window.initViolationDropdowns`。資料本身放在兩個位置的 `violation-items.txt`（見「違規項目資料檔」一節），`violation-editor.js` 建立 `#city-select` 與 `#ve-violation` 後會非同步抓取並合併這兩份清單。

`index.html` head 的一般 script 會在初始繪製前讀取警語保存時間並隱藏 overlay。它不是 ESM，必須保留其位置與行為。

## 啟動流程

[modules/app/bootstrap.js](../modules/app/bootstrap.js) 的 `bootstrap()` 是唯一啟動點，順序不可任意調換：

1. `getViolationHelper()` 建立 DOM 快取與跨模組 state。
2. 初始化 config、utils、logger、disclaimer、theme、OCR service。
3. 建立違規編輯器，再註冊 timeline service。
4. 安裝 rail 的 `ResizeObserver`。
5. 載入與啟動 FFmpeg service。
6. 建立私有 EditorLite API，註冊影片操作 handlers。
7. 以兩個 animation frame 重繪時間軸選取色帶。

這個順序處理了下列依賴：

- `logger` 需要 `utils`。
- 違規編輯器與快照編輯器需要 `services.ocr`。
- `utils.resetClipUI()` 需要 `services.timeline` 在實際影片操作前完成註冊。
- `video-actions` 需要 FFmpeg、timeline 與 EditorLite API。

## 模組清單

| 模組 | 匯出或公開 API | 擁有責任 |
| --- | --- | --- |
| `state.js` | `getViolationHelper()` | 建立唯一共享物件、一次性固定 DOM 快取、跨模組 state 初值。 |
| `constants.js` | `initializeConfig()` | storage key、原始 OCR URL、FFmpeg URL 與可變 `remuxArgs`。 |
| `utils.js` | `registerUtils()` | 時間格式、URL 釋放、下載、檔名推斷、檔案轉位元組、按鈕與剪輯 UI 重設。 |
| `logger.js` | `initializeLogger()` | Log 面板、`log`、`errlog`、toast、Log 複製。 |
| `disclaimer.js` | `initializeDisclaimer()` | 警語捲動解鎖、接受後淡出、30 天保存。 |
| `theme.js` | `initializeTheme()` | 保存或系統主題判定、切換、`data-theme` 與標籤同步。 |
| `ocr-integration.js` | `initializeOcrIntegration()`，`services.ocr` | OCR script 串流下載、進度、引擎執行、車牌回填與 busy 保護。 |
| `violation-editor.js` | `initializeViolationEditor(root)`，`modules.violationEditor` | 違規表單、輸出句、複製、OCR toggle 保存與預熱、違規項目下拉清單（抓取＋合併兩個 `violation-items.txt`）。 |
| `ffmpeg-service.js` | `initializeFfmpegService()`，`services.ffmpeg` | ESM 入口、SW 等待、FFmpeg 實例、核心載入、log/progress 轉送。 |
| `timeline.js` | `initializeTimeline()`，`services.timeline` | metadata、播放時間、雙滑桿、預覽跳轉與選取色帶。 |
| `snapshot-editor.js` | `createSnapshotEditor()`，`modules.editorLite` | EditorLite 所有 Canvas、繪圖、裁切、產圖與清單私有狀態。 |
| `video-actions.js` | `initializeVideoActions()` | 選檔、TS 重封裝、剪輯、完整轉檔、縮圖與 EditorLite 協調。 |
| `bootstrap.js` | `bootstrap()` | 唯一組裝、依賴順序與頁面層級協調。 |

## 共享契約

### `state`

- `state.ui`: `theme`、`isLogVisible`、`isDisclaimerDismissed`。
- `state.video`: 原始檔、可預覽 Blob、TS 自動轉封裝 Blob、Object URL、最後縮圖 URL。
- `state.ffmpeg`: `ctor`、`instance`、`isReady`、`error`。
- `state.ocr`: `libsPromise`、`isBusy`、`isAutoEnabled`。

### `services`

```js
services.ocr.load();
services.ocr.recognize(canvas);

await services.ffmpeg.start();
services.ffmpeg.instance;

services.timeline.updateSelectionBar();
services.timeline.clampAndPreview(which);
services.timeline.resetClipUI(duration);
```

影片操作只能經由 `services.ffmpeg.instance` 操作虛擬檔案與執行命令。快照編輯器只可以呼叫 `services.ocr.recognize(canvas)`。

### `modules`

```js
modules.violationEditor.init(root);

modules.editorLite.init(host, { videoEl, snapshotURL });
modules.editorLite.loadSnapshot(url);
modules.editorLite.isReady();
```

### `utils`

```js
utils.log(...messages);
utils.errlog(...messages);
utils.fmt(seconds);
utils.toast(message);
utils.revokeURL(url);
utils.setActionsEnabled(enabled);
utils.resetClipUI(duration);
utils.triggerDownloadFromBlob(blob, filename);
utils.inferInputName(filename);
utils.fileToUint8Array(fileOrBlob);
```

只有兩個以上模組需要的 helper 才加入 `utils`；單一模組使用的 helper 保持私有。

## 關鍵相容性條件

### OCR

- OCR 載入 URL 必須維持 `constants.js` 中的原始相對 URL，且最後一個必須是 `./plate-ocr/plate-ocr.js`。
- 載入後必須使用裸識別字：

```js
if (typeof PlateOCR !== 'undefined') {
  await PlateOCR.runPipeline(blob);
}
```

- 禁止使用 `window.PlateOCR`。現有引擎可提供 lexical binding，但不保證建立 `window` 屬性。

### FFmpeg

- FFmpeg URL 必須由 `new URL(..., import.meta.url)` 在 `constants.js` 建立。
- `config.ffmpeg.remuxArgs` 是影片流程可修改的工作陣列；不要將它改成每次重建或移到 service 私有狀態。
- 不得變更剪輯、重封裝與完整轉檔的 FFmpeg 參數、輸出名稱或輸出格式，除非需求明確。

### EditorLite 與影片

- Canvas 幾何、圖層、文字、馬賽克、裁切與產圖清單都必須留在 `snapshot-editor.js` 閉包。
- `video-actions.js` 只使用 EditorLite 的三個公開方法，不得讀取 Canvas 私有狀態。
- 替換縮圖時，已初始化的 editor 必須使用 `loadSnapshot(url)`，不要重建 editor。

### 違規項目資料檔（`violation-items.txt`）

- 兩個位置都會被 `violation-editor.js` 非同步抓取、合併：跟隨程式碼的 `modules/app/violation-items.txt`（隨版本控管、視為官方預設基準清單）與專案 root 的 `violation-items.txt`（與 `index.html` 同目錄，供之後不改程式碼即可自行新增/調整項目）。
- 合併策略：以 `modules/app/` 那份為基底，root 那份逐項「附加」；同一縣市底下文字完全相同的項目自動跳過，不會出現重複選項。
- 檔案格式：`# 縣市名稱` 開新分類，其後每行一個違規項目文字（不需要引號或逗號）；空白行忽略；分類標題底下若沒有任何項目就不會成立，因此可以安心把純文字說明也用 `#` 開頭寫在檔案裡。
- `通用` 是特殊分類：所有縣市的下拉選單都會自動聯集「通用＋該縣市專屬項目」；`通用` 本身也可以直接被選取。
- 讀取相容 UTF-8（含 BOM）與 Big5 編碼、CRLF/LF/CR 換行，解析失敗或抓不到檔案時視為空清單，不會讓整個違規編輯器掛掉。

## 驗證

執行所有語法、契約與 CRLF 相容 diff 檢查：

```powershell
& .\tools\validate-app-contracts.ps1
```

單一模組驗證：

```powershell
& .\tools\validate-app-module.ps1 `
  -ModulePath .\modules\app\<module>.js `
  -TestPath .\tests\<module>-contract.test.mjs
```

`validate-app-module.ps1` 會以 UTF-8 暫存 `.mjs` 檔交給 Node 做 syntax check。不要改回 `Get-Content | node --check`，因為 Windows PowerShell 5 管線可能破壞中文字串。

每次變更後應執行對應單元契約、完整聚合驗證與人工功能驗證。瀏覽器 Console 與功能驗證由人工進行。

## 維護流程

### 新增模組

1. 確定責任只屬於一個清楚的功能邊界。
2. 若需要跨模組資料或行為，先擴充既有 `ViolationHelper` 契約；不要建立新全域。
3. 在 `modules/app/` 建立 ESM，僅 export 一個初始化函式或明確 factory。
4. 先新增 `<module>-contract.test.mjs`，再在 `bootstrap.js` 依依賴順序匯入和啟動。
5. 將測試加入 `tools/validate-app-contracts.ps1`。
6. 對新檔、bootstrap、HTML 執行診斷與全量驗證，再做人工驗證。

### 移除模組

1. 先搜尋它的 import、`services`、`modules`、`utils` 與測試引用。
2. 由 `bootstrap.js` 移除 import 與啟動呼叫。
3. 移除公開契約欄位與該模組測試、聚合驗證清單項目。
4. 確認沒有其他模組從已移除欄位取得閉包資料。
5. 執行全量驗證與人工回歸。

### 修改既有功能

1. 從本表找出功能擁有模組；不要在 `index.html` 加回業務程式。
2. 先擴充或調整該模組契約測試，讓它能否證新行為。
3. 維持既有 DOM id、使用者文案、外部資產路徑、FFmpeg 參數與公開 API，除非需求明確要求改變。
4. 若涉及 OCR、FFmpeg、EditorLite、違規下拉資料或啟動順序，先重讀本規格的關鍵相容性條件。

## 目錄導覽

```text
index.html                 Page shell and single bootstrap script
modules/app/               Application ESM modules
modules/app/violation-items.txt
                           Baseline violation dropdown list (bundled with code)
violation-items.txt        Project-root violation dropdown list (beside index.html)
ffmpeg/, core/             FFmpeg wrapper and WebAssembly runtime
plate-ocr/, opencv/, tesseract/
                           OCR engine assets
tests/                     Per-module Node contract tests
tools/                     PowerShell syntax and aggregate validators
doc/PROJECT_SPEC.md        This handover specification
```