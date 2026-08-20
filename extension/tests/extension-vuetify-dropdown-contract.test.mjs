import assert from 'node:assert/strict';

const { normalizeOptionText, findMatchingOptionIndex } = await import('../lib/vuetify-dropdown.js');

// normalizeOptionText：收斂空白字元，方便跨欄位比對（選單文字有時候會夾雜換行/多重空白）
{
  assert.strictEqual(normalizeOptionText('  違規臨時停車-不依順行方向  '), '違規臨時停車-不依順行方向');
  assert.strictEqual(normalizeOptionText('a\n  b'), 'a b');
  assert.strictEqual(normalizeOptionText(''), '');
  assert.strictEqual(normalizeOptionText(undefined), '');
  assert.strictEqual(normalizeOptionText(null), '');
}

// findMatchingOptionIndex：優先精確比對（正規化空白後相等）
{
  const texts = ['請選擇違規事實', '汽車於人行道、行人穿越道臨時停車(但機車及騎樓不在此限)', '違規臨時停車-不依順行方向'];
  assert.strictEqual(findMatchingOptionIndex(texts, '違規臨時停車-不依順行方向'), 2);
  assert.strictEqual(findMatchingOptionIndex(texts, '  違規臨時停車-不依順行方向  '), 2, '目標文字前後空白不影響比對');
}

// findMatchingOptionIndex：精確比對找不到時，退而求其次做子字串包含比對
{
  const texts = ['違規停車-佔用身心障礙專用停車位'];
  assert.strictEqual(findMatchingOptionIndex(texts, '身心障礙專用停車位'), 0, '目標文字是選項文字的子字串也算命中');
  assert.strictEqual(findMatchingOptionIndex(texts, '違規停車-佔用身心障礙專用停車位(含機車)'), 0, '選項文字是目標文字的子字串也算命中');
}

// findMatchingOptionIndex：路段「幾段」中文數字/阿拉伯數字寫法不一致時，精確比對之後、子字串
// fuzzy 比對之前先試過數字轉換比對，才不會被子字串規則誤選成沒有段別的「文化路」
{
  const roadTexts = ['文化路', '文化路1段', '文化路2段'];
  assert.strictEqual(findMatchingOptionIndex(roadTexts, '文化路一段'), 1);
  assert.strictEqual(findMatchingOptionIndex(roadTexts, '文化路二段'), 2);
  assert.strictEqual(findMatchingOptionIndex(['文化路一段', '文化路二段'], '文化路1段'), 0, '反過來也要能命中');
}

// findMatchingOptionIndex：找不到任何相符選項或目標文字為空時回傳 -1
{
  const texts = ['選項A', '選項B'];
  assert.strictEqual(findMatchingOptionIndex(texts, '選項C'), -1);
  assert.strictEqual(findMatchingOptionIndex(texts, ''), -1);
  assert.strictEqual(findMatchingOptionIndex([], '選項A'), -1);
}

console.log('extension-vuetify-dropdown-contract.test.mjs OK');
