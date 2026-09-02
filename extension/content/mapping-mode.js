// 對應模式 content script：以 chrome.scripting 注入到目標網站分頁後執行。
// DOM 互動邏輯（挑選/高亮/彈窗）依協議手動於瀏覽器驗證，不寫自動化測試（見 extension/PLAN.md 測試策略）。
(async function () {
  if (window.__violationHelperMappingModeActive) {
    return;
  }
  window.__violationHelperMappingModeActive = true;

  const [schemaMod, storageMod, siteMod, selectorMod, resolveMod] = await Promise.all([
    import(chrome.runtime.getURL('lib/schema.js')),
    import(chrome.runtime.getURL('lib/storage.js')),
    import(chrome.runtime.getURL('lib/site.js')),
    import(chrome.runtime.getURL('lib/selector.js')),
    import(chrome.runtime.getURL('content/selector-resolve.js'))
  ]);
  const {
    LOGICAL_FIELDS, createEmptyProfile, upsertField, removeField, LOCATION_ROLES, LOCATION_ROLE_LABELS,
    EVIDENCE_ROLE_LABELS, FIELD_LABELS, partitionEvidenceSelector, VIOLATION_ROLE_LABELS, partitionViolationCandidateGroup,
    DATETIME_ROLE_LABELS, findDateTimeMergeItem
  } = schemaMod;
  const { createProfileStore } = storageMod;
  const { siteIdFromHostname, originPatternFromUrl } = siteMod;
  const { buildSelectorCandidates, detectFieldKind, labelRelativeCandidateMatches, buildAttributeFingerprint } = selectorMod;
  const {
    collectNearbySelectedValues, accessibleLabelText, fallbackLabelText,
    siblingIndexOfType, resolveSelectorItem, setNativeValue, hasVuetifyWrapper,
    resolveSelect2Select, resolveFileTriggerInput
  } = resolveMod;

  const store = createProfileStore(chrome.storage.local);
  const siteId = siteIdFromHostname(location.hostname);
  const originPattern = originPatternFromUrl(location.href);

  let profile = await store.getProfile(siteId);
  if (!profile) {
    profile = createEmptyProfile({
      siteId,
      displayName: document.title || location.hostname,
      matchPatterns: [originPattern]
    });
    await store.saveProfile(profile);
  }


  let pickingField = null;
  let hoverEl = null;
  // 最近一次「測試填入假資料」的結果，只是暫存在記憶體讓面板顯示，不會存進 profile。
  let testResults = null;

  const panel = document.createElement('div');
  panel.id = 'vh-mapping-panel';
  document.documentElement.appendChild(panel);

  const highlightBox = document.createElement('div');
  highlightBox.id = 'vh-mapping-highlight';
  highlightBox.style.display = 'none';
  document.documentElement.appendChild(highlightBox);

  // 面板固定在右上角時會擋住畫面元件，改成可拖動；用事件委派（不會被 renderPanel 的 innerHTML 重繪清掉）。
  let dragState = null;
  function onPanelDragStart(evt) {
    if (!evt.target.closest('.vh-mapping-title')) return;
    const rect = panel.getBoundingClientRect();
    dragState = { startX: evt.clientX, startY: evt.clientY, startLeft: rect.left, startTop: rect.top };
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = 'auto';
    document.addEventListener('mousemove', onPanelDragMove);
    document.addEventListener('mouseup', onPanelDragEnd);
    evt.preventDefault();
  }
  function onPanelDragMove(evt) {
    if (!dragState) return;
    const maxLeft = Math.max(0, window.innerWidth - panel.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - panel.offsetHeight);
    const left = Math.min(Math.max(0, dragState.startLeft + (evt.clientX - dragState.startX)), maxLeft);
    const top = Math.min(Math.max(0, dragState.startTop + (evt.clientY - dragState.startY)), maxTop);
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
  function onPanelDragEnd() {
    dragState = null;
    document.removeEventListener('mousemove', onPanelDragMove);
    document.removeEventListener('mouseup', onPanelDragEnd);
  }
  panel.addEventListener('mousedown', onPanelDragStart);

  // location 欄位的子元素填表時，沒標 role 的一律被跳過只標待確認（見 lib/fill-engine.js
  // 的註解），重新綁定時要能一眼看出哪些子元素還沒標，回傳 DOM 節點而非純字串是為了讓
  // 這個警示能有獨立的視覺樣式（.vh-mapping-status-warn），跟已標角色的子元素明顯區分。
  function appendSelectorDescription(container, items, fieldName) {
    items.forEach((item, idx) => {
      if (idx > 0) container.appendChild(document.createTextNode(', '));
      const v = item.value;
      const text = typeof v === 'string' ? v : (v.value || v.labelText || v.type);
      if (fieldName === 'location') {
        if (item.role) {
          container.appendChild(document.createTextNode(`${item.kind}:${text} [${LOCATION_ROLE_LABELS[item.role] || item.role}]`));
        } else {
          const warn = document.createElement('span');
          warn.className = 'vh-mapping-status-warn';
          warn.textContent = `${item.kind}:${text} [⚠️ 未標角色]`;
          container.appendChild(warn);
        }
      } else if (fieldName === 'evidenceImages' && item.role === 'confirm-upload') {
        container.appendChild(document.createTextNode(`${item.kind}:${text} [${EVIDENCE_ROLE_LABELS[item.role]}]`));
      } else if (fieldName === 'violation' && item.role === 'candidate-controller') {
        container.appendChild(document.createTextNode(`${item.kind}:${text} [${VIOLATION_ROLE_LABELS[item.role]}]`));
      } else if (fieldName === 'violation' && item.role === 'candidate') {
        container.appendChild(document.createTextNode(`${item.kind}:${text} [${VIOLATION_ROLE_LABELS[item.role]}→${item.controllerValue}]`));
      } else if ((fieldName === 'date' || fieldName === 'time') && item.role === 'datetime-merge') {
        container.appendChild(document.createTextNode(`${item.kind}:${text} [${DATETIME_ROLE_LABELS[item.role]}]`));
      } else {
        container.appendChild(document.createTextNode(`${item.kind}:${text}`));
      }
    });
  }

  function renderPanel() {
    panel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'vh-mapping-title';
    title.textContent = `⠿ 違規檢舉小幫手 — 對應模式（${profile.displayName}）`;
    title.title = '拖曳可移動面板位置';
    panel.appendChild(title);

    // 「測試填入假資料」/「完成」跟標題一樣固定在頂部，不隨清單捲動，避免每次都要先捲到最下面才按得到。
    const actions = document.createElement('div');
    actions.className = 'vh-mapping-actions';
    const testFillBtn = document.createElement('button');
    testFillBtn.type = 'button';
    testFillBtn.textContent = '測試填入假資料';
    testFillBtn.title = '用目前已綁定的 selector 嘗試在頁面上填入假資料，驗證是否真的能定位到欄位（純前端模擬，不會送出表單）';
    testFillBtn.addEventListener('click', runTestFill);
    actions.appendChild(testFillBtn);
    const doneBtn = document.createElement('button');
    doneBtn.type = 'button';
    doneBtn.textContent = '完成';
    doneBtn.addEventListener('click', teardown);
    actions.appendChild(doneBtn);
    panel.appendChild(actions);

    // 標題列固定不動，下面才是可捲動區塊（見 mapping-mode.css 的 flex 版面），避免面板拉高、
    // 捲到下方對應欄位時標題（拖曳把手）被遮住還要先捲回頂端才能移動視窗。
    const body = document.createElement('div');
    body.className = 'vh-mapping-body';
    panel.appendChild(body);

    const list = document.createElement('ul');
    list.className = 'vh-mapping-list';
    for (const fieldName of LOGICAL_FIELDS) {
      const field = profile.fields[fieldName];
      const li = document.createElement('li');
      li.className = `vh-mapping-item${field ? ' vh-mapping-item--bound' : ''}`;

      const label = document.createElement('span');
      label.className = 'vh-mapping-label';
      label.textContent = FIELD_LABELS[fieldName] || fieldName;
      li.appendChild(label);

      const status = document.createElement('span');
      status.className = 'vh-mapping-status';
      if (field) {
        appendSelectorDescription(status, field.selector, fieldName);
      } else {
        status.appendChild(document.createTextNode('未綁定'));
      }
      const testNote = testResults && testResults[fieldName] ? ` ｜ 測試：${testResults[fieldName]}` : '';
      if (testNote) status.appendChild(document.createTextNode(testNote));
      li.appendChild(status);

      const bindBtn = document.createElement('button');
      bindBtn.type = 'button';
      bindBtn.textContent = field ? '重新綁定' : '綁定';
      // 票券 03：violation 欄位一旦綁了候選群組（控制型 select + 候選 select），這顆一般「重新
      // 綁定」按鈕（append=false）會用單一新元素整個覆蓋掉 selector 陣列，把候選群組全部沖掉——
      // 想換掉候選群組要先按「清除」重來，不能用這顆按鈕。
      const hasViolationCandidateGroup = fieldName === 'violation' && field &&
        field.selector.some((item) => item.role === 'candidate-controller' || item.role === 'candidate');
      // 票券 04：date/time 一旦綁了合併欄位（同一個 DOM 元素同時服務 date+time），這顆一般
      // 「重新綁定」按鈕理由跟上面 hasViolationCandidateGroup 一樣——單一新元素會整個覆蓋掉
      // selector，破壞掉「兩邊都要指向同一個元素」的結構，想換掉要用專屬按鈕或先「清除」。
      const dateTimeMergeItem = (fieldName === 'date' || fieldName === 'time') && field && findDateTimeMergeItem(field.selector);
      bindBtn.disabled = hasViolationCandidateGroup || !!dateTimeMergeItem;
      bindBtn.title = hasViolationCandidateGroup
        ? '這個欄位已綁定候選群組，請用下面的專屬按鈕調整，或先「清除」再重新綁定'
        : (dateTimeMergeItem ? '這個欄位已綁定日期/時間合併欄位，請用下面的專屬按鈕調整，或先「清除」再重新綁定' : '');
      bindBtn.addEventListener('click', () => startPicking(fieldName, false));
      li.appendChild(bindBtn);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '+ 新增元素';
      addBtn.title = '同一邏輯欄位對應多個 DOM 元素時使用（例如車牌兩段）';
      // evidenceImages 的 file-trigger 固定只允許 1 個 item（PLAN_B.md），沒有「多綁一個」的
      // 情境；file-slots（票券 01：固定多槽位附件）則相反，需要依序多次點選才能綁滿 N 個槽位，
      // 只在這個 kind 底下才開放「+ 新增元素」。已經綁了確認上傳鈕（票券 02）時也要停用：
      // 確認上傳鈕只能搭配剛好 1 個主要 item，再新增下去會被 schema.js 擋下存檔。violation 欄位
      // 綁了候選群組、date/time 欄位綁了合併欄位時也要停用，理由同上面 bindBtn。
      const isFileTriggerField = fieldName === 'evidenceImages' && field && field.selector[0].kind === 'file-trigger';
      const hasConfirmUploadBound = fieldName === 'evidenceImages' && field &&
        field.selector.some((item) => item.role === 'confirm-upload');
      addBtn.disabled = !field || isFileTriggerField || hasConfirmUploadBound || hasViolationCandidateGroup || !!dateTimeMergeItem;
      addBtn.addEventListener('click', () => startPicking(fieldName, true));
      li.appendChild(addBtn);

      // 確認上傳按鈕（票券 02：高雄選檔後還要再按一次獨立的「上傳」鈕才會生效）是 evidenceImages
      // 專屬、選填的額外綁定，跟上面「+ 新增元素」（綁多個主要檔案輸入）分開一顆按鈕，避免混在一起。
      // 只有主要 item 剛好 1 個時才開放這顆按鈕：不限 file-trigger 或 file-slots——高雄 fl_File
      // 是單一 multiple input，使用者直接點選它會被記錄成單一個 file-slots item，若卡在只認
      // file-trigger 會讓這個真實案例綁不了確認鈕（見票券 02 使用者手動驗收回報）；臺南/桃園那種
      // 2 個以上各自獨立槽位的 file-slots 才是真正不相容（見 schema.js 的 validateProfile）。
      if (fieldName === 'evidenceImages' && field) {
        const { confirmItem, primaryItems } = partitionEvidenceSelector(field.selector);
        if (primaryItems.length === 1) {
          const confirmBtn = document.createElement('button');
          confirmBtn.type = 'button';
          confirmBtn.textContent = confirmItem ? '重新綁定確認上傳鈕' : '+ 綁定確認上傳鈕（選填）';
          confirmBtn.title = '部分網站（例如高雄）選好檔案後還需要再按一次獨立的「上傳」按鈕才會生效，這裡可選填綁定那顆按鈕';
          confirmBtn.addEventListener('click', () => startPicking(fieldName, false, 'confirm-upload'));
          li.appendChild(confirmBtn);
        }
      }

      // 候選元素群組（票券 03：桃園違規事項 chose_type→chosen1/chosen2）是 violation 欄位專屬、
      // 選填的另一種綁定方式，跟一般「綁定」/「+ 新增元素」（單一固定 select）分開，這樣台北/
      // 新北市既有的單一 select 綁定方式不受影響。控制型 select 要先綁，才開放「+ 新增候選
      // select」——不然候選 select 沒有控制值可以問（promptCandidateControllerValue 會讀取控制型
      // select 目前的選項清單），也會存出「有候選卻沒有控制型」的無效狀態。
      if (fieldName === 'violation') {
        const controllerBoundItem = field &&
          field.selector.find((item) => item.role === 'candidate-controller');
        const controllerBtn = document.createElement('button');
        controllerBtn.type = 'button';
        controllerBtn.textContent = controllerBoundItem ? '重新綁定候選群組控制型 select' : '+ 綁定候選群組控制型 select（選填）';
        controllerBtn.title = '部分網站（例如桃園）用一個控制型 select 切換顯示不同的候選違規清單，這裡綁定那顆控制型 select';
        controllerBtn.addEventListener('click', () => startPicking(fieldName, false, 'candidate-controller'));
        li.appendChild(controllerBtn);

        const candidateBtn = document.createElement('button');
        candidateBtn.type = 'button';
        candidateBtn.textContent = '+ 新增候選 select（選填）';
        candidateBtn.title = controllerBoundItem
          ? '依序綁定每個候選違規清單 select，並指定切到控制型 select 的哪個選項時才會用到這份清單'
          : '請先綁定候選群組控制型 select，才能新增候選 select';
        candidateBtn.disabled = !controllerBoundItem;
        candidateBtn.addEventListener('click', () => startPicking(fieldName, true, 'candidate'));
        li.appendChild(candidateBtn);
      }

      // date/time 合併欄位（票券 04：高雄違規日期/時間單一 DOM 元素）是 date、time 兩個欄位
      // 專屬、選填的另一種綁定方式，只在 date 欄位這一列放一顆專屬按鈕（不分開放兩顆），因為綁定
      // /清除都是同一個動作、一次處理兩個欄位（見 handlePick／clearField 對應邏輯），放兩顆容易
      // 讓使用者誤以為要各自綁一次。
      if (fieldName === 'date') {
        const mergeItem = field && findDateTimeMergeItem(field.selector);
        const mergeBtn = document.createElement('button');
        mergeBtn.type = 'button';
        mergeBtn.textContent = mergeItem ? '重新綁定日期/時間合併欄位' : '+ 綁定日期/時間合併欄位（選填）';
        mergeBtn.title = '部分網站（例如高雄）違規日期與時間合併成同一個欄位，這裡綁定那個共用元素，綁定後日期/時間兩個邏輯欄位會自動標記為使用同一元素';
        mergeBtn.addEventListener('click', () => startPicking('date', false, 'datetime-merge'));
        li.appendChild(mergeBtn);
      }

      if (field) {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = '清除';
        clearBtn.addEventListener('click', () => clearField(fieldName));
        li.appendChild(clearBtn);
      }

      list.appendChild(li);
    }
    body.appendChild(list);

    if (pickingField) {
      const hint = document.createElement('div');
      hint.className = 'vh-mapping-hint';
      const targetLabel = FIELD_LABELS[pickingField.fieldName] || pickingField.fieldName;
      hint.textContent = pickingField.role === 'confirm-upload'
        ? `請在頁面上點選「${targetLabel}」的確認上傳按鈕（按 Esc 取消）`
        : pickingField.role === 'candidate-controller'
          ? `請在頁面上點選「${targetLabel}」的候選群組控制型 select（按 Esc 取消）`
          : pickingField.role === 'candidate'
            ? `請在頁面上點選「${targetLabel}」的其中一個候選 select（按 Esc 取消）`
            : pickingField.role === 'datetime-merge'
              ? '請在頁面上點選違規日期/時間合併使用的那個欄位（按 Esc 取消）'
              : `請在頁面上點選「${targetLabel}」對應的欄位（按 Esc 取消）`;
      body.appendChild(hint);
    }
  }

  function startPicking(fieldName, append, role) {
    pickingField = { fieldName, append, role };
    renderPanel();
  }

  function stopPicking() {
    pickingField = null;
    hideHighlight();
    renderPanel();
  }

  function hideHighlight() {
    highlightBox.style.display = 'none';
    hoverEl = null;
  }

  function isOwnUiElement(el) {
    return !!(el.closest && (el.closest('#vh-mapping-panel') || el.closest('#vh-mapping-modal-overlay')));
  }

  function updateHighlight(el) {
    hoverEl = el;
    const rect = el.getBoundingClientRect();
    highlightBox.style.display = 'block';
    highlightBox.style.left = `${rect.left + window.scrollX}px`;
    highlightBox.style.top = `${rect.top + window.scrollY}px`;
    highlightBox.style.width = `${rect.width}px`;
    highlightBox.style.height = `${rect.height}px`;
  }

  // 對整份文件重跑一次跟 handlePick 相同的偵測規則，用來驗證某個候選 selector 的命中數
  // （見 handoff 第 4 點：錄製當下就要檢查唯一性，而不是事後人工比對才發現不唯一）。
  // 務必連 siblingIndexOfType 一起比對，否則「車牌兩個文字框」「時/分兩個 select」這類
  // 共用同一段標籤文字的 sibling 一律會被誤判成命中 2 次、擋下本來合法的欄位。
  function countLabelRelativeMatches(descriptor) {
    const tagSelector = descriptor.tagName ? descriptor.tagName.toLowerCase() : '*';
    let count = 0;
    document.querySelectorAll(tagSelector).forEach((candidate) => {
      const context = { nearbySelectedValues: collectNearbySelectedValues(candidate) };
      const label = descriptor.labelConfidence === 'low'
        ? fallbackLabelText(candidate, context)
        : accessibleLabelText(candidate, context);
      const candidateInfo = { tagName: candidate.tagName, siblingIndexOfType: siblingIndexOfType(candidate), labelText: label };
      if (labelRelativeCandidateMatches(candidateInfo, descriptor)) count += 1;
    });
    return count;
  }

  function countSelectorMatches(descriptor) {
    if (descriptor.type === 'labelRelative') {
      return countLabelRelativeMatches(descriptor);
    }
    if (descriptor.type === 'indexedFingerprint') {
      try {
        const matches = document.querySelectorAll(descriptor.value);
        return matches[descriptor.index] ? 1 : 0;
      } catch (err) {
        return -1;
      }
    }
    try {
      return document.querySelectorAll(descriptor.value).length;
    } catch (err) {
      return -1;
    }
  }

  // 依優先序（id > name > 屬性指紋 > 高信心 label > 低信心 label）逐一驗證命中數，
  // 挑第一個唯一命中的候選；全部都不唯一就回傳 null，讓呼叫端警告使用者換個元素。
  function pickUniqueDescriptor(candidates) {
    for (const candidate of candidates) {
      if (countSelectorMatches(candidate) === 1) return candidate;
    }
    return null;
  }

  // 已錄製的 selector 有可能（Vuetify 外層包裝）指向 div/span 容器而非真正的表單控制項，
  // 填值前先往內找一次，讓測試按鈕對這類舊資料也能填得進去。
  function findFillableControl(el) {
    if (!el) return null;
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el;
    return (el.querySelector && el.querySelector('input, select, textarea')) || null;
  }

  // 「測試填入假資料」的實際填值動作：只是驗證 selector 找不找得到元素、填不填得進去，
  // 不代表填的內容有業務意義，純粹讓使用者眼見為憑。車牌等欄位通常限定英數字，一律用
  // 英文字母＋數字（不用中文），select 固定挑 index 1，選單選項不足 2 個時改選最後一個
  // （避免剛好選到預設值，視覺上看不出來到底有沒有真的改到）。
  function fillElementWithDummy(rawEl, fieldName, idx) {
    const el = findFillableControl(rawEl);
    if (!el) return false;
    if (el.tagName === 'SELECT') {
      const options = el.options;
      if (!options || !options.length) return false;
      const opt = options[1] || options[options.length - 1];
      el.value = opt.value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    setNativeValue(el, `TEST${idx}`);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  // evidenceImages 專用（PLAN_B.md「已定案設計」）：只驗證觸發按鈕解析得到、且能靠祖先鏈演算法
  // 反推出真正的上傳 input，不嘗試賦值或模擬選檔（見 issues/01-file-trigger-binding.md 驗收標準，
  // 文案沿用票券原文的兩種措辭：解析成功／找不到對應的上傳欄位；觸發按鈕本身 selector 失效是
  // 另一種更少見的邊界情況，用跟其他欄位一致的 ⚠️ 前綴另外標示，不混用票券的兩句既定文案）。
  function summarizeFileTriggerTestFill(items) {
    const triggerItem = items[0];
    const triggerEl = triggerItem && resolveSelectorItem(triggerItem.value);
    if (!triggerEl) return '⚠️ 找不到附件觸發按鈕';
    const fileInput = resolveFileTriggerInput(triggerEl);
    return fileInput ? '找到附件觸發元件，已解析出上傳欄位' : '找不到對應的上傳欄位';
  }

  // file-slots 專用（票券 01：.scratch/six-cities-mapping/issues/01-file-slots-evidence-upload.md）：
  // 每個 item 都是直接綁定的固定 input，不需要祖先鏈反推，只需要逐一驗證能否解析回元素。
  function summarizeFileSlotsTestFill(items) {
    const foundCount = items.filter((item) => !!resolveSelectorItem(item.value)).length;
    return foundCount === items.length
      ? `找到全部 ${items.length} 個附件欄位`
      : `⚠️ 只找到 ${foundCount}/${items.length} 個附件欄位，可能有 selector 已失效`;
  }

  // 確認上傳按鈕（票券 02）是額外、選填的 item，跟主要的檔案輸入 item 分開驗證——不能混進
  // summarizeFileSlotsTestFill/summarizeFileTriggerTestFill 的計數，否則會誤判成槽位/觸發
  // 元件失效。
  function summarizeEvidenceImagesTestFill(items) {
    const { confirmItem, primaryItems } = partitionEvidenceSelector(items);
    if (!primaryItems.length) return '⚠️ 尚未綁定主要的附件輸入欄位';
    const primarySummary = primaryItems[0].kind === 'file-slots'
      ? summarizeFileSlotsTestFill(primaryItems)
      : summarizeFileTriggerTestFill(primaryItems);
    if (!confirmItem) return primarySummary;
    const confirmFound = !!resolveSelectorItem(confirmItem.value);
    return `${primarySummary}｜${EVIDENCE_ROLE_LABELS['confirm-upload']}：${confirmFound ? '已解析' : '⚠️ 找不到'}`;
  }

  // 候選元素群組（票券 03：桃園違規事項 chose_type→chosen1/chosen2）獨立驗證——不套用下面
  // summarizeTestFill 的一般 fillElementWithDummy（那套邏輯不知道候選群組的切換/清空規則，硬填
  // 只會讓畫面出現看起來對、實際上沒清空另一組候選值的假象），只驗證控制型/候選 select 都解析
  // 得到，不模擬填值。
  function summarizeViolationCandidateGroupTestFill(items) {
    const { controllerItem, candidateItems } = partitionViolationCandidateGroup(items);
    const controllerFound = !!(controllerItem && resolveSelectorItem(controllerItem.value));
    const foundCount = candidateItems.filter((item) => !!resolveSelectorItem(item.value)).length;
    const controllerText = controllerFound ? '控制型 select 已解析' : '⚠️ 找不到控制型 select';
    const candidateText = foundCount === candidateItems.length
      ? `候選 select 全部找到（${foundCount}/${candidateItems.length}）`
      : `⚠️ 候選 select 只找到 ${foundCount}/${candidateItems.length} 個`;
    return `${controllerText}；${candidateText}`;
  }

  // 每個 selector item 各自的 kind 決定要不要模擬填值——同一個邏輯欄位常常混合 custom 跟
  // plain 的真實元素（例如台北市「違規地點」：行政區的觸發元件是 custom，路名/公里/巷/弄
  // 卻是可以直接賦值的 plain），不能再假設整個欄位只有一種 kind（見 handlePick 旁的註解，
  // 這是修過的真 bug：先綁 custom 元素、後來又新增 plain 元素，custom 元素也被誤判成可以
  // 模擬填值）。違規日期／違規時間若解析到的元素位於 Vuetify 容器內，不論記錄的 kind 為何，
  // 這裡也要跟真實填表邏輯（fill-mode.js）一致改視同 custom（只驗證找不找得到元素、不假裝
  // 填值成功），避免對這兩個欄位顯示假的「已填入測試值」（見 spec.md「測試填入假資料一致性」）。
  function summarizeTestFill(fieldName, items) {
    if (fieldName === 'evidenceImages') return summarizeEvidenceImagesTestFill(items);
    if (fieldName === 'violation' && items.some((item) => item.role === 'candidate-controller')) {
      return summarizeViolationCandidateGroupTestFill(items);
    }
    const fillable = [];
    const nonFillable = [];
    items.forEach((item, idx) => {
      const el = resolveSelectorItem(item.value);
      const treatAsCustom = item.kind === 'file' || item.kind === 'custom' ||
        ((fieldName === 'date' || fieldName === 'time') && el && hasVuetifyWrapper(el));
      if (treatAsCustom) {
        nonFillable.push({ found: !!el, kind: item.kind === 'file' ? 'file' : 'custom' });
      } else {
        fillable.push({ filled: !!(el && fillElementWithDummy(el, fieldName, idx)) });
      }
    });
    const parts = [];
    if (fillable.length) {
      const filledCount = fillable.filter((r) => r.filled).length;
      parts.push(filledCount === fillable.length
        ? `已填入測試值（${filledCount}/${fillable.length}）`
        : `⚠️ 只填入 ${filledCount}/${fillable.length} 個元素，selector 可能已失效`);
    }
    if (nonFillable.length) {
      const foundCount = nonFillable.filter((r) => r.found).length;
      const label = nonFillable.every((r) => r.kind === 'file') ? '檔案上傳' : '自訂';
      parts.push(foundCount === nonFillable.length
        ? `找到元素（${label}欄位不模擬填值，共 ${nonFillable.length} 個）`
        : `⚠️ ${label}欄位只找到 ${foundCount}/${nonFillable.length} 個元素`);
    }
    return parts.join('；');
  }

  async function runTestFill() {
    testResults = {};
    const summaryLines = [];
    for (const fieldName of LOGICAL_FIELDS) {
      const field = profile.fields[fieldName];
      if (!field) continue;
      testResults[fieldName] = summarizeTestFill(fieldName, field.selector);
      summaryLines.push(`${FIELD_LABELS[fieldName] || fieldName}：${testResults[fieldName]}`);
    }
    renderPanel();
    await showAlertModal(
      summaryLines.length
        ? `測試填入結果（純前端模擬，不會送出表單）：\n\n${summaryLines.join('\n')}`
        : '目前沒有任何已綁定的欄位可供測試，請先綁定欄位。'
    );
  }

  function showValueMapModal(options) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'vh-mapping-modal-overlay';
      const modal = document.createElement('div');
      modal.id = 'vh-mapping-modal';

      const heading = document.createElement('div');
      heading.className = 'vh-mapping-modal-title';
      heading.textContent = '選填：填入每個選項對應的邏輯值（valueMap），留空可之後再編輯';
      modal.appendChild(heading);

      const rows = options.map((optionText) => {
        const row = document.createElement('div');
        row.className = 'vh-mapping-modal-row';
        const span = document.createElement('span');
        span.textContent = optionText;
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '邏輯值（可留空）';
        row.appendChild(span);
        row.appendChild(input);
        modal.appendChild(row);
        return { optionText, input };
      });

      const actions = document.createElement('div');
      actions.className = 'vh-mapping-modal-actions';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = '儲存';
      saveBtn.addEventListener('click', () => {
        const valueMap = {};
        for (const { optionText, input } of rows) {
          if (input.value.trim()) valueMap[optionText] = input.value.trim();
        }
        overlay.remove();
        resolve(Object.keys(valueMap).length ? valueMap : undefined);
      });
      const skipBtn = document.createElement('button');
      skipBtn.type = 'button';
      skipBtn.textContent = '略過';
      skipBtn.addEventListener('click', () => {
        overlay.remove();
        resolve(undefined);
      });
      actions.appendChild(saveBtn);
      actions.appendChild(skipBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.documentElement.appendChild(overlay);
    });
  }

  // 單一文字輸入的簡易 prompt（票券 03：候選 select 沒辦法從已綁定的控制型 select 讀到選項清單時
  // 的手動輸入 fallback），跟 showValueMapModal 同樣的骨架但只有 1 個欄位，不需要另外抽共用元件。
  function showTextPromptModal(headingText) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'vh-mapping-modal-overlay';
      const modal = document.createElement('div');
      modal.id = 'vh-mapping-modal';

      const heading = document.createElement('div');
      heading.className = 'vh-mapping-modal-title';
      heading.style.whiteSpace = 'pre-line';
      heading.textContent = headingText;
      modal.appendChild(heading);

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = '控制型 select 的選項文字';
      modal.appendChild(input);

      const actions = document.createElement('div');
      actions.className = 'vh-mapping-modal-actions';
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = '儲存';
      saveBtn.addEventListener('click', () => {
        const value = input.value.trim();
        overlay.remove();
        resolve(value || undefined);
      });
      actions.appendChild(saveBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.documentElement.appendChild(overlay);
      input.focus();
    });
  }

  // 候選 select 綁定時要記下「控制型 select 切到哪個選項文字，這份候選清單才會生效」
  // （controllerValue，見 lib/schema.js 的候選元素群組驗證）。優先讀取已綁定的控制型 select
  // 目前真實存在的選項清單，讓使用者用點選的（跟 showValueMapModal 讀真實選項的精神一致，避免
  // 手動輸入打錯字跟真實選項文字對不起來）；控制型 select 解析不到時才退回自由輸入文字。
  function promptCandidateControllerValue(existingSelector) {
    const controllerItem = existingSelector && existingSelector.find((item) => item.role === 'candidate-controller');
    const controllerEl = controllerItem && resolveSelectorItem(controllerItem.value);
    if (controllerEl && controllerEl.tagName === 'SELECT' && controllerEl.options && controllerEl.options.length) {
      const optionTexts = Array.from(controllerEl.options).map((o) => o.textContent.trim()).filter(Boolean);
      if (optionTexts.length) {
        return showButtonListModal(
          '這個候選 select 對應控制型 select 的哪一個選項？（切到該選項時，這個候選 select 才會顯示/生效）',
          optionTexts.map((text) => ({ value: text, label: text }))
        );
      }
    }
    return showTextPromptModal(
      '找不到控制型 select 目前的選項清單，請直接輸入切到這個候選 select 時，控制型 select 的選項文字（例如「動態違規」）。'
    );
  }

  // location 欄位的子元素語意不同（行政區/路名/其餘地址片段），來源網站只有一個完整地址字串，
  // P2 自動填表需要知道哪個子元素該接哪一段拆解後的地址，才能安全地只填確定解析得出來的部分，
  // 其餘一律標記待確認（不猜測拆分，見 lib/address-parser.js 與 lib/fill-engine.js 的註解）。
  function showLocationRoleModal() {
    const roleExamples = {
      district: '（例如「板橋區」「中山區」）',
      road: '（含幾段，例如「文化路一段」）',
      remainder: '（門牌號等，路名後面剩下的文字）'
    };
    const roleLabels = Object.fromEntries(
      LOCATION_ROLES.map((value) => [value, `${LOCATION_ROLE_LABELS[value] || value}${roleExamples[value] || ''}`])
    );
    const options = [
      ...LOCATION_ROLES.map((value) => ({ value, label: roleLabels[value] || value })),
      { value: '', label: '不確定／不要自動處理（一律標記待確認，手動填寫）' }
    ];
    return showButtonListModal(
      '這個元素在「違規地點」裡代表哪個部分？（供 P2 自動填表判斷要填哪一段地址）',
      options
    );
  }

  // 四選一而非是/否二選一：新北市（plain 唯讀輸入框）通常選「不轉換」，台北市 Vuetify 點選式
  // 違規日期則需要中文全形格式（見 spec.md 問題 4），民國斜線格式保留給未來其他網站沿用，
  // 民國緊湊數字格式是臺中（票券 05）需要的無分隔符 7 碼格式。
  function promptDateTransform() {
    const options = [
      { value: null, label: '不轉換（保留西元年格式，例如 2026-08-17）' },
      { value: 'westernToMinguo', label: '民國斜線格式（例如 115/08/17）' },
      { value: 'westernToMinguoChinese', label: '民國中文全形格式（例如 115 年 8 月 17 日）' },
      { value: 'westernToMinguoCompact', label: '民國緊湊數字格式（例如 1150817）' }
    ];
    return showButtonListModal(
      '這個是「違規日期」邏輯欄位，來源網站資料是西元年（例如 2026-08-17）。\n\n' +
      '目標網站這個欄位需要哪種日期格式？',
      options
    );
  }

  function showAlertModal(message) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'vh-mapping-modal-overlay';
      const modal = document.createElement('div');
      modal.id = 'vh-mapping-modal';

      const heading = document.createElement('div');
      heading.className = 'vh-mapping-modal-title';
      heading.style.whiteSpace = 'pre-line';
      heading.textContent = message;
      modal.appendChild(heading);

      const actions = document.createElement('div');
      actions.className = 'vh-mapping-modal-actions';
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.textContent = '知道了';
      okBtn.addEventListener('click', () => {
        overlay.remove();
        resolve();
      });
      actions.appendChild(okBtn);
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.documentElement.appendChild(overlay);
    });
  }

  // 「這個元素/欄位屬於哪一種？」這類多選一提示的共用 modal 骨架——showLocationRoleModal 與
  // promptDateTransform 都是同樣的「標題文字 + 一排直向按鈕，點了就 resolve 對應 value」形狀，
  // 抽出來避免兩處各自維護一份幾乎一樣的 overlay/modal DOM 結構。
  // window.alert/confirm 在 sandboxed iframe（例如 prsweb.tcpd.gov.tw）會被瀏覽器悄悄忽略，
  // 必須用自繪 modal 才能確保使用者一定看得到提示（見 site-structure-notes.md）。
  function showButtonListModal(headingText, options) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.id = 'vh-mapping-modal-overlay';
      const modal = document.createElement('div');
      modal.id = 'vh-mapping-modal';

      const heading = document.createElement('div');
      heading.className = 'vh-mapping-modal-title';
      heading.style.whiteSpace = 'pre-line';
      heading.textContent = headingText;
      modal.appendChild(heading);

      const actions = document.createElement('div');
      actions.className = 'vh-mapping-modal-actions';
      actions.style.flexDirection = 'column';
      actions.style.alignItems = 'stretch';
      for (const option of options) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = option.label;
        btn.style.textAlign = 'left';
        btn.addEventListener('click', () => {
          overlay.remove();
          resolve(option.value || undefined);
        });
        actions.appendChild(btn);
      }
      modal.appendChild(actions);

      overlay.appendChild(modal);
      document.documentElement.appendChild(overlay);
    });
  }

  // Vuetify 文字框常在 <input> 外面包好幾層裝飾用的 div/span，點擊時 evt.target 有時候會
  // 落在外層容器而不是真正的 <input>（見台北市 plate 左碼欄位錄成 tagName: DIV 的真實案例）。
  // 錄製前先往內/往外找一次真正的表單控制項，找不到才退回原始點擊目標。select2 增強型 select
  // 是特例（真正的 <select> 是假 UI 容器的 sibling，不是內外關係，見 resolveSelect2Select()）。
  function normalizePickTarget(el) {
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return el;
    const select2Select = resolveSelect2Select(el);
    if (select2Select) return select2Select;
    const nested = el.querySelector && el.querySelector('input, select, textarea');
    if (nested) return nested;
    const ancestorControl = el.closest && el.closest('input, select, textarea');
    return ancestorControl || el;
  }

  async function handlePick(rawEl) {
    // evidenceImages 專用：直接記錄使用者點擊的原始元素（不論 tagName 是 <button> 還是
    // <input type=button>），不套用一般「往內/往外找可填值控制項」正規化——觸發按鈕跟真正的
    // 檔案 input 是 DOM 手足關係，一般邏輯找不到這種關係，反而會誤判或抓空（見 PLAN_B.md
    // 「已定案設計」第 1 點）。
    const isEvidenceField = pickingField.fieldName === 'evidenceImages';
    // 確認上傳按鈕（票券 02）是對 evidenceImages 額外、分開綁定的選填 item，不是主要的
    // 檔案輸入 item。
    const isConfirmUploadPick = isEvidenceField && pickingField.role === 'confirm-upload';
    // 候選元素群組（票券 03）是對 violation 額外、分開綁定的選填 item：控制型 select 跟每個
    // 候選 select 各自對應一種 pickingField.role。
    const isCandidateControllerPick = pickingField.fieldName === 'violation' && pickingField.role === 'candidate-controller';
    const isCandidatePick = pickingField.fieldName === 'violation' && pickingField.role === 'candidate';
    // 票券 04：日期/時間合併欄位（高雄）專用——單一元素同時服務 date/time 兩個邏輯欄位，
    // 固定用 fieldName: 'date' 發起選取（見 renderPanel 的專屬按鈕）。
    const isDateTimeMergePick = pickingField.fieldName === 'date' && pickingField.role === 'datetime-merge';
    const el = isEvidenceField ? rawEl : normalizePickTarget(rawEl);
    const context = { nearbySelectedValues: collectNearbySelectedValues(el) };
    // <input type=button/submit> 沒有可用的文字內容/id/name 時（新北市「新增檔案」按鈕正是這種
    // 案例），value 屬性是它的靜態按鈕文字，比單靠 type 屬性的指紋更能避免跟頁面上其他同類型
    // 按鈕撞在一起（見 issues/01-file-trigger-binding.md 手動驗收發現）。
    const isButtonInput = el.tagName === 'INPUT' && ['button', 'submit'].includes(el.getAttribute('type') || '');
    const info = {
      id: el.id || '',
      name: el.getAttribute('name') || '',
      tagName: el.tagName,
      type: el.getAttribute('type') || '',
      maxLength: el.getAttribute('maxlength') || '',
      pattern: el.getAttribute('pattern') || '',
      autocomplete: el.getAttribute('autocomplete') || '',
      buttonValue: isButtonInput ? (el.getAttribute('value') || '') : '',
      readOnly: !!el.readOnly,
      isInVuetifyWrapper: hasVuetifyWrapper(el),
      trustedLabelText: accessibleLabelText(el, context),
      fallbackLabelText: fallbackLabelText(el, context),
      nearbySelectedValues: context.nearbySelectedValues,
      siblingIndexOfType: siblingIndexOfType(el)
    };
    // 車牌左碼這類欄位完全沒有可用的 label 文字（緊鄰元素是空的 wrapper），連 fallback 都生不出
    // 候選；屬性指紋（type/maxlength）又跟同排的另一個文字框完全相同。唯一剩下的線索是「它是頁面上
    // 第幾個同指紋元素」，算給 buildSelectorCandidates 當最後一道防線（見 selector.js 註解）。
    const fingerprintForOrdinal = buildAttributeFingerprint(info);
    if (fingerprintForOrdinal) {
      const sameFingerprintEls = Array.from(document.querySelectorAll(fingerprintForOrdinal));
      info.attributeFingerprintOrdinal = sameFingerprintEls.indexOf(el);
    }
    // evidenceImages 點到原生 input[type=file] 本身，代表這是臺南/桃園那種頁面載入時就固定
    // 存在的多槽位附件（file-slots，票券 01）；點到其他元素（例如按鈕）才視為需要祖先鏈反推
    // 真正上傳 input 的觸發元件（file-trigger，沿用既有行為）。
    const isFileSlotInput = isEvidenceField && el.tagName === 'INPUT' && (el.getAttribute('type') || '').toLowerCase() === 'file';
    // 合併欄位（票券 04）已經實測確認底層是普通 <input>，直接賦值可行，不需要包裝器互動，固定
    // 強制成 'plain'，不依賴 detectFieldKind（避免被誤判成 custom）。
    const kind = isEvidenceField ? (isFileSlotInput ? 'file-slots' : 'file-trigger') : (isDateTimeMergePick ? 'plain' : detectFieldKind(info));
    const candidates = buildSelectorCandidates(info);
    // 錄製當下就對整份文件驗證候選 selector 的命中數是否唯一，而不是等事後人工比對才發現不唯一。
    const descriptor = pickUniqueDescriptor(candidates);
    if (!descriptor) {
      await showAlertModal(
        candidates.length
          ? '這個元素試過的 selector 策略（屬性指紋／標籤相對位置）在目前頁面上都命中不只 1 個元素，可能跟其他相同結構的欄位混淆，請改選其他元素或確認頁面狀態後再試一次。'
          : '這個元素找不到穩定的 selector（沒有 id/name/屬性指紋，附近文字標籤也可能是會變動的字數計數器或下拉選單目前選中值），請改選其他元素。'
      );
      return;
    }

    const { fieldName, append } = pickingField;
    const existing = profile.fields[fieldName];

    let valueMap;
    // 候選群組控制型 select（票券 03）不需要 valueMap——它不會拿來跟來源違規文字比對，只是用來
    // 切換候選 select 的可見性，問這個提示對使用者沒有意義。候選 select 本身仍會跟一般 select
    // 欄位一樣詢問（見下面 resolveCandidateGroupMatch 的比對邏輯，跟 resolveOptionMatch 共用
    // valueMap 橋接機制）。
    if (!isEvidenceField && kind === 'select' && el.tagName === 'SELECT' && !isCandidateControllerPick) {
      const options = Array.from(el.options || []).map((o) => o.textContent.trim()).filter(Boolean);
      if (options.length) valueMap = await showValueMapModal(options);
    }

    // 違規日期邏輯欄位：對應模式錄製時要詢問目標網站需要的日期格式（見 PLAN.md 補充規則）。
    // 不限 kind === 'plain'——台北市違規日期實際是 Vuetify 點選式（kind: 'custom'），一樣需要
    // 選格式（見 spec.md 問題 5：填值時走點擊選單流程，比對的是這裡選出來的目標文字）。日期/時間
    // 合併欄位（票券 04）不需要問——合併字串是 lib/fill-engine.js 的 buildDateTimeMergeValue
    // 直接組出來的固定格式，不套用一般的西元轉民國 transform。
    let transform;
    if (!isEvidenceField && fieldName === 'date' && !isDateTimeMergePick) {
      transform = await promptDateTransform();
    }

    // location 欄位才需要角色標記，理由見 showLocationRoleModal() 上方註解；確認上傳按鈕
    // （票券 02）與候選群組控制型/候選 select（票券 03）的 role 則是依 pickingField.role
    // 直接指定，不需要再問使用者。
    let role;
    if (!isEvidenceField && fieldName === 'location') {
      role = await showLocationRoleModal();
    } else if (isConfirmUploadPick) {
      role = 'confirm-upload';
    } else if (isCandidateControllerPick) {
      role = 'candidate-controller';
    } else if (isCandidatePick) {
      role = 'candidate';
    } else if (isDateTimeMergePick) {
      role = 'datetime-merge';
    }

    // 候選 select 綁定時額外詢問「控制型 select 切到哪個選項文字，這份候選清單才會生效」
    // （見 lib/schema.js 的候選元素群組驗證）；使用者沒有輸入就放棄這次綁定，不存半殘的候選
    // item（沒有 controllerValue 的候選 item 存進去也會被 schema.js 的 validateProfile 擋下）。
    let controllerValue;
    if (isCandidatePick) {
      controllerValue = await promptCandidateControllerValue(existing && existing.selector);
      if (!controllerValue) {
        await showAlertModal('沒有輸入控制型 select 對應的選項文字，這個候選 select 不會被綁定，請重新點選一次。');
        stopPicking();
        return;
      }
    }

    const pickedValue = ['id', 'name', 'attributeFingerprint'].includes(descriptor.type) ? descriptor.value : descriptor;
    const newItem = {
      kind,
      value: pickedValue,
      ...(valueMap ? { valueMap } : {}),
      ...(transform ? { transform } : {}),
      ...(role ? { role } : {}),
      ...(controllerValue ? { controllerValue } : {})
    };

    // 日期/時間合併欄位（票券 04）不套用下面一般的單一欄位 selector 組裝邏輯——同一個 item 要
    // 同時寫進 date、time 兩個邏輯欄位的 selector 陣列（見 lib/schema.js validateProfile 的
    // 跨欄位結構檢查），一律整個覆蓋（合併欄位固定只能有這 1 個 item，不支援 append/累加）。
    if (isDateTimeMergePick) {
      profile = upsertField(profile, 'date', { selector: [newItem] });
      profile = upsertField(profile, 'time', { selector: [newItem] });
      await store.saveProfile(profile);
      stopPicking();
      return;
    }

    // 確認上傳按鈕（票券 02）跟主要的檔案輸入 item 分開維護：重新綁定/新增主要 item 時不能把
    // 現有確認按鈕一起覆蓋掉，反之亦然；確認按鈕固定放在 selector 陣列最後，讓
    // field.selector[0] 永遠是主要 item（resolveEvidenceUploadTarget 與
    // summarizeEvidenceImagesTestFill 都靠這個假設判斷模式）。
    const { confirmItem: existingConfirmItem, primaryItems: existingPrimaryItems } =
      existing ? partitionEvidenceSelector(existing.selector) : { confirmItem: null, primaryItems: [] };
    let selector;
    if (isConfirmUploadPick) {
      selector = [...existingPrimaryItems, newItem];
    } else if (isCandidateControllerPick) {
      // 重新綁定候選群組控制型 select：保留既有的候選 select item，只替換控制型 item 本身
      // （控制型 select 固定只能有 1 個，跟 evidenceImages 的 confirm-upload 是同樣道理）。
      const existingCandidateItems = existing ? existing.selector.filter((item) => item && item.role === 'candidate') : [];
      selector = [newItem, ...existingCandidateItems];
    } else if (isCandidatePick) {
      // 新增候選 select：保留既有控制型 item 與其他候選 item，新的候選 item 附加在最後。
      const existingControllerItem = existing ? existing.selector.find((item) => item && item.role === 'candidate-controller') : null;
      const existingCandidateItems = existing ? existing.selector.filter((item) => item && item.role === 'candidate') : [];
      selector = [...(existingControllerItem ? [existingControllerItem] : []), ...existingCandidateItems, newItem];
    } else {
      // evidenceImages 的 file-trigger 固定只允許 1 個 item（PLAN_B.md），不支援 append；
      // file-slots（票券 01）則相反，依序點選多個固定 input 時要逐一累加進 selector 陣列——
      // 但只在既有綁定也全部是 file-slots 時才累加，避免跟舊的 file-trigger 綁定混在一起。
      const canAppendFileSlots = kind === 'file-slots' && append && existingPrimaryItems.length > 0 &&
        existingPrimaryItems.every((item) => item.kind === 'file-slots');
      const canAppendOtherField = !isEvidenceField && append && existingPrimaryItems.length > 0;
      const primaryItems = (canAppendFileSlots || canAppendOtherField) ? [...existingPrimaryItems, newItem] : [newItem];
      // 確認上傳鈕只能搭配剛好 1 個主要 item（schema.js 的 validateProfile）；重新綁定/新增主要
      // item 若讓主要 item 數量變成不是 1（例如從單一 fl_File 再新增第 2 個 file-slots 槽位），
      // 既有確認上傳鈕就不相容，不能沿用，直接跟著這次的綁定丟棄。
      const keepExistingConfirmItem = existingConfirmItem && primaryItems.length === 1;
      selector = keepExistingConfirmItem ? [...primaryItems, existingConfirmItem] : primaryItems;
    }

    profile = upsertField(profile, fieldName, { selector });
    await store.saveProfile(profile);
    stopPicking();
  }

  function clearField(fieldName) {
    const field = profile.fields[fieldName];
    // 票券 04：合併欄位跨 date/time 兩個獨立邏輯欄位，只清其中一邊會留下「另一邊還綁著孤兒合併
    // 項」的無效狀態（違反 schema.js validateProfile 的跨欄位結構檢查），清除時要兩邊一起清掉。
    const hasDateTimeMerge = field && !!findDateTimeMergeItem(field.selector);
    profile = removeField(profile, fieldName);
    if (hasDateTimeMerge) {
      profile = removeField(profile, fieldName === 'date' ? 'time' : 'date');
    }
    store.saveProfile(profile);
    renderPanel();
  }

  function onMouseMove(evt) {
    if (!pickingField) return;
    if (isOwnUiElement(evt.target)) {
      hideHighlight();
      return;
    }
    // 高亮框跟著 normalizePickTarget() 走，讓使用者滑鼠移動時看到的框跟真正會被錄下的元素一致；
    // evidenceImages 一律記錄原始點擊元素（見 handlePick），高亮也要對齊，不套用正規化。
    const el = pickingField.fieldName === 'evidenceImages' ? evt.target : normalizePickTarget(evt.target);
    if (el !== hoverEl) updateHighlight(el);
  }

  function onClickCapture(evt) {
    if (!pickingField) return;
    const el = evt.target;
    if (isOwnUiElement(el)) return;
    evt.preventDefault();
    evt.stopPropagation();
    handlePick(el);
  }

  function onKeyDown(evt) {
    if (evt.key === 'Escape' && pickingField) {
      stopPicking();
    }
  }

  function teardown() {
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('mousemove', onPanelDragMove);
    document.removeEventListener('mouseup', onPanelDragEnd);
    panel.remove();
    highlightBox.remove();
    window.__violationHelperMappingModeActive = false;
  }

  document.addEventListener('mousemove', onMouseMove, true);
  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('keydown', onKeyDown, true);

  renderPanel();
})();
