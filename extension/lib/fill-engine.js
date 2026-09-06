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

// 部分網站的選項文字結尾會帶句號（例如桃園「未戴安全帽。」），但 App 內建違規清單
// （modules/app/violation-items.txt）慣例上不帶句號，純標點差異不影響語意，屬於等價比對而非
// 猜測，見下面 resolveOptionMatch 的 'terminal-punctuation-normalized' 比對層。
export function stripTrailingTerminalPunctuation(text) {
  return text.replace(/[。.]+$/, '');
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

  // 目標網站選項結尾句號有無不一致時（桃園違規法條清單幾乎每一項都帶句號），去除兩邊結尾句號
  // 再比對一次，這跟上面的路段幾段數字寫法一樣是等價比對、不是鬆散猜測，不受 fuzzyAllowed
  // 開關限制（見 stripTrailingTerminalPunctuation 上方註解）。
  const noPunctuationSource = stripTrailingTerminalPunctuation(normalizedSource);
  const noPunctuationIndex = optionTexts.findIndex(
    (t) => stripTrailingTerminalPunctuation(normalizeForMatch(t)) === noPunctuationSource
  );
  if (noPunctuationIndex !== -1) return { matched: true, index: noPunctuationIndex, reason: 'terminal-punctuation-normalized' };

  if (fuzzyAllowed) {
    const fuzzyIndex = optionTexts.findIndex((t) => {
      const normalized = normalizeForMatch(t);
      return normalized && (normalized.includes(normalizedSource) || normalizedSource.includes(normalized));
    });
    if (fuzzyIndex !== -1) return { matched: true, index: fuzzyIndex, reason: 'fuzzy' };
  }

  return { matched: false, reason: 'not-found' };
}

// 票券 03（桃園違規事項候選元素群組）：依來源違規文字，依序跟每個候選群組的選項清單跑
// resolveOptionMatch，第一個命中的候選群組就是答案。groups 是 content/fill-mode.js 在執行期
// 讀取 DOM 當下即時組出的陣列，格式 [{ controllerValue, optionTexts }, ...]——controllerValue
// 同時也是候選群組的識別鍵，以及控制型 select 要切到的選項文字（見 lib/schema.js 的
// partitionViolationCandidateGroup）。都沒命中則回傳 matched:false，呼叫端一律標記待確認，
// 不猜測該選哪一個候選群組。
export function resolveCandidateGroupMatch(sourceValue, groups, { valueMap, fuzzyAllowed } = {}) {
  for (const group of groups) {
    const match = resolveOptionMatch(group.optionTexts, sourceValue, { valueMap, fuzzyAllowed });
    if (match.matched) {
      return { matched: true, controllerValue: group.controllerValue, optionIndex: match.index, reason: match.reason };
    }
  }
  return { matched: false, reason: 'not-found' };
}

// 票券 04（高雄違規日期/時間單一 DOM 元素）：date/time 兩個邏輯欄位各自的原始值需要合併寫入
// 同一個元素，格式固定 'YYYY-MM-DD HH:mm'。任一部分缺值就不猜測，回傳空字串交給呼叫端 skip。
// hour/minute 來源（modules/app/violation-editor.js）理論上已經補零，這裡仍自行 padStart
// 防禦，不假設呼叫端一定會補好（見票券驗收標準要求涵蓋補零邊界案例）。
export function buildDateTimeMergeValue(sourceData) {
  const { date, hour, minute } = sourceData || {};
  if (!date || !hour || !minute) return '';
  const paddedHour = String(hour).padStart(2, '0');
  const paddedMinute = String(minute).padStart(2, '0');
  return `${date} ${paddedHour}:${paddedMinute}`;
}

// 支援三種西元轉民國格式（見對應模式錄製時的 promptDateTransform 四選一）：
// 'westernToMinguo' → 斜線格式（115/08/17，月/日補零）；
// 'westernToMinguoChinese' → 中文全形格式（115 年 8 月 17 日，台北市違規日期需要，月/日不補零）；
// 'westernToMinguoCompact' → 無分隔符緊湊數字（1150817，月/日補零，臺中違規日期需要，見票券 05）。
export function applyDateTransform(isoDate, transform) {
  if (!isoDate) return '';
  const knownTransforms = ['westernToMinguo', 'westernToMinguoChinese', 'westernToMinguoCompact'];
  if (!knownTransforms.includes(transform)) return isoDate;
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate;
  const minguoYear = year - MINGUO_OFFSET;
  if (transform === 'westernToMinguoChinese') return `${minguoYear} 年 ${month} 月 ${day} 日`;
  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  if (transform === 'westernToMinguoCompact') return `${minguoYear}${paddedMonth}${paddedDay}`;
  return `${minguoYear}/${paddedMonth}/${paddedDay}`;
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
// itemCount：該欄位 selector 陣列的總長度，只有 time 欄位需要依此分流（見下方 time 分支）。
function buildItemPlan(fieldName, item, index, sourceData, itemCount) {
  // 'file'：泛用的原生檔案 input（一般欄位手動綁定成這個 kind 時）；'file-trigger'：evidenceImages
  // 專用（PLAN_B.md），綁定的是觸發按鈕本身；'file-slots'：evidenceImages 專用（票券 01，臺南/桃園
  // 固定多槽位附件），綁定的是固定 input 本身。三者都不套用這裡的一般賦值邏輯——evidenceImages
  // 實際上走 content/fill-mode.js 的 resolveEvidenceUploadTarget() 專用流程（票券 02/01），這裡只是
  // 確保 buildFillPlan 對它的分類正確，不會落到下面 fieldName 對不上任何已知欄位時的
  // 'no-source-value' 預設分支（那個訊息文案跟附件上傳的實際情況不符）。
  if (item.kind === 'file' || item.kind === 'file-trigger' || item.kind === 'file-slots') {
    return { item, skipReason: 'unsupported-kind' };
  }

  // 票券 03：violation 欄位的候選群組控制型 select（role: 'candidate-controller'）與候選 select
  // （role: 'candidate'）一律不套用下面的一般 select 賦值邏輯——它們走 content/fill-mode.js 的
  // 專用候選群組流程（讀取即時 DOM 選項、比對來源文字、決定切控制值/清空其他候選/賦值目標候選），
  // 這裡只需要正確標記，不能落到下面 fieldName === 'violation' 分支把來源文字誤填進控制型 select。
  if (fieldName === 'violation' && (item.role === 'candidate-controller' || item.role === 'candidate')) {
    return { item, skipReason: 'candidate-group-pending' };
  }

  // 票券 04：date/time 合併欄位（高雄違規日期/時間單一 DOM 元素）——不論這個 item 掛在 date 或
  // time 哪個邏輯欄位下，一律計算完整的合併字串（兩邊都補齊才寫，不能只填半邊），避免 date 迴圈
  // 算出只有日期、time 迴圈算出只有時間的半殘值，先寫後寫互相覆蓋（見 content/fill-mode.js 的
  // 去重賦值機制，同一個 item 會出現在 date、time 兩個欄位的 selector 陣列裡）。
  if ((fieldName === 'date' || fieldName === 'time') && item.role === 'datetime-merge') {
    const merged = buildDateTimeMergeValue(sourceData);
    return merged ? { item, targetValue: merged } : { item, skipReason: 'no-source-value' };
  }

  if (fieldName === 'location') return buildLocationItemPlan(item, sourceData);

  let value;
  if (fieldName === 'plate') value = sourceData.plate ? sourceData.plate[index] : undefined;
  else if (fieldName === 'time') {
    // 臺中（票券 05）時間欄位是單一輸入框、需要 hour+minute 合併成 'HHmm'；臺北/新北是時/分
    // 各自獨立元素，維持既有的位置對應（index 0 = hour, index 1 = minute）。
    if (itemCount === 1) value = (sourceData.hour && sourceData.minute) ? `${sourceData.hour}${sourceData.minute}` : undefined;
    else value = index === 0 ? sourceData.hour : sourceData.minute;
  }
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
    const items = field.selector.map((item, index) => buildItemPlan(fieldName, item, index, sourceData, field.selector.length));
    plans.push({ fieldName, riskField: field.riskField, items });
  }
  return plans;
}
