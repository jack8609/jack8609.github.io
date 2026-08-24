// 依欄位對應表把來源網站資料整形成「每個 selector item 該填什麼值」的純決策邏輯。
// 不碰 DOM——實際怎麼把值寫進頁面（plain 賦值／select 選項/自訂下拉點選）由呼叫端
// （content/fill-mode.js）依 item.kind 決定，這裡只回傳 targetValue 或 skipReason。
// skipReason 一律代表「不要嘗試填值，直接標記待確認」，絕不能因為解不出值就填空字串
// （PLAN.md 核心原則：能填的填好，填不了的明顯標記，絕不靜默失敗/亂猜）。
import { parseTaiwanAddress, canonicalizeRoadSegmentNumerals } from './address-parser.js';

const MINGUO_OFFSET = 1911;

export function normalizeForMatch(text) {
  return String(text ?? '').replace(/\s+/g, '').trim();
}

// 依優先序決定 select/custom 欄位要選哪個選項：valueMap 明確登記 > 選項文字完全比對 >
// （fuzzyAllowed 才）退而求其次的子字串包含比對。valueMap 記錄的是「目標選項文字→來源文字」，
// 供兩邊用詞不完全一致時橋接（見 PLAN.md schema 範例與 mapping-mode.js 的 showValueMapModal）。
export function resolveOptionMatch(optionTexts, sourceValue, { valueMap, fuzzyAllowed } = {}) {
  const normalizedSource = normalizeForMatch(sourceValue);
  if (!normalizedSource) return { matched: false, reason: 'no-source-value' };

  if (valueMap) {
    for (const [optionText, mappedValue] of Object.entries(valueMap)) {
      if (normalizeForMatch(mappedValue) === normalizedSource) {
        const index = optionTexts.findIndex((t) => normalizeForMatch(t) === normalizeForMatch(optionText));
        if (index !== -1) return { matched: true, index, reason: 'valueMap' };
      }
    }
  }

  const exactIndex = optionTexts.findIndex((t) => normalizeForMatch(t) === normalizedSource);
  if (exactIndex !== -1) return { matched: true, index: exactIndex, reason: 'exact' };

  // 路段「幾段」的中文數字/阿拉伯數字寫法不一致時（文化路一段 vs 文化路1段），先把兩邊都轉成
  // 阿拉伯數字再比對一次，這是等價的精確比對，不是鬆散猜測，所以不受 fuzzyAllowed 開關限制。
  // 不管哪一邊本來就是阿拉伯數字都要試（canonicalize 對已經是阿拉伯數字/沒有「段」的文字是
  // no-op），才能同時涵蓋「來源是中文數字、選項是阿拉伯數字」與反過來的情況。
  const canonicalSource = canonicalizeRoadSegmentNumerals(normalizedSource);
  const canonicalIndex = optionTexts.findIndex(
    (t) => canonicalizeRoadSegmentNumerals(normalizeForMatch(t)) === canonicalSource
  );
  if (canonicalIndex !== -1) return { matched: true, index: canonicalIndex, reason: 'road-numeral-canonical' };

  if (fuzzyAllowed) {
    const fuzzyIndex = optionTexts.findIndex((t) => {
      const normalized = normalizeForMatch(t);
      return normalized && (normalized.includes(normalizedSource) || normalizedSource.includes(normalized));
    });
    if (fuzzyIndex !== -1) return { matched: true, index: fuzzyIndex, reason: 'fuzzy' };
  }

  return { matched: false, reason: 'not-found' };
}

// 支援兩種西元轉民國格式（見對應模式錄製時的 promptDateTransform 三選一）：
// 'westernToMinguo' → 斜線格式（115/08/17，月/日補零）；
// 'westernToMinguoChinese' → 中文全形格式（115 年 8 月 17 日，台北市違規日期需要，月/日不補零）。
export function applyDateTransform(isoDate, transform) {
  if (!isoDate) return '';
  if (transform !== 'westernToMinguo' && transform !== 'westernToMinguoChinese') return isoDate;
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const minguoYear = year - MINGUO_OFFSET;
  if (transform === 'westernToMinguoChinese') return `${minguoYear} 年 ${month} 月 ${day} 日`;
  return `${minguoYear}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
}

function buildLocationItemPlan(item, sourceData) {
  const parsed = parseTaiwanAddress(sourceData.address);
  if (item.role === 'district') {
    return parsed.district ? { item, targetValue: parsed.district } : { item, skipReason: 'address-missing-district' };
  }
  if (item.role === 'road') {
    return parsed.road ? { item, targetValue: parsed.road } : { item, skipReason: 'address-missing-road' };
  }
  if (item.role === 'remainder') {
    return parsed.remainder ? { item, targetValue: parsed.remainder } : { item, skipReason: 'address-missing-remainder' };
  }
  // 沒有標角色的 item（例如台北市公里/巷/弄/号——無法從單一地址字串可靠拆分，見 PLAN.md P2 討論）：
  // 一律不猜測，交給使用者手動確認。
  return { item, skipReason: 'unassigned-role' };
}

// index：這個 item 在欄位 selector 陣列裡的位置，plate/time 這類多元素欄位沿用既有慣例
// （跟錄製順序一致的位置對應，例如車牌永遠是 [左碼, 右碼]、時間永遠是 [時, 分]），
// 這點沒有另外存 schema metadata，是延續 P1 就存在的既有假設，不是這裡新增的規則。
function buildItemPlan(fieldName, item, index, sourceData) {
  // 'file'：泛用的原生檔案 input（一般欄位手動綁定成這個 kind 時）；'file-trigger'：evidenceImages
  // 專用（PLAN_B.md），綁定的是觸發按鈕本身；'file-slots'：evidenceImages 專用（票券 01，臺南/桃園
  // 固定多槽位附件），綁定的是固定 input 本身。三者都不套用這裡的一般賦值邏輯——evidenceImages
  // 實際上走 content/fill-mode.js 的 resolveEvidenceUploadTarget() 專用流程（票券 02/01），這裡只是
  // 確保 buildFillPlan 對它的分類正確，不會落到下面 fieldName 對不上任何已知欄位時的
  // 'no-source-value' 預設分支（那個訊息文案跟附件上傳的實際情況不符）。
  if (item.kind === 'file' || item.kind === 'file-trigger' || item.kind === 'file-slots') {
    return { item, skipReason: 'unsupported-kind' };
  }

  if (fieldName === 'location') return buildLocationItemPlan(item, sourceData);

  let value;
  if (fieldName === 'plate') value = sourceData.plate ? sourceData.plate[index] : undefined;
  else if (fieldName === 'time') value = index === 0 ? sourceData.hour : sourceData.minute;
  else if (fieldName === 'violation') value = sourceData.violationText;
  else if (fieldName === 'date') value = applyDateTransform(sourceData.date, item.transform);
  else if (fieldName === 'description') value = sourceData.description;

  return value ? { item, targetValue: value } : { item, skipReason: 'no-source-value' };
}

// 給定來源資料與欄位對應表，依 fieldOrder 逐欄位、逐 item 產生填值計畫。純函式，不查詢/操作 DOM，
// 讓實際的 DOM 解析與填值（content/fill-mode.js）可以獨立於這裡的決策邏輯做測試。
export function buildFillPlan(sourceData, profile) {
  const plans = [];
  for (const fieldName of profile.fieldOrder) {
    const field = profile.fields[fieldName];
    if (!field) continue;
    const items = field.selector.map((item, index) => buildItemPlan(fieldName, item, index, sourceData));
    plans.push({ fieldName, riskField: field.riskField, items });
  }
  return plans;
}
