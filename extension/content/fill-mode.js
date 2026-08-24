// P2 自動填表 content script：以 chrome.scripting 注入到目標網站分頁後執行，讀取
// background/service-worker.js（透過 lib/site-context.js 的 runAutoFill）暫存在
// window.__violationHelperSourceData 的來源資料，依欄位對應表把值填進頁面，
// 風險欄位（select/custom）與所有填不了的欄位一律標記待確認，絕不靜默失敗。
// DOM 互動邏輯依專案慣例不寫自動化測試，純決策邏輯在 lib/fill-engine.js（有 contract test）。
(async function () {
  if (window.__violationHelperFillModeActive) {
    return;
  }
  window.__violationHelperFillModeActive = true;

  // 讀完立刻刪除，符合「即時抓取、用完即丟」的設計原則（ADR 0001），即使這裡只是記憶體內的
  // JS 全域變數而非落地儲存，也不要讓資料在頁面生命週期裡多逗留一秒。
  const sourceData = window.__violationHelperSourceData || null;
  delete window.__violationHelperSourceData;

  const [schemaMod, storageMod, siteMod, fillEngineMod, resolveMod, vuetifyMod, addressParserMod, evidenceUploadMod] = await Promise.all([
    import(chrome.runtime.getURL('lib/schema.js')),
    import(chrome.runtime.getURL('lib/storage.js')),
    import(chrome.runtime.getURL('lib/site.js')),
    import(chrome.runtime.getURL('lib/fill-engine.js')),
    import(chrome.runtime.getURL('content/selector-resolve.js')),
    import(chrome.runtime.getURL('content/vuetify-dropdown-interaction.js')),
    import(chrome.runtime.getURL('lib/address-parser.js')),
    import(chrome.runtime.getURL('content/evidence-upload.js'))
  ]);
  const { FIELD_LABELS, partitionEvidenceSelector } = schemaMod;
  const { createProfileStore } = storageMod;
  const { siteIdFromHostname } = siteMod;
  const { buildFillPlan, resolveOptionMatch } = fillEngineMod;
  const { resolveSelectorItem, setNativeValue, hasVuetifyDropdownWrapper, resolveFileTriggerInput } = resolveMod;
  const { fillVuetifyDropdown } = vuetifyMod;
  const { extractRoadNamePrefix } = addressParserMod;
  const { promptForEvidenceFiles, planEvidenceInjection, injectFilesIntoInput, injectFilesIncrementally, injectFilesIntoSlots } = evidenceUploadMod;

  const store = createProfileStore(chrome.storage.local);

  // 雙重注入防護旗的重置集中在這裡，跟 mapping-mode.js 的 teardown() 同一個模式：不管從哪個出口結束
  // （找不到來源資料/沒有 profile/正常跑完）都經過同一個地方重置，不分散在各自的 modal callback 裡。
  function teardown() {
    window.__violationHelperFillModeActive = false;
  }

  // 附件上傳按鈕（見 showAlertModal 的 evidenceTarget 參數）點下去才觸發原生選檔視窗：這顆
  // 按鈕本身的點擊是全新、合法的 user gesture，不像填表流程尾端那樣可能已經失去手勢資格
  // （PLAN_B.md/spec.md 記錄的技術風險，這是已定案的 fallback 設計，見票券 02「背景」段落）。
  async function uploadEvidenceFiles(evidenceTarget, statusEl) {
    const files = await promptForEvidenceFiles();
    if (files.length === 0) {
      statusEl.textContent = '⚠️ 未選擇任何檔案，請手動上傳';
      return;
    }
    // file-slots（臺南/桃園固定多槽位附件，票券 01）：依序把第 i 個選定的檔案指定給第 i 個
    // 綁定槽位，跟 file-trigger 站的祖先鏈反推/逐一點擊觸發按鈕完全是不同的注入方式。
    if (evidenceTarget.mode === 'file-slots') {
      const { slotInputs, confirmButtonEl } = evidenceTarget;
      // 高雄式：只綁了 1 個槽位，且該槽位本身是 multiple input——使用者直接點選 fl_File 會被
      // 記錄成單一個 file-slots item，但它跟臺南/桃園「N 個各自 non-multiple 固定槽位」的
      // 「一個檔案對一個槽位」語意不同，全部選定的檔案都要塞進這一個 input（等同 file-trigger
      // 的 assign-all 行為），見票券 02 使用者真實瀏覽器回報。
      if (slotInputs.length === 1 && slotInputs[0].multiple) {
        injectFilesIntoInput(slotInputs[0], files);
        if (confirmButtonEl) confirmButtonEl.click();
        statusEl.textContent = confirmButtonEl
          ? `✅ 已選定 ${files.length} 個檔案，已自動點擊確認上傳鈕`
          : `✅ 已選定 ${files.length} 個檔案並上傳`;
        return;
      }
      const { filledCount, overflowCount } = injectFilesIntoSlots(slotInputs, files);
      const lines = [`✅ 已選定 ${files.length} 個檔案，成功上傳 ${filledCount} 個`];
      if (overflowCount > 0) lines.push(`⚠️ 有 ${overflowCount} 個檔案超過可綁定的欄位數，請手動上傳`);
      statusEl.style.whiteSpace = 'pre-line';
      statusEl.textContent = lines.join('\n');
      return;
    }
    const { baseInput, triggerEl, confirmButtonEl } = evidenceTarget;
    const injectionPlan = planEvidenceInjection(baseInput, files);
    if (injectionPlan.action === 'assign-all') {
      injectFilesIntoInput(baseInput, injectionPlan.files);
      // 兩段式上傳（高雄，票券 02）：選檔本身不會被站方算數，需再點一次獨立的「上傳」按鈕
      // 才會累加進附件清單；沒有綁定確認鈕的網站（台北市等既有 profile）維持原行為不變。
      if (confirmButtonEl) confirmButtonEl.click();
      statusEl.textContent = confirmButtonEl
        ? `✅ 已選定 ${injectionPlan.files.length} 個檔案，已自動點擊確認上傳鈕`
        : `✅ 已選定 ${injectionPlan.files.length} 個檔案並上傳`;
      return;
    }
    // incremental（新北市 multiple === false，票券 03）：逐一點擊觸發按鈕找新槽位，單一檔案
    // 失敗不中斷其餘檔案，明確列出失敗的第幾個附件，不靜默跳過。
    const { failedIndexes } = injectFilesIncrementally(baseInput, triggerEl, injectionPlan.files);
    // 確認上傳鈕（票券 02）不限定只搭配 assign-all：只要欄位有綁定，不論走哪個 file-trigger
    // 子分支都要點擊，沒有綁定的網站（新北市既有 profile）維持原行為不變。
    if (confirmButtonEl) confirmButtonEl.click();
    const okCount = injectionPlan.files.length - failedIndexes.length;
    const lines = [`✅ 已選定 ${injectionPlan.files.length} 個檔案，成功上傳 ${okCount} 個`];
    if (confirmButtonEl) lines.push('已自動點擊確認上傳鈕');
    failedIndexes.forEach((index) => lines.push(`⚠️ 第 ${index + 1} 個附件無法自動上傳，請手動新增`));
    statusEl.style.whiteSpace = 'pre-line';
    statusEl.textContent = lines.join('\n');
  }

  function showAlertModal(message, { evidenceTarget } = {}) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'vh-fill-modal-overlay';
      const modal = document.createElement('div');
      modal.id = 'vh-fill-modal';
      const heading = document.createElement('div');
      heading.className = 'vh-fill-modal-title';
      heading.style.whiteSpace = 'pre-line';
      heading.textContent = message;
      modal.appendChild(heading);
      if (evidenceTarget) {
        const evidenceRow = document.createElement('div');
        evidenceRow.className = 'vh-fill-modal-evidence';
        const statusEl = document.createElement('div');
        statusEl.className = 'vh-fill-modal-evidence-status';
        statusEl.textContent = '尚未選擇附件';
        const uploadBtn = document.createElement('button');
        uploadBtn.type = 'button';
        uploadBtn.textContent = '選擇附件並上傳';
        uploadBtn.addEventListener('click', () => uploadEvidenceFiles(evidenceTarget, statusEl));
        evidenceRow.appendChild(statusEl);
        evidenceRow.appendChild(uploadBtn);
        modal.appendChild(evidenceRow);
      }
      const actions = document.createElement('div');
      actions.className = 'vh-fill-modal-actions';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = '知道了';
      okBtn.addEventListener('click', () => {
        overlay.remove();
        teardown();
        resolve();
      });
      actions.appendChild(okBtn);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.documentElement.appendChild(overlay);
    });
  }

  if (!sourceData) {
    await showAlertModal(
      '讀不到來源分頁（違規檢舉小幫手網站）的資料。\n\n' +
      '請確認來源分頁還開著、沒有被關閉或導覽到其他網址，且已經填好違規資料後再試一次。'
    );
    return;
  }

  const siteId = siteIdFromHostname(location.hostname);
  const profile = await store.getProfile(siteId);
  if (!profile || !profile.fieldOrder.length) {
    await showAlertModal('這個網站還沒有欄位對應設定，請先用「編輯這個網站的欄位對應」完成對應模式錄製。');
    return;
  }

  function waitFor(predicate, { timeoutMs = 1500, intervalMs = 100 } = {}) {
    return new Promise((resolve) => {
      const start = Date.now();
      const tick = () => {
        const value = predicate();
        if (value) return resolve(value);
        if (Date.now() - start >= timeoutMs) return resolve(null);
        setTimeout(tick, intervalMs);
      };
      tick();
    });
  }

  // 部分欄位是條件式動態插入 DOM（新北市車牌需先選違規類型才出現），填完前一個欄位後
  // 短暫重試等待，而不是一次性查完就放棄（見 site-structure-notes.md「條件式欄位」）。
  function resolveWithRetry(selectorValue) {
    return waitFor(() => resolveSelectorItem(selectorValue));
  }

  // location 欄位的子元素要照「行政區→路名→其餘地址片段」的語意順序處理（路名的選項通常
  // 依賴行政區已選定），跟錄製時的綁定順序無關；沒有標角色的 item 排最後，反正一律待確認。
  const LOCATION_ROLE_PRIORITY = { district: 0, road: 1, remainder: 2 };
  function orderFieldItems(fieldName, items) {
    if (fieldName !== 'location') return items;
    return [...items].sort((a, b) => {
      const pa = a.item.role ? LOCATION_ROLE_PRIORITY[a.item.role] : 99;
      const pb = b.item.role ? LOCATION_ROLE_PRIORITY[b.item.role] : 99;
      return pa - pb;
    });
  }

  function skipReasonMessage(reason) {
    switch (reason) {
      case 'no-source-value': return '來源網站沒有這個欄位的資料，需要手動填寫';
      case 'unsupported-kind': return '附件上傳這個階段不會自動處理，請手動上傳';
      case 'address-missing-district': return '地址字串解析不出行政區，請手動選擇';
      case 'address-missing-road': return '地址字串解析不出路名，請手動確認或選擇';
      case 'address-missing-remainder': return '地址字串沒有路名後面的其餘內容，請手動填寫';
      case 'unassigned-role': return '這個子元素沒有標記地址角色，不會自動處理，請手動填寫';
      default: return '無法自動處理，請手動確認';
    }
  }

  const needsReviewEls = [];
  function appendBadge(el, message) {
    const rect = el.getBoundingClientRect();
    const badge = document.createElement('div');
    badge.className = 'vh-needs-review-badge';
    badge.textContent = '待確認';
    badge.title = message;
    badge.style.left = `${rect.left + window.scrollX}px`;
    badge.style.top = `${rect.top + window.scrollY - 10}px`;
    // 點掉只是清掉當次頁面上的視覺標記，不寫回 summaryLines，彙總視窗維持記錄原始填表結果。
    badge.addEventListener('click', () => {
      badge.remove();
      el.classList.remove('vh-needs-review');
    });
    document.documentElement.appendChild(badge);
  }

  const summaryLines = [];
  function markNeedsReview(fieldLabel, message, el) {
    summaryLines.push(`⚠️ ${fieldLabel}：${message}`);
    if (el) {
      el.classList.add('vh-needs-review');
      needsReviewEls.push(el);
      appendBadge(el, message);
    }
  }

  function markFilled(fieldLabel, message) {
    summaryLines.push(`✅ ${fieldLabel}：${message}`);
  }

  // 解析 selector 找不到元素時的「標記待確認」是好幾個呼叫點共用的同一組動作
  // （resolve→null 檢查→markNeedsReview），抽出來避免各自維護一份一樣的三段式。
  async function resolveOrMarkNeedsReview(selectorValue, fieldLabel, notFoundMessage) {
    const el = await resolveWithRetry(selectorValue);
    if (!el) markNeedsReview(fieldLabel, notFoundMessage, null);
    return el;
  }

  async function applyItem(fieldName, fieldLabel, itemPlan, fuzzyAllowed) {
    if (itemPlan.skipReason) {
      const el = await resolveWithRetry(itemPlan.item.value);
      markNeedsReview(fieldLabel, skipReasonMessage(itemPlan.skipReason), el);
      return;
    }

    const el = await resolveOrMarkNeedsReview(
      itemPlan.item.value, fieldLabel, 'selector 解析不到元素，可能已失效，請重新綁定這個欄位'
    );
    if (!el) return;

    const { kind } = itemPlan.item;
    // 不論記錄的 kind 是什麼，只要元素本身位於「下拉/自動完成」容器（.v-select/.v-autocomplete）
    // 內，就要跟 kind==='custom' 欄位一樣走點擊式選單流程——賦值＋dispatch 事件在可打字的
    // v-autocomplete/v-combobox 上不可靠，容易出現「畫面看起來有值，但失焦後被清空」的假象
    // （見 spec.md 問題 4/5），路名這類 kind:'plain' 子元素也涵蓋得到，不用逐欄位維護白名單。
    const isVuetifyDropdownFlow = kind === 'custom' || hasVuetifyDropdownWrapper(el);

    if (isVuetifyDropdownFlow) {
      const triggerRoot = el.closest('.v-input') || el;
      // 「路名」子元素打字篩選要用去掉段號的前綴（非完整含段號文字），不然 Vuetify 內建篩選會
      // 把段號數字寫法（中文/阿拉伯數字）跟輸入不同的正確選項直接濾到不渲染，
      // findMatchingOptionIndex 的雙向 canonicalize 完全沒機會執行（見 fillVuetifyDropdown
      // 的 filterText 參數註解）。其餘欄位（日期/時分/違規事實/行政區）沒有這個問題，不傳
      // filterText 沿用原本「篩選文字＝比對文字」的行為。
      const filterText = itemPlan.item.role === 'road' ? extractRoadNamePrefix(itemPlan.targetValue) : undefined;
      const result = await fillVuetifyDropdown(triggerRoot, itemPlan.targetValue, { filterText });
      markNeedsReview(
        fieldLabel,
        result.matched ? `已自動選取「${itemPlan.targetValue}」，請再次確認是否正確` : '找不到符合的選項，請手動點選',
        el
      );
      return;
    }

    if (kind === 'plain') {
      setNativeValue(el, itemPlan.targetValue);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      markFilled(fieldLabel, `已填入「${itemPlan.targetValue}」`);
      return;
    }

    if (kind === 'select') {
      // 連動 select（例如新北市選完行政區才動態填入路名選項）元素可能已存在但選項還沒填好，
      // 短暫等到非 disabled 且有選項再讀，而不是抓到當下那一瞬間的空/舊選項清單。
      await waitFor(() => (!el.disabled && el.options && el.options.length > 0) || null);
      const optionTexts = Array.from(el.options || []).map((o) => o.textContent.trim());
      const match = resolveOptionMatch(optionTexts, itemPlan.targetValue, {
        valueMap: itemPlan.item.valueMap, fuzzyAllowed
      });
      if (match.matched) {
        el.value = el.options[match.index].value;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // select 一律是風險欄位，不論選取成功與否都要標記待確認（PLAN.md）。
      markNeedsReview(
        fieldLabel,
        match.matched ? `已自動選取「${optionTexts[match.index]}」，請再次確認是否正確` : '找不到符合的選項，請手動選取',
        el
      );
      return;
    }
  }

  // evidenceImages 走專用流程（PLAN_B.md「已定案設計」），不套用上面 plain/select/custom 的
  // 一般 applyItem 邏輯——那套邏輯是「賦值/選單點選」，附件欄位要做的是「解析出上傳 input，
  // 交給彙總視窗的按鈕觸發選檔」。這裡只負責解析，不等待使用者選檔（選檔的原生視窗需要真正
  // 的 user gesture 才能可靠觸發，見 uploadEvidenceFiles 與票券 02「背景」段落的技術風險）。
  // 僅當目前網站的欄位對應表有綁定 evidenceImages 才進入這個流程，沒綁定（或還沒做過票券 01
  // 綁定的舊 profile）行為完全不變，回傳 null 讓呼叫端不顯示附件上傳按鈕。
  // 一併回傳 triggerEl（不只 baseInput）：新北市 multiple === false 時，逐一增量注入
  // （票券 03）需要重複點擊這顆觸發按鈕本身，不能只靠已解析出的第一顆 input。
  async function resolveEvidenceUploadTarget() {
    const field = profile.fields.evidenceImages;
    if (!field) return null;
    const fieldLabel = FIELD_LABELS.evidenceImages;

    // 確認上傳按鈕（高雄兩段式上傳，.scratch/six-cities-mapping/issues/02-kaohsiung-two-stage-upload.md）
    // 是與主要檔案輸入 item 分開綁定的選填 item，不影響 field.selector[0] 永遠是主要 item
    // 的假設；schema.js 的 validateProfile 已擋下「確認鈕搭配不止 1 個主要 item」與「只綁確認鈕」
    // 這兩種無意義組合，這裡不需要重複檢查。
    const { confirmItem, primaryItems: primarySelector } = partitionEvidenceSelector(field.selector);
    if (!primarySelector.length) {
      markNeedsReview(fieldLabel, '找不到主要的附件上傳欄位設定，請重新綁定這個欄位', null);
      return null;
    }

    // file-slots（臺南/桃園固定多槽位附件，票券 01：
    // .scratch/six-cities-mapping/issues/01-file-slots-evidence-upload.md）：每個 item 直接
    // 綁定一個固定 input，不像 file-trigger 需要祖先鏈反推，逐一解析即可。
    if (primarySelector[0].kind === 'file-slots') {
      const slotInputs = [];
      for (const item of primarySelector) {
        const input = await resolveWithRetry(item.value);
        if (input) slotInputs.push(input);
      }
      if (!slotInputs.length) {
        markNeedsReview(fieldLabel, '找不到任何附件上傳欄位，可能已失效，請重新綁定這個欄位', null);
        return null;
      }
      if (slotInputs.length < primarySelector.length) {
        markNeedsReview(
          fieldLabel, `只找到 ${slotInputs.length}/${primarySelector.length} 個附件欄位，部分槽位可能已失效`, null
        );
      }
      summaryLines.push(`ℹ️ ${fieldLabel}：請按下面「選擇附件並上傳」按鈕選取檔案`);
      // 確認上傳按鈕只能搭配剛好 1 個主要 item（schema.js 已擋下其他組合），對應高雄
      // fl_File 這種單一 multiple input 被使用者直接點選、記錄成單一個 file-slots item 的案例（見
      // 票券 02 使用者手動驗收回報），不限 file-trigger 才解析確認鈕。
      const confirmButtonEl = confirmItem ? await resolveWithRetry(confirmItem.value) : null;
      return { mode: 'file-slots', slotInputs, confirmButtonEl };
    }

    const triggerEl = await resolveOrMarkNeedsReview(
      primarySelector[0].value, fieldLabel, 'selector 解析不到觸發元素，可能已失效，請重新綁定這個欄位'
    );
    if (!triggerEl) return null;

    const baseInput = resolveFileTriggerInput(triggerEl);
    if (!baseInput) {
      // 錯誤處理沿用「填不了就明確提醒，不要靜默失敗」原則（票券 02 驗收標準），用票券原文措辭。
      markNeedsReview(fieldLabel, '找不到附件上傳欄位，請手動上傳', triggerEl);
      return null;
    }
    // 確認上傳按鈕本身不需要祖先鏈反推，這裡直接解析錄製時記下的元素。找不到也不擋住主流程，
    // 因為按鈕是選填的，沒綁定確認按鈕的網站（台北/新北）要維持現有行為不變。
    const confirmButtonEl = confirmItem ? await resolveWithRetry(confirmItem.value) : null;
    summaryLines.push(`ℹ️ ${fieldLabel}：請按下面「選擇附件並上傳」按鈕選取檔案`);
    return { mode: 'file-trigger', baseInput, triggerEl, confirmButtonEl };
  }

  async function run() {
    const settings = await store.getSettings();
    const plan = buildFillPlan(sourceData, profile);
    for (const fieldPlan of plan) {
      if (fieldPlan.fieldName === 'evidenceImages') continue; // 附件走 resolveEvidenceUploadTarget()，見上方註解
      const fieldLabel = FIELD_LABELS[fieldPlan.fieldName] || fieldPlan.fieldName;
      const orderedItems = orderFieldItems(fieldPlan.fieldName, fieldPlan.items);
      for (const itemPlan of orderedItems) {
        await applyItem(fieldPlan.fieldName, fieldLabel, itemPlan, settings.fuzzyMatchAllowed);
      }
    }

    const evidenceTarget = await resolveEvidenceUploadTarget();

    if (needsReviewEls[0]) {
      needsReviewEls[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    await showAlertModal(
      `自動填表結果（風險欄位與填不了的欄位已在頁面上標記「待確認」）：\n\n${summaryLines.join('\n')}`,
      { evidenceTarget }
    );
  }

  await run();
})();
