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
        if (item && item.role !== undefined && !LOCATION_ROLES.includes(item.role)) {
          errors.push(`欄位 ${name} 第 ${idx} 個 selector item 的 role 不合法`);
        }
      });
      if (hasRiskyItem && field.riskField !== true) {
        errors.push(`欄位 ${name} 含有 select/custom 的 selector item，riskField 必須是 true`);
      }
      // file-trigger 只綁觸發按鈕本身（PLAN_B.md「已定案設計」第 1 點），執行期靠祖先鏈演算法
      // 反推真正的上傳 input，不需要（也不支援）多個觸發按鈕，固定只允許 1 個 item。
      if (field.selector.some((item) => item && item.kind === 'file-trigger') && field.selector.length !== 1) {
        errors.push(`欄位 ${name} 的 file-trigger selector 只能有 1 個 item`);
      }
      // file-slots（臺南/桃園：頁面載入時就固定存在 N 個獨立原生 input[type=file]）反過來
      // 允許多個 item，每個 item 各自直接綁定一個固定 input，不像 file-trigger 需要祖先鏈反推。
    }
  }
  if (Array.isArray(profile.fieldOrder) && profile.fields) {
    for (const name of profile.fieldOrder) {
      if (!profile.fields[name]) errors.push(`fieldOrder 提到未定義欄位: ${name}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
