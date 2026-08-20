import assert from 'node:assert/strict';

const { hasVuetifyWrapper, hasVuetifyDropdownWrapper, resolveSelect2Select, resolveFileTriggerInput } =
  await import('../content/selector-resolve.js');

// hasVuetifyWrapper：純 DOM 判斷邏輯，用假物件模擬 closest() 回傳值即可測試，不需要真實瀏覽器
// （見 .scratch/chrome-extension-p2-bugfixes/issues/02-*.md）。
{
  const fakeVuetifyEl = { closest: (sel) => (sel.includes('.v-input') ? { tagName: 'DIV' } : null) };
  assert.strictEqual(hasVuetifyWrapper(fakeVuetifyEl), true, '位於 .v-input 容器內要回傳 true');
}

{
  const fakePlainEl = { closest: () => null };
  assert.strictEqual(hasVuetifyWrapper(fakePlainEl), false, '非 Vuetify 容器（新北市傳統 MVC 輸入框）要回傳 false');
}

{
  assert.strictEqual(hasVuetifyWrapper(null), false, '空元素不拋錯，回傳 false');
  assert.strictEqual(hasVuetifyWrapper({}), false, '沒有 closest 方法的物件不拋錯，回傳 false');
}

// hasVuetifyDropdownWrapper：比 hasVuetifyWrapper 更精確，只認 .v-select/.v-autocomplete，
// 拿掉 .v-input，純文字 Vuetify 欄位（車牌/巷/弄/號）的 wrapper 只有 .v-input 不該命中
// （見 .scratch/chrome-extension-dropdown-bugfixes/issues/01-*.md）。
{
  const fakeDropdownEl = { closest: (sel) => (sel.includes('.v-autocomplete') ? { tagName: 'DIV' } : null) };
  assert.strictEqual(hasVuetifyDropdownWrapper(fakeDropdownEl), true, '位於 .v-select/.v-autocomplete 容器內要回傳 true');
}

{
  const fakePlainTextEl = { closest: (sel) => (sel.includes('.v-input') && !sel.includes('.v-select') ? { tagName: 'DIV' } : null) };
  assert.strictEqual(hasVuetifyDropdownWrapper(fakePlainTextEl), false, '只有 .v-input（純文字欄位）不該命中');
}

{
  assert.strictEqual(hasVuetifyDropdownWrapper(null), false, '空元素不拋錯，回傳 false');
  assert.strictEqual(hasVuetifyDropdownWrapper({}), false, '沒有 closest 方法的物件不拋錯，回傳 false');
}

// resolveSelect2Select：select2 假 UI（.select2-container）永遠插在原本 <select> 的正後方
// sibling，不是子節點也不是祖先節點，用假物件模擬 closest()/previousElementSibling 即可測試
// （見 .scratch/chrome-extension-dropdown-bugfixes/issues/02-*.md）。
{
  const fakeSelect = { tagName: 'SELECT' };
  const fakeContainer = { previousElementSibling: fakeSelect };
  const fakeClickTarget = { closest: (sel) => (sel === '.select2-container' ? fakeContainer : null) };
  assert.strictEqual(
    resolveSelect2Select(fakeClickTarget), fakeSelect,
    '點擊落在 .select2-container 內時要回傳它前一個 sibling 的真正 <select>'
  );
}

{
  const fakeContainerNoSelect = { previousElementSibling: { tagName: 'DIV' } };
  const fakeClickTarget = { closest: () => fakeContainerNoSelect };
  assert.strictEqual(
    resolveSelect2Select(fakeClickTarget), null,
    '前一個 sibling 不是 <select> 時回傳 null（結構不符預期，不硬猜）'
  );
}

{
  const fakePlainEl = { closest: () => null };
  assert.strictEqual(resolveSelect2Select(fakePlainEl), null, '不在 select2 容器內回傳 null');
}

{
  assert.strictEqual(resolveSelect2Select(null), null, '空元素不拋錯，回傳 null');
  assert.strictEqual(resolveSelect2Select({}), null, '沒有 closest 方法的物件不拋錯，回傳 null');
}

// resolveFileTriggerInput：evidenceImages 專用，觸發按鈕跟真正的 <input type="file"> 是同一個
// 容器下的 DOM 手足，從觸發元素往上逐層找祖先，找到「子樹內剛好只有 1 個 file input」的那一層
// 就回傳該 input，用假物件模擬 parentElement/querySelectorAll 即可測試
// （見 .scratch/chrome-extension-p3-evidence-upload/issues/01-file-trigger-binding.md）。
{
  // 台北市式：觸發按鈕與 input 隔 2 層才找到剛好 1 個 file input 的祖先
  // （中間那層 0 個 file input，不能提早誤判成「找不到」）。
  const fakeFileInput = { tagName: 'INPUT', type: 'file' };
  const cardText = { querySelectorAll: () => [fakeFileInput], parentElement: null };
  const middleAncestor = { querySelectorAll: () => [], parentElement: cardText };
  const trigger = { parentElement: middleAncestor };
  assert.strictEqual(
    resolveFileTriggerInput(trigger), fakeFileInput,
    '台北市式：中間層沒有 file input 時要繼續往上找，不能提早回傳 null'
  );
}

{
  // 新北市式：觸發按鈕與 input 只隔 1 層。
  const fakeFileInput = { tagName: 'INPUT', type: 'file' };
  const divContent = { querySelectorAll: () => [fakeFileInput], parentElement: null };
  const trigger = { parentElement: divContent };
  assert.strictEqual(resolveFileTriggerInput(trigger), fakeFileInput, '新北市式：隔 1 層就找到剛好 1 個 file input');
}

{
  // 祖先鏈上每一層都有多個 file input（結構不符合「剛好 1 個」的預期），回傳 null，不硬猜。
  const manyFileInputs = [{ tagName: 'INPUT', type: 'file' }, { tagName: 'INPUT', type: 'file' }];
  const top = { querySelectorAll: () => manyFileInputs, parentElement: null };
  const middle = { querySelectorAll: () => manyFileInputs, parentElement: top };
  const trigger = { parentElement: middle };
  assert.strictEqual(resolveFileTriggerInput(trigger), null, '每一層都不是剛好 1 個時要回傳 null');
}

{
  assert.strictEqual(resolveFileTriggerInput(null), null, '空元素不拋錯，回傳 null');
  assert.strictEqual(resolveFileTriggerInput({ parentElement: null }), null, '沒有祖先鏈時回傳 null');
}

console.log('extension-selector-resolve-contract.test.mjs OK');
