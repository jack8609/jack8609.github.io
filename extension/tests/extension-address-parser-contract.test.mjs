import assert from 'node:assert/strict';

const { parseTaiwanAddress, canonicalizeRoadSegmentNumerals, extractRoadNamePrefix } = await import('../lib/address-parser.js');

// 兩個使用者提供的基本案例：xx市xx區xx路(幾段) xx號
{
  const result = parseTaiwanAddress('新北市板橋區文化路一段100號');
  assert.deepEqual(result, { city: '新北市', district: '板橋區', road: '文化路一段', remainder: '100號' });
}
{
  const result = parseTaiwanAddress('臺北市中山區建國北路二段120號');
  assert.deepEqual(result, { city: '臺北市', district: '中山區', road: '建國北路二段', remainder: '120號' });
}

// 「幾段」寫成阿拉伯數字（使用者實際回報案例：來源地址原始就是「文化路1段」，不能只抓到
// 「文化路」把「1段」漏給 remainder）
{
  const result = parseTaiwanAddress('新北市板橋區文化路1段100號');
  assert.deepEqual(result, { city: '新北市', district: '板橋區', road: '文化路1段', remainder: '100號' });
}

// 沒有「幾段」的路名
{
  const result = parseTaiwanAddress('新北市三重區中正北路55號');
  assert.deepEqual(result, { city: '新北市', district: '三重區', road: '中正北路', remainder: '55號' });
}

// 街道尾字是「街」而非「路」
{
  const result = parseTaiwanAddress('臺北市大安區忠孝東路四段1號之2');
  assert.deepEqual(result, { city: '臺北市', district: '大安區', road: '忠孝東路四段', remainder: '1號之2' });
}

// 縣（非市）與鄉/鎮
{
  const result = parseTaiwanAddress('南投縣埔里鎮中山路三段10號');
  assert.deepEqual(result, { city: '南投縣', district: '埔里鎮', road: '中山路三段', remainder: '10號' });
}

// 沒有城市前綴，仍要解出行政區與路名
{
  const result = parseTaiwanAddress('板橋區文化路一段100號');
  assert.deepEqual(result, { city: '', district: '板橋區', road: '文化路一段', remainder: '100號' });
}

// 完全無法辨識（含巷弄的複雜地址、或空字串）：不猜測，該解不出的欄位一律回空字串
{
  assert.deepEqual(parseTaiwanAddress(''), { city: '', district: '', road: '', remainder: '' });
  assert.deepEqual(parseTaiwanAddress(null), { city: '', district: '', road: '', remainder: '' });
  assert.deepEqual(parseTaiwanAddress(undefined), { city: '', district: '', road: '', remainder: '' });
}

// canonicalizeRoadSegmentNumerals：中文數字段名轉阿拉伯數字（新北市 select 選項一律用阿拉伯數字，
// 來源地址字串固定寫成正式中文數字，見 repo memory 的 select2 票券驗證紀錄）
{
  assert.equal(canonicalizeRoadSegmentNumerals('文化路一段'), '文化路1段');
  assert.equal(canonicalizeRoadSegmentNumerals('建國北路二段'), '建國北路2段');
  assert.equal(canonicalizeRoadSegmentNumerals('中山路十段'), '中山路10段');
  assert.equal(canonicalizeRoadSegmentNumerals('中山路十一段'), '中山路11段');
  assert.equal(canonicalizeRoadSegmentNumerals('中山路二十段'), '中山路20段');
  assert.equal(canonicalizeRoadSegmentNumerals('中山路二十一段'), '中山路21段');
  // 已經是阿拉伯數字或没有「段」：原樣保留（no-op），確保跟已經是正確格式的選項比對時不會被改壞
  assert.equal(canonicalizeRoadSegmentNumerals('文化路1段'), '文化路1段');
  assert.equal(canonicalizeRoadSegmentNumerals('中正北路'), '中正北路');
  assert.equal(canonicalizeRoadSegmentNumerals(''), '');
  assert.equal(canonicalizeRoadSegmentNumerals(null), '');
  assert.equal(canonicalizeRoadSegmentNumerals(undefined), '');
}

// extractRoadNamePrefix：去掉「幾段」（中文數字/阿拉伯數字寫法都要能去掉），供台北市 Vuetify
// 打字篩選使用（見 lib/address-parser.js 的函式註解與 content/vuetify-dropdown-interaction.js）
{
  assert.equal(extractRoadNamePrefix('文化路1段'), '文化路');
  assert.equal(extractRoadNamePrefix('文化路一段'), '文化路');
  assert.equal(extractRoadNamePrefix('中山路二十一段'), '中山路');
  assert.equal(extractRoadNamePrefix('中正北路'), '中正北路', '沒有段別的路名原樣保留');
  assert.equal(extractRoadNamePrefix(''), '');
  assert.equal(extractRoadNamePrefix(null), '');
  assert.equal(extractRoadNamePrefix(undefined), '');
}

console.log('extension-address-parser-contract.test.mjs OK');
