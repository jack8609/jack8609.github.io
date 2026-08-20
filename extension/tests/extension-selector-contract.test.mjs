import assert from 'node:assert/strict';

const {
  isAutoNumberedId,
  escapeCssIdentifier,
  escapeAttrValue,
  buildSelectorDescriptor,
  buildSelectorCandidates,
  buildAttributeFingerprint,
  labelRelativeCandidateMatches,
  detectFieldKind,
  isVolatileLabelText
} = await import('../lib/selector.js');

// isVolatileLabelText：Vuetify 等框架的「字數 / 上限」計數器會隨其他欄位狀態變動，不可當成穩定 label（見台北市 plate 欄位地雷）
{
  assert.strictEqual(isVolatileLabelText('必填欄位0 / 4'), true);
  assert.strictEqual(isVolatileLabelText('0/4'), true);
  assert.strictEqual(isVolatileLabelText('12 / 20'), true);
  assert.strictEqual(isVolatileLabelText(''), true);
  assert.strictEqual(isVolatileLabelText('   '), true);
  assert.strictEqual(isVolatileLabelText(undefined), true);
  assert.strictEqual(isVolatileLabelText('違規車號'), false);
  assert.strictEqual(isVolatileLabelText('請選擇違規事實'), false);
}

// isVolatileLabelText + context.nearbySelectedValues：候選文字等於附近下拉框「目前選中值」時也視為不穩定
// （台北市 plate 欄位地雷：錨定到牌照種類下拉框目前顯示的「一般(汽、機車)」）
{
  assert.strictEqual(
    isVolatileLabelText('一般(汽、機車)', { nearbySelectedValues: ['一般(汽、機車)'] }),
    true
  );
  assert.strictEqual(
    isVolatileLabelText('違規車號', { nearbySelectedValues: ['一般(汽、機車)'] }),
    false,
    '跟目前選中值不同的穩定文字不受影響'
  );
  assert.strictEqual(
    isVolatileLabelText('違規車號'),
    false,
    '沒有帶 context 時行為不變（向後相容）'
  );
}

// isAutoNumberedId：Vuetify 全域計數器產生的不穩定 id（見 site-structure-notes.md）
{
  assert.strictEqual(isAutoNumberedId('input-96'), true);
  assert.strictEqual(isAutoNumberedId('input-1234'), true);
  assert.strictEqual(isAutoNumberedId('eventsData_vio_type_code'), false);
  assert.strictEqual(isAutoNumberedId('ve-plate1'), false);
  assert.strictEqual(isAutoNumberedId(''), false);
  assert.strictEqual(isAutoNumberedId(undefined), false);
}

// escapeCssIdentifier：避免 id 內含特殊字元組出無效 CSS selector
{
  assert.strictEqual(escapeCssIdentifier('eventsData_vio_type_code'), 'eventsData_vio_type_code');
  assert.strictEqual(escapeCssIdentifier('1abc'), '\\31 abc');
  assert.strictEqual(escapeCssIdentifier('a:b.c'), 'a\\:b\\.c');
}

// escapeAttrValue：屬性選擇器值只需跳脫反斜線與雙引號
{
  assert.strictEqual(escapeAttrValue('vioCarNum1'), 'vioCarNum1');
  assert.strictEqual(escapeAttrValue('a"b'), 'a\\"b');
  assert.strictEqual(escapeAttrValue('a\\b'), 'a\\\\b');
}

// buildAttributeFingerprint：maxlength/type/pattern/autocomplete 是編譯時寫死的屬性，優先於文字標籤
{
  assert.strictEqual(
    buildAttributeFingerprint({ tagName: 'input', type: 'text', maxLength: '4' }),
    'input[type="text"][maxlength="4"]'
  );
  assert.strictEqual(
    buildAttributeFingerprint({ tagName: 'input', pattern: '[0-9]{4}', autocomplete: 'off' }),
    'input[pattern="[0-9]{4}"][autocomplete="off"]'
  );
  assert.strictEqual(
    buildAttributeFingerprint({ tagName: 'input' }),
    null,
    '沒有任何指紋屬性時回傳 null，讓呼叫端退回下一個候選策略'
  );
  assert.strictEqual(
    buildAttributeFingerprint({ tagName: '' }),
    null
  );
}

// buttonValue：<input type=button/submit> 的靜態按鈕文字，只有呼叫端明確判斷是按鈕元素時才會
// 填這個 key，補強沒有 id/name/可用 label 文字的按鈕（新北市「新增檔案」按鈕真實案例，見
// issues/01-file-trigger-binding.md 手動驗收發現：光靠 type=button 在真實頁面上會撞到其他同
// 類型按鈕，並非真正唯一）。
{
  assert.strictEqual(
    buildAttributeFingerprint({ tagName: 'input', type: 'button', buttonValue: '新增檔案' }),
    'input[type="button"][value="新增檔案"]'
  );
  assert.strictEqual(
    buildAttributeFingerprint({ tagName: 'input', type: 'text' }),
    'input[type="text"]',
    '一般文字框沒有 buttonValue（呼叫端不會填），指紋不受影響'
  );
}

// buildSelectorCandidates：依優先序 id > name > 屬性指紋 > 高信心 label > 低信心 label 列出所有候選
{
  assert.deepEqual(
    buildSelectorCandidates({ id: 'eventsData_vio_content_code', tagName: 'select' }),
    [{ type: 'id', value: '#eventsData_vio_content_code' }]
  );
  assert.deepEqual(
    buildSelectorCandidates({ id: 'input-96', name: 'vioCarNum1', tagName: 'input' }),
    [{ type: 'name', value: '[name="vioCarNum1"]' }],
    'Vuetify 自動編號 id 不可採用，應退回 name'
  );
  assert.deepEqual(
    buildSelectorCandidates({
      id: 'input-96', tagName: 'input', maxLength: '4', trustedLabelText: '違規車號', siblingIndexOfType: 0
    }),
    [
      { type: 'attributeFingerprint', value: 'input[maxlength="4"]' },
      { type: 'labelRelative', labelText: '違規車號', siblingIndexOfType: 0, tagName: 'input', labelConfidence: 'high' }
    ],
    '屬性指紋要排在 label-relative 之前'
  );
  assert.deepEqual(
    buildSelectorCandidates({
      id: 'input-96', tagName: 'input', trustedLabelText: '違規車號', siblingIndexOfType: 0
    }),
    [{ type: 'labelRelative', labelText: '違規車號', siblingIndexOfType: 0, tagName: 'input', labelConfidence: 'high' }],
    '合法 label 來源（trustedLabelText）標記為高信心'
  );
  assert.deepEqual(
    buildSelectorCandidates({
      id: 'input-96', tagName: 'input', fallbackLabelText: '巷', siblingIndexOfType: 1
    }),
    [{ type: 'labelRelative', labelText: '巷', siblingIndexOfType: 1, tagName: 'input', labelConfidence: 'low' }],
    '沒有合法 label 來源時才退回 sibling-walk fallback，標記為低信心'
  );
  assert.deepEqual(
    buildSelectorCandidates({
      id: 'input-96', tagName: 'input',
      trustedLabelText: '違規車號', fallbackLabelText: '巷', siblingIndexOfType: 0
    }),
    [{ type: 'labelRelative', labelText: '違規車號', siblingIndexOfType: 0, tagName: 'input', labelConfidence: 'high' }],
    '有高信心 label 時不應該再附加低信心 fallback 候選'
  );
  assert.deepEqual(
    buildSelectorCandidates({
      id: 'input-96', tagName: 'input',
      trustedLabelText: '一般(汽、機車)', nearbySelectedValues: ['一般(汽、機車)']
    }),
    [],
    '錨定文字等於附近下拉框目前選中值時，不能產生任何 label-relative 候選'
  );
  assert.deepEqual(
    buildSelectorCandidates({ id: 'input-96', tagName: 'input' }),
    []
  );
}

// buildSelectorCandidates + attributeFingerprintOrdinal：台北市車牌左碼真實案例——完全沒有
// label 文字可用（緊鄰元素是空的 wrapper），連 low-confidence fallback 都生不出候選，只剩下
// 「頁面上第幾個屬性指紋相同的元素」這條最後防線，且必須排在所有 label 策略之後。
{
  assert.deepEqual(
    buildSelectorCandidates({
      tagName: 'input', maxLength: '4', attributeFingerprintOrdinal: 0
    }),
    [
      { type: 'attributeFingerprint', value: 'input[maxlength="4"]' },
      { type: 'indexedFingerprint', value: 'input[maxlength="4"]', index: 0 }
    ],
    '沒有任何 label 候選、只有屬性指紋序數時，最後手段候選要排在屬性指紋之後'
  );
  assert.deepEqual(
    buildSelectorCandidates({
      tagName: 'input', maxLength: '4', trustedLabelText: '違規車號', attributeFingerprintOrdinal: 1
    }),
    [
      { type: 'attributeFingerprint', value: 'input[maxlength="4"]' },
      { type: 'labelRelative', labelText: '違規車號', siblingIndexOfType: 0, tagName: 'input', labelConfidence: 'high' },
      { type: 'indexedFingerprint', value: 'input[maxlength="4"]', index: 1 }
    ],
    '有 label 候選時，indexedFingerprint 仍然排在最後面（label 語意比純序數穩定，優先採用）'
  );
  assert.deepEqual(
    buildSelectorCandidates({ tagName: 'input', attributeFingerprintOrdinal: 0 }),
    [],
    '沒有屬性指紋（buildAttributeFingerprint 回傳 null）時，就算有序數也不能生出 indexedFingerprint 候選'
  );
}

// labelRelativeCandidateMatches：驗證候選元素是否就是 descriptor 指向的那個元素，
// 一定要連 siblingIndexOfType 一起比對，否則車牌兩個文字框/時分兩個 select 這類共用同一段
// 標籤文字的 sibling 會被誤判成同一個候選命中（曾造成錄製當下唯一性檢查永遠判定不唯一的真實 bug）。
{
  const plateDescriptor = {
    type: 'labelRelative', labelText: '違規車號', siblingIndexOfType: 0, tagName: 'input', labelConfidence: 'high'
  };
  assert.strictEqual(
    labelRelativeCandidateMatches(
      { tagName: 'INPUT', siblingIndexOfType: 0, labelText: '違規車號' },
      plateDescriptor
    ),
    true,
    'tagName/siblingIndexOfType/labelText 都相符才算命中'
  );
  assert.strictEqual(
    labelRelativeCandidateMatches(
      { tagName: 'INPUT', siblingIndexOfType: 1, labelText: '違規車號' },
      plateDescriptor
    ),
    false,
    '同一段標籤文字但 siblingIndexOfType 不同（例如車牌第二個文字框）不可誤判為同一個候選'
  );
  assert.strictEqual(
    labelRelativeCandidateMatches(
      { tagName: 'SELECT', siblingIndexOfType: 0, labelText: '違規車號' },
      plateDescriptor
    ),
    false,
    'tagName 不同不可能是同一個候選'
  );
  assert.strictEqual(
    labelRelativeCandidateMatches(
      { tagName: 'INPUT', siblingIndexOfType: 0, labelText: '別的標籤' },
      plateDescriptor
    ),
    false
  );
  assert.strictEqual(
    labelRelativeCandidateMatches(
      { tagName: 'INPUT', siblingIndexOfType: 0, labelText: '違規車號' },
      { type: 'id', value: '#foo' }
    ),
    false,
    '非 labelRelative descriptor 一律不算命中'
  );
}


// buildSelectorDescriptor：單一最佳猜測＝buildSelectorCandidates 的第一個，其餘皆無則回傳 unresolved
{
  assert.deepEqual(
    buildSelectorDescriptor({ id: 'eventsData_vio_content_code', tagName: 'select' }),
    { type: 'id', value: '#eventsData_vio_content_code' }
  );
  assert.deepEqual(
    buildSelectorDescriptor({
      id: 'input-96', tagName: 'input', trustedLabelText: '違規車號', siblingIndexOfType: 0
    }),
    { type: 'labelRelative', labelText: '違規車號', siblingIndexOfType: 0, tagName: 'input', labelConfidence: 'high' }
  );
  assert.deepEqual(
    buildSelectorDescriptor({ id: 'input-96', tagName: 'input' }),
    { type: 'unresolved' }
  );
}

// detectFieldKind
{
  assert.strictEqual(detectFieldKind({ tagName: 'select' }), 'select');
  assert.strictEqual(detectFieldKind({ tagName: 'input', type: 'file' }), 'file');
  assert.strictEqual(detectFieldKind({ tagName: 'input', type: 'text' }), 'plain');
  assert.strictEqual(detectFieldKind({ tagName: 'textarea' }), 'plain');
  assert.strictEqual(detectFieldKind({ tagName: 'div' }), 'custom');
}

// detectFieldKind + readOnly：台北市「行政區」真實案例——外觀跟可打字的「路名」/「時/分」完全一樣
// （都是 .v-select__slot 裡的 <input>），區分依據是 readOnly **且** 位於 Vuetify 容器內：純點選式
// v-select 的顯示 input 一律 readonly 且在 Vuetify 容器內（賦值＋dispatchEvent 無效，必須當 custom
// 走點擊選單流程），可打字的 v-autocomplete/v-combobox（時/分/路名/違規日期）readOnly 是 false（賦值
// 真的有效，維持 plain）。
{
  assert.strictEqual(
    detectFieldKind({ tagName: 'input', type: 'text', readOnly: true, isInVuetifyWrapper: true }),
    'custom',
    '純點選式 v-select 的 readonly 顯示 input 要當 custom（見台北市「行政區」誤判成 plain 的真實 bug）'
  );
  assert.strictEqual(
    detectFieldKind({ tagName: 'input', type: 'text', readOnly: false }),
    'plain',
    '可打字的 v-autocomplete/v-combobox（時/分/路名）readOnly 是 false，維持 plain'
  );
  assert.strictEqual(
    detectFieldKind({ tagName: 'input', type: 'text' }),
    'plain',
    '沒有帶 readOnly 欄位時行為不變（向後相容一般 <input>）'
  );
}

// detectFieldKind + readOnly 但非 Vuetify 容器：新北市「違規日期」真實案例——傳統 MVC 唯讀輸入框
// ＋日曆按鈕（非 Vue），readOnly 純粹是防止手動打字，賦值＋dispatchEvent 其實完全有效，不該被
// readOnly→custom 這條規則誤傷（見 .scratch/chrome-extension-p2-bugfixes/issues/02-*.md）。
{
  assert.strictEqual(
    detectFieldKind({ tagName: 'input', type: 'text', readOnly: true, isInVuetifyWrapper: false }),
    'plain',
    '純唯讀、非 Vuetify 容器的輸入框要維持 plain，才能被賦值＋dispatch 事件填入（新北市違規日期）'
  );
  assert.strictEqual(
    detectFieldKind({ tagName: 'input', type: 'text', readOnly: true }),
    'plain',
    '沒有帶 isInVuetifyWrapper 時 readOnly 規則不成立（向後相容，避免誤傷非 Vuetify 網站）'
  );
}

console.log('extension selector contract passed');
