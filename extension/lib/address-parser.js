// 台灣地址（縣市/行政區/路名(段)/剩餘部分）的極簡拆解，供 lib/fill-engine.js 的 location 欄位使用。
// 來源網站（違規檢舉小幫手）的「路段」只有一個完整地址字串（例如「新北市板橋區文化路一段100號」），
// 但目標網站的「違規地點」常常拆成行政區/路名/巷/弄/號等多個獨立欄位——這裡只負責拆出最基本、
// 兩個目標網站都至少需要的「行政區」與「路名(含段)」，其餘（巷/弄/號/之）一律歸類成 remainder，
// 不進一步猜測拆分（見 PLAN.md P2 討論：更複雜的巷弄拆分留待之後，這裡解不出來就回空字串，
// 讓呼叫端判斷「沒有來源值」而標記待確認，不能猜測填錯)。
const CITY_PATTERN = /^[\u4e00-\u9fff]{2,3}(?:市|縣)/;
const DISTRICT_PATTERN = /^[\u4e00-\u9fff]{1,3}(?:區|鄉|鎮|市)/;
// 「幾段」段名可能是中文數字（一段）或阿拉伯數字（1段），ROAD_PATTERN 跟 extractRoadNamePrefix
// 都要認得同一種字元類別，抽成共用常數避免以後段別規則異動（例如支援「百」）時各自維護漏改一處。
const SEGMENT_NUMERAL_CHARS = '一二三四五六七八九十0-9';
// 「幾段」來源地址可能寫成中文數字（文化路一段）或阿拉伯數字（文化路1段），兩種都要能整段
// 一起被抓進 road，不能只抓到「文化路」把「1段」漏給 remainder（見使用者回報的真實案例）。
const ROAD_PATTERN = new RegExp(`^[\u4e00-\u9fff0-9]{1,12}?(?:路|街|大道)(?:[${SEGMENT_NUMERAL_CHARS}]+段)?`);

// 票券 07（桃園 mapping profile）新增：remainder（路名後面剩下的完整字串）本身維持不變
// （回溯相容既有只綁 remainder 的臺北/臺中 profile，見 spec.md 討論），這裡額外從 remainder
// 再解析出巷/弄/衖/號/之五個純數字片段，供桃園這類把地址拆成獨立輸入框的網站使用。每個片段
// 都只取數字本身，不含「巷」「弄」等單位字——目標欄位本身通常已經有對應的文字標籤
// （例如「巷」），填入「20巷」而非「20」會造成重複/錯誤（使用者實測回報）。臺灣地址慣例「之」
// 是接在「號」後面（例如「100號之3」），不是「之號」，所以跟 houseNumber 用同一個 pattern
// 一起解析，避免兩個獨立 pattern 對「之」的位置各自猜測而生歧義。解不出來的片段一律回空字串，
// 不猜測（見 lib/fill-engine.js 的對應 role 分支與 PLAN.md 核心原則）。
const ALLEY_PATTERN = /(\d+)巷/;
const LANE_PATTERN = /(\d+)弄/;
const SUBLANE_PATTERN = /(\d+)衖/;
const HOUSE_NUMBER_PATTERN = /(\d+)號(?:之(\d+))?/;

const EMPTY_ADDRESS = {
  city: '', district: '', road: '', remainder: '',
  alley: '', lane: '', subLane: '', houseNumber: '', subNumber: ''
};

export function parseTaiwanAddress(raw) {
  let rest = String(raw ?? '').trim();
  if (!rest) return { ...EMPTY_ADDRESS };

  const cityMatch = rest.match(CITY_PATTERN);
  const city = cityMatch ? cityMatch[0] : '';
  rest = rest.slice(city.length);

  const districtMatch = rest.match(DISTRICT_PATTERN);
  const district = districtMatch ? districtMatch[0] : '';
  rest = rest.slice(district.length);

  const roadMatch = rest.match(ROAD_PATTERN);
  const road = roadMatch ? roadMatch[0] : '';
  rest = rest.slice(road.length);

  const alleyMatch = rest.match(ALLEY_PATTERN);
  const laneMatch = rest.match(LANE_PATTERN);
  const subLaneMatch = rest.match(SUBLANE_PATTERN);
  const houseNumberMatch = rest.match(HOUSE_NUMBER_PATTERN);

  return {
    city, district, road, remainder: rest,
    alley: alleyMatch ? alleyMatch[1] : '',
    lane: laneMatch ? laneMatch[1] : '',
    subLane: subLaneMatch ? subLaneMatch[1] : '',
    houseNumber: houseNumberMatch ? houseNumberMatch[1] : '',
    subNumber: (houseNumberMatch && houseNumberMatch[2]) ? houseNumberMatch[2] : ''
  };
}

const CHINESE_DIGITS = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

// 中文數字轉阿拉伯數字，只支援路段常見的 1~99 範圍（十/十X/X十/X十Y）。解不出來回傳 NaN。
function chineseNumeralToArabic(text) {
  if (text === '十') return 10;
  if (text.length === 1) return CHINESE_DIGITS[text] ?? NaN;
  const tenIndex = text.indexOf('十');
  if (tenIndex === -1) return NaN;
  const tensDigit = tenIndex === 0 ? 1 : (CHINESE_DIGITS[text[tenIndex - 1]] ?? NaN);
  const onesText = text.slice(tenIndex + 1);
  const onesDigit = onesText ? (CHINESE_DIGITS[onesText] ?? NaN) : 0;
  if (Number.isNaN(tensDigit) || Number.isNaN(onesDigit)) return NaN;
  return tensDigit * 10 + onesDigit;
}

// 路段的「幾段」在不同目標網站的下拉選單裡，中文數字（文化路一段）跟阿拉伯數字（文化路1段）
// 兩種寫法都存在（已用 chrome-devtools MCP 對新北市真實 select 選項確認一律是阿拉伯數字，
// 見 repo memory）。來源地址字串固定寫成正式的中文數字，比對選項文字前先把兩邊都轉成同一種
// （阿拉伯數字）形式，才不會因為數字寫法不同就比對不到；已經是阿拉伯數字或没有「段」的文字
// 維持不變。
export function canonicalizeRoadSegmentNumerals(text) {
  return String(text ?? '').replace(/([一二三四五六七八九十]+)段/g, (match, numeral) => {
    const arabic = chineseNumeralToArabic(numeral);
    return Number.isNaN(arabic) ? match : `${arabic}段`;
  });
}

// 去掉「幾段」只留路名本體（中文數字/阿拉伯數字段名都要能去掉），沒有「段」的文字原樣保留。
// 用途：台北市 Vuetify v-autocomplete 的內建打字篩選是對選項顯示文字做子字串比對，若打進
// 完整含段號的路名，只要目標選項的段號數字寫法跟輸入不同，該選項就會被篩選到不渲染出來
// ——不是比對邏輯選錯，是候選清單裡從頭就沒有它。呼叫端應改成只打這個前綴去觸發篩選，篩出
// 同路名各種段別/數字寫法的選項，再交給已雙向 canonicalize 過的 findMatchingOptionIndex
// 在這個較寬的候選清單裡挑出真正吻合段號的選項。
export function extractRoadNamePrefix(road) {
  return String(road ?? '').replace(new RegExp(`[${SEGMENT_NUMERAL_CHARS}]+段$`), '');
}
