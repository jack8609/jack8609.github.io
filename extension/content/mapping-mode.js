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
  const { LOGICAL_FIELDS, createEmptyProfile, upsertField, removeField, LOCATION_ROLES, LOCATION_ROLE_LABELS, FIELD_LABELS } = schemaMod;
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
      bindBtn.addEventListener('click', () => startPicking(fieldName, false));
      li.appendChild(bindBtn);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.textContent = '+ 新增元素';
      addBtn.title = '同一邏輯欄位對應多個 DOM 元素時使用（例如車牌兩段）';
      // evidenceImages 的 file-trigger 固定只允許 1 個 item（PLAN_B.md），沒有「多綁一個」的
      // 情境；file-slots（票券 01：固定多槽位附件）則相反，需要依序多次點選才能綁滿 N 個槽位，
      // 只在這個 kind 底下才開放「+ 新增元素」。
      const isFileTriggerField = fieldName === 'evidenceImages' && field && field.selector[0].kind === 'file-trigger';
      addBtn.disabled = !field || isFileTriggerField;
      addBtn.addEventListener('click', () => startPicking(fieldName, true));
      li.appendChild(addBtn);

      if (field) {
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.textContent = '清除';
        clearBtn.addEventListener('click', () => clearField(fieldName));
        li.appendChild(clearBtn);
      }

      list.appendChild(li);
    }
    panel.appendChild(list);

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

    if (pickingField) {
      const hint = document.createElement('div');
      hint.className = 'vh-mapping-hint';
      hint.textContent =
        `請在頁面上點選「${FIELD_LABELS[pickingField.fieldName] || pickingField.fieldName}」對應的欄位（按 Esc 取消）`;
      panel.appendChild(hint);
    }
  }

  function startPicking(fieldName, append) {
    pickingField = { fieldName, append };
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

  function summarizeEvidenceImagesTestFill(items) {
    return items[0] && items[0].kind === 'file-slots'
      ? summarizeFileSlotsTestFill(items)
      : summarizeFileTriggerTestFill(items);
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

  // 三選一而非是/否二選一：新北市（plain 唯讀輸入框）通常選「不轉換」，台北市 Vuetify 點選式
  // 違規日期則需要中文全形格式（見 spec.md 問題 4），民國斜線格式保留給未來其他網站沿用。
  function promptDateTransform() {
    const options = [
      { value: null, label: '不轉換（保留西元年格式，例如 2026-08-17）' },
      { value: 'westernToMinguo', label: '民國斜線格式（例如 115/08/17）' },
      { value: 'westernToMinguoChinese', label: '民國中文全形格式（例如 115 年 8 月 17 日）' }
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
    const kind = isEvidenceField ? (isFileSlotInput ? 'file-slots' : 'file-trigger') : detectFieldKind(info);
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

    let valueMap;
    if (!isEvidenceField && kind === 'select' && el.tagName === 'SELECT') {
      const options = Array.from(el.options || []).map((o) => o.textContent.trim()).filter(Boolean);
      if (options.length) valueMap = await showValueMapModal(options);
    }

    // 違規日期邏輯欄位：對應模式錄製時要詢問目標網站需要的日期格式（見 PLAN.md 補充規則）。
    // 不限 kind === 'plain'——台北市違規日期實際是 Vuetify 點選式（kind: 'custom'），一樣需要
    // 選格式（見 spec.md 問題 5：填值時走點擊選單流程，比對的是這裡選出來的目標文字）。
    let transform;
    if (!isEvidenceField && fieldName === 'date') {
      transform = await promptDateTransform();
    }

    // location 欄位才需要角色標記，理由見 showLocationRoleModal() 上方註解。
    let role;
    if (!isEvidenceField && fieldName === 'location') {
      role = await showLocationRoleModal();
    }

    const existing = profile.fields[fieldName];
    const pickedValue = ['id', 'name', 'attributeFingerprint'].includes(descriptor.type) ? descriptor.value : descriptor;
    const newItem = {
      kind,
      value: pickedValue,
      ...(valueMap ? { valueMap } : {}),
      ...(transform ? { transform } : {}),
      ...(role ? { role } : {})
    };
    // evidenceImages 的 file-trigger 固定只允許 1 個 item（PLAN_B.md），不支援 append；
    // file-slots（票券 01）則相反，依序點選多個固定 input 時要逐一累加進 selector 陣列——
    // 但只在既有綁定也全部是 file-slots 時才累加，避免跟舊的 file-trigger 綁定混在一起。
    const canAppendFileSlots = kind === 'file-slots' && append && existing &&
      existing.selector.every((item) => item.kind === 'file-slots');
    const canAppendOtherField = !isEvidenceField && append && existing;
    const selector = (canAppendFileSlots || canAppendOtherField) ? [...existing.selector, newItem] : [newItem];

    profile = upsertField(profile, fieldName, { selector });
    await store.saveProfile(profile);
    stopPicking();
  }

  function clearField(fieldName) {
    profile = removeField(profile, fieldName);
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
