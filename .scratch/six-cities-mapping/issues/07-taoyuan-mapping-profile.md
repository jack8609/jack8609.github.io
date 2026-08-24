# 07 — 桃園 mapping profile（除 violation、evidenceImages 外）

**What to build：** 建立桃園違規檢舉網站（`tvrweb.typd.gov.tw`）的 mapping profile，涵蓋 date/time（皆歸類 plain）、plate、location（city/village/road 皆已結構化）、description。`violation` 需等票 03（候選元素群組引擎擴充）、`evidenceImages` 需等票 01（file-slots 引擎擴充），本票先跳過並標記待後續處理。

**Blocked by：** None — can start immediately。

**注意事項（前置條件）：** 桃園跟臺北市一樣有「填欄位前」的身分驗證閘門，需使用者先手動填檢舉人資料＋完成信箱驗證才會顯示違規欄位。AI 不可自行 reload/navigate 使用者的桃園分頁，一律等使用者手動完成驗證並告知後才在該分頁上操作。

**Status:** ready-for-agent

## 驗收標準

- [ ] 對應模式綁定桃園網站 date（`#cardate`，plain）、time（`#carTime`，plain）、plate（`CarNum`/`CarNum2` 兩段式，需自行拆分邏輯）、location（`city`/`village`=select 連動、`selectize_Road`=custom 連動、`addStreet`/`addAlley`/`addLane`/`addSubLane`/`addNo`=plain 門牌片段）。
- [ ] `city`=「其他」時的分支（收合成 `shouhou2` 單一 remainder textarea）也要能正確處理。
- [ ] `description` 若對應到 `case_note`，需在票券內註記這是條件式欄位（只有選到「其他」違規時才出現），並記錄這個已知限制。
- [ ] `violation`、`evidenceImages` 明確不綁定，過渡期由使用者手動處理，profile 或票券文件中清楚註記原因（分別等票 03、01）。
- [ ] 使用者已在已通過驗證的桃園分頁上完整跑過一次自動填表（測試假資料），確認除 violation/附件外欄位皆正確填入。
- [ ] 既有 extension contract test 全綠。

## 需要使用者手動驗收的項目

- 使用者需先自行完成桃園網站的身分驗證流程（填檢舉人資料＋信箱驗證），並告知 AI 分頁已就緒，AI 才能開始操作。
- 對應模式的實際綁定操作（含 selectize 搜尋式下拉的點擊/輸入/選取流程）。
- 完整跑一次自動填表流程，特別驗證 `city`=「其他」分支是否正確切換成單一 remainder 欄位。

## 交給下一輪的起手 prompt

> （本票券完成、驗收標準全數勾選後，請實作者在這裡補一段可直接貼給下一輪新對話的起手 prompt，需包含：這張票做了什麼、下一步建議接哪張票（例如 10、11）、需要讀哪些背景文件。）
