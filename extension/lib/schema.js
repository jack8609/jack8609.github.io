// 欄位對應表（Field Mapping Profile）schema，定案內容見 extension/PLAN.md。
export const LOGICAL_FIELDS = [
  'date', 'time', 'plate', 'location', 'description', 'violation', 'evidenceImages'
];

// 兩個 content script（mapping-mode.js 的面板、fill-mode.js 的結果彙總）都需要一樣的中文顯示名稱，
// 集中放這裡避免各自維護出分岔。
export const FIELD_LABELS = {
  violation: '違規事實', plate: '車牌', date: '違規日期', time: '違規時間',
  location: '違規地點', description: '地點/事實備註', evidenceImages: '證據影像上傳'
};

const FIELD_KINDS = ['plain', 'select', 'custom', 'file', 'file-trigger', 'file-slots'];

// P2 新增：location 欄位的 selector item 可選標記 role，讓自動填表引擎知道「這個子元素是行政區/
// 路名/其餘地址片段」——來源網站只有一個完整地址字串，沒有 role 標記的 item（例如台北市公里/
// 巷/弄/号，語意上無法從單一字串可靠拆分）一律視為無法自動判斷，只能標記待確認，不猜測填值。
// 只在 location 欄位使用；其他欄位的多個 selector item 沿用既有的位置對應慣例（例如車牌固定是
// [左碼, 右碼]），不需要 role。
export const LOCATION_ROLES = ['district', 'road', 'remainder'];

// 對應模式面板（短版，逐子元素顯示用）與角色選擇 modal（長版，含例子的說明文字，見
// mapping-mode.js 的 showLocationRoleModal()）都需要同一組 role 顯示名稱，集中放這裡
// 避免像 FIELD_LABELS 那樣各自維護出分岔。
export const LOCATION_ROLE_LABELS = { district: '行政區', road: '路名', remainder: '其餘' };

// 票券 02 新增：evidenceImages 的 selector item 可選標記 role，供高雄這類「選檔後還要再按一次
// 獨立『上傳』按鈕才會生效」的網站，額外綁定那顆確認鈕。跟 LOCATION_ROLES 是各自獨立的列舉，
// 只在 evidenceImages 欄位下合法（見 validateProfile 的 role 檢查）。
export const EVIDENCE_ROLES = ['confirm-upload'];
export const EVIDENCE_ROLE_LABELS = { 'confirm-upload': '確認上傳按鈕' };

// 「把確認上傳按鈕 item 跟主要的檔案輸入 item 分開」是 validateProfile 本身、fill-mode.js
// 解析上傳目標、mapping-mode.js 面板顯示/測試填入共用的同一組拆分邏輯，抽出來避免各自維護
// 一份一樣的 filter/find（見票券 02 code review）。confirmItem 一律最多 1 個，找不到回傳
// null，呼叫端自行決定要不要視為錯誤。
export function partitionEvidenceSelector(selector) {
  const confirmItem = selector.find((item) => item && item.role === 'confirm-upload') || null;
  const primaryItems = selector.filter((item) => !(item && item.role === 'confirm-upload'));
  return { confirmItem, primaryItems };
}

// 票券 03 新增：violation 的 selector item 可選標記 role，供桃園這類「一個控制型 select
// （chose_type）切換顯示兩個互斥候選 select（chosen1/chosen2），該用哪一個取決於來源違規文字」
// 的網站使用。跟 LOCATION_ROLES/EVIDENCE_ROLES 一樣是各自獨立的列舉，只在 violation 欄位下合法
// （見 validateProfile 的 role 檢查）。candidate item 另外要帶 controllerValue（切到控制型
// select 的哪個選項文字時，這份候選清單才會生效/顯示）。
export const VIOLATION_ROLES = ['candidate-controller', 'candidate'];
export const VIOLATION_ROLE_LABELS = { 'candidate-controller': '候選群組控制', candidate: '候選項目' };

// 跟 partitionEvidenceSelector 同樣的道理：候選群組控制型 select（最多 1 個）跟候選 select
// （可能多個）是分開維護的兩種角色，validateProfile、fill-mode.js 的候選群組填表流程、
// mapping-mode.js 面板顯示/綁定流程三處共用，避免各自維護一份一樣的 filter/find。
export function partitionViolationCandidateGroup(selector) {
  const controllerItem = selector.find((item) => item && item.role === 'candidate-controller') || null;
  const candidateItems = selector.filter((item) => item && item.role === 'candidate');
  return { controllerItem, candidateItems };
}

// 票券 04 新增：date/time 的 selector item 可選標記 role，供高雄這類「違規日期／時間合併成
// 同一個 DOM 元素」的網站使用（見 .scratch/six-cities-mapping/issues/04-kaohsiung-datetime-merge.md）。
// 跟 LOCATION_ROLES 等其他角色列舉不同的是，這個角色橫跨 date、time 兩個獨立邏輯欄位——同一個
// item（相同 value）必須同時綁在 date.selector 與 time.selector 底下，各自剛好只有這 1 個
// item，見下面 validateProfile 的跨欄位結構檢查。
export const DATETIME_ROLES = ['datetime-merge'];
export const DATETIME_ROLE_LABELS = { 'datetime-merge': '日期時間合併' };

// 從單一欄位的 selector 陣列裡找出合併項（找不到回傳 null），validateProfile 的跨欄位檢查與
// content/mapping-mode.js 的綁定/顯示邏輯共用，避免各自維護一份一樣的 find。
export function findDateTimeMergeItem(selector) {
  return (Array.isArray(selector) && selector.find((item) => item && item.role === 'datetime-merge')) || null;
}

// select/custom 一律是風險欄位（PLAN.md）。kind 掛在每個 selector item 上而不是欄位層級，
// 因為同一個邏輯欄位常常混合不同 kind 的真實 DOM 元素（例如台北市「違規地點」裡，行政區的
// 觸發元件是 custom，但路名／公里／巷／弄卻是可以直接賦值的 plain）——欄位層級只存一個 kind
// 曾經造成「先綁 custom 元素、後來又新增 plain 元素」時，整個欄位被新元素的 kind 蓋過去，
// custom 元素也被誤判成可以模擬填值的真 bug。
function isRiskyKind(kind) {
  return kind === 'select' || kind === 'custom';
}

export function createEmptyProfile({ siteId, displayName, matchPatterns } = {}) {
  if (!siteId || !displayName || !Array.isArray(matchPatterns) || matchPatterns.length === 0) {
    throw new Error('createEmptyProfile 需要 siteId、displayName 與非空 matchPatterns');
  }
  return {
    siteId,
    displayName,
    matchPatterns: [...matchPatterns],
    fieldOrder: [],
    fields: {}
  };
}

export function upsertField(profile, fieldName, fieldDef) {
  if (!LOGICAL_FIELDS.includes(fieldName)) {
    throw new Error(`未知的邏輯欄位名稱: ${fieldName}`);
  }
  const fieldOrder = profile.fieldOrder.includes(fieldName)
    ? [...profile.fieldOrder]
    : [...profile.fieldOrder, fieldName];
  // fieldDef.selector 一律是 { kind, value, valueMap?, transform? } 的陣列（即使只綁了一個元素）。
  // 只要陣列裡任何一個 item 是 select/custom，整個欄位就是風險欄位，呼叫端不可覆寫成 false。
  const items = fieldDef.selector;
  const hasRiskyItem = Array.isArray(items) && items.some((item) => isRiskyKind(item.kind));
  const riskField = hasRiskyItem ? true : (fieldDef.riskField ?? false);
  const fields = {
    ...profile.fields,
    [fieldName]: { selector: items, riskField }
  };
  return { ...profile, fieldOrder, fields };
}

export function removeField(profile, fieldName) {
  const fields = { ...profile.fields };
  delete fields[fieldName];
  return {
    ...profile,
    fields,
    fieldOrder: profile.fieldOrder.filter((name) => name !== fieldName)
  };
}

export function validateProfile(profile) {
  const errors = [];
  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['profile 必須是物件'] };
  }
  if (!profile.siteId) errors.push('缺少 siteId');
  if (!profile.displayName) errors.push('缺少 displayName');
  if (!Array.isArray(profile.matchPatterns) || profile.matchPatterns.length === 0) {
    errors.push('matchPatterns 必須是非空陣列');
  }
  if (!Array.isArray(profile.fieldOrder)) {
    errors.push('fieldOrder 必須是陣列');
  }
  if (!profile.fields || typeof profile.fields !== 'object') {
    errors.push('fields 必須是物件');
  } else {
    for (const [name, field] of Object.entries(profile.fields)) {
      if (!LOGICAL_FIELDS.includes(name)) errors.push(`未知欄位名稱: ${name}`);
      if (!field || typeof field.riskField !== 'boolean') errors.push(`欄位 ${name} 缺少 riskField`);
      if (!field || !Array.isArray(field.selector) || field.selector.length === 0) {
        errors.push(`欄位 ${name} 的 selector 必須是非空陣列`);
        continue;
      }
      let hasRiskyItem = false;
      field.selector.forEach((item, idx) => {
        if (!item || !FIELD_KINDS.includes(item.kind)) {
          errors.push(`欄位 ${name} 第 ${idx} 個 selector item 的 kind 不合法`);
        } else if (isRiskyKind(item.kind)) {
          hasRiskyItem = true;
        }
        if (!item || item.value === undefined) {
          errors.push(`欄位 ${name} 第 ${idx} 個 selector item 缺少 value`);
        }
        // role 的合法值依欄位而異：location 用 LOCATION_ROLES，evidenceImages 用 EVIDENCE_ROLES
        // （票券 02 的確認上傳按鈕），violation 用 VIOLATION_ROLES（票券 03 的候選元素群組），
        // date/time 用 DATETIME_ROLES（票券 04 的合併欄位），其餘欄位一律不接受 role。
        if (item && item.role !== undefined) {
          const validRoles = name === 'location'
            ? LOCATION_ROLES
            : (name === 'evidenceImages'
              ? EVIDENCE_ROLES
              : (name === 'violation'
                ? VIOLATION_ROLES
                : ((name === 'date' || name === 'time') ? DATETIME_ROLES : [])));
          if (!validRoles.includes(item.role)) {
            errors.push(`欄位 ${name} 第 ${idx} 個 selector item 的 role 不合法`);
          }
        }
      });
      if (hasRiskyItem && field.riskField !== true) {
        errors.push(`欄位 ${name} 含有 select/custom 的 selector item，riskField 必須是 true`);
      }
      // 確認上傳按鈕（role: 'confirm-upload'，票券 02）是跟主要檔案輸入分開維護的獨立 item，
      // 不計入下面 file-trigger 的「固定只能 1 個」規則，但它自己最多只能綁 1 個；且只能搭配
      // 剛好 1 個主要 item（不限 file-trigger 或 file-slots——高雄 fl_File 是單一 multiple
      // input，使用者直接點選它會被記錄成單一個 file-slots item，實測發現原本「只能搭配
      // file-trigger」的限制擋住了這個真實案例，見票券 02 使用者手動驗收回報；真正不相容的是
      // 臺南/桃園那種 2 個以上各自獨立槽位的 file-slots，那種情境沒有「再按一次上傳鈕」的
      // 中間步驟）；也不能只綁確認按鈕、沒有任何主要輸入 item。
      const { confirmItem, primaryItems } = partitionEvidenceSelector(field.selector);
      const confirmUploadItems = field.selector.filter((item) => item && item.role === 'confirm-upload');
      if (confirmUploadItems.length > 1) {
        errors.push(`欄位 ${name} 的確認上傳按鈕最多只能綁定 1 個 item`);
      }
      if (confirmItem && primaryItems.length !== 1) {
        errors.push(`欄位 ${name} 的確認上傳按鈕只能搭配剛好 1 個主要 item`);
      }
      // file-trigger 只綁觸發按鈕本身（PLAN_B.md「已定案設計」第 1 點），執行期靠祖先鏈演算法
      // 反推真正的上傳 input，不需要（也不支援）多個觸發按鈕，固定只允許 1 個 item。
      if (primaryItems.some((item) => item && item.kind === 'file-trigger') && primaryItems.length !== 1) {
        errors.push(`欄位 ${name} 的 file-trigger selector 只能有 1 個 item`);
      }
      // file-slots（臺南/桃園：頁面載入時就固定存在 N 個獨立原生 input[type=file]）反過來
      // 允許多個 item，每個 item 各自直接綁定一個固定 input，不像 file-trigger 需要祖先鏈反推。

      // 候選元素群組（票券 03：桃園違規事項 chose_type→chosen1/chosen2）：candidate role 只能
      // 用在 violation 欄位（上面 role 合法性檢查已擋下其他欄位），這裡驗證群組結構本身——控制型
      // select 最多 1 個；只要有候選 select 存在，控制型 select 就必須剛好 1 個。刻意*不*要求
      // 「控制型存在就一定要有候選」，讓對應模式可以先綁控制型、再逐一新增候選 select 的中間狀態
      // 也能存檔（見 mapping-mode.js 的綁定流程，跟 evidenceImages 確認上傳鈕「先綁主要 item 才能
      // 綁確認鈕」是類似的漸進式綁定考量）。每個候選 select 都要有 controllerValue（控制型
      // select 切到哪個選項文字時，這份候選清單才會生效），且彼此不可重複，否則引擎無法判斷
      // 該清空/賦值哪一個。
      const controllerItems = field.selector.filter((item) => item && item.role === 'candidate-controller');
      const { candidateItems } = partitionViolationCandidateGroup(field.selector);
      if (controllerItems.length > 1) {
        errors.push(`欄位 ${name} 的候選群組控制型 select 最多只能綁定 1 個 item`);
      }
      if (candidateItems.length > 0 && controllerItems.length !== 1) {
        errors.push(`欄位 ${name} 有候選 select 時必須剛好綁定 1 個候選群組控制型 select`);
      }
      candidateItems.forEach((item, idx) => {
        if (!item.controllerValue) {
          errors.push(`欄位 ${name} 第 ${idx} 個候選 select 缺少 controllerValue`);
        }
      });
      const controllerValues = candidateItems.map((item) => item.controllerValue).filter(Boolean);
      if (new Set(controllerValues).size !== controllerValues.length) {
        errors.push(`欄位 ${name} 的候選 select controllerValue 不可重複`);
      }
    }

    // date/time 合併欄位（票券 04：高雄違規日期/時間單一 DOM 元素）：這個角色橫跨 date、time
    // 兩個獨立欄位，不像 evidenceImages/violation 的角色劃分只發生在單一欄位內部，無法塞進上面
    // 逐欄位的迴圈（那個迴圈天生一次只看得到一個欄位），獨立成這段跨欄位檢查。只要任一邊綁了
    // 合併項，兩邊就都必須綁、且各自剛好只有這 1 個 item，兩邊的 value 也必須指向同一個 DOM
    // 元素，否則賦值時到底該找哪個元素會有歧義（見 fill-engine.js/fill-mode.js 的去重賦值機制）。
    const dateField = profile.fields.date;
    const timeField = profile.fields.time;
    const dateMergeItem = dateField && findDateTimeMergeItem(dateField.selector);
    const timeMergeItem = timeField && findDateTimeMergeItem(timeField.selector);
    if (dateMergeItem || timeMergeItem) {
      if (!dateMergeItem || !timeMergeItem) {
        errors.push('date/time 合併欄位必須同時綁定在 date 與 time 兩個邏輯欄位下');
      } else {
        if (dateField.selector.length !== 1) errors.push('date 欄位綁定合併欄位時，selector 只能有這 1 個 item');
        if (timeField.selector.length !== 1) errors.push('time 欄位綁定合併欄位時，selector 只能有這 1 個 item');
        if (JSON.stringify(dateMergeItem.value) !== JSON.stringify(timeMergeItem.value)) {
          errors.push('date/time 合併欄位必須指向同一個 DOM 元素（value 需相同）');
        }
      }
    }
  }
  if (Array.isArray(profile.fieldOrder) && profile.fields) {
    for (const name of profile.fieldOrder) {
      if (!profile.fields[name]) errors.push(`fieldOrder 提到未定義欄位: ${name}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
