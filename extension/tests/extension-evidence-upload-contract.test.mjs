import assert from 'node:assert/strict';

const { planEvidenceInjection, findGrownAncestorLevel, findNewChild } = await import('../content/evidence-upload.js');

// planEvidenceInjection：純決策邏輯，只讀 baseInput.multiple 與 files 陣列，不碰 DOM，
// 用假物件測試即可（見 .scratch/chrome-extension-p3-evidence-upload/issues/02-taipei-auto-upload.md）。

// 台北市式：base input 支援 multiple，選定的所有檔案一次性賦值。
{
  const fakeFiles = [{ name: 'a.jpg' }, { name: 'b.mp4' }];
  const baseInput = { multiple: true };
  assert.deepEqual(
    planEvidenceInjection(baseInput, fakeFiles), { action: 'assign-all', files: fakeFiles },
    'multiple === true 時要回傳 assign-all，帶上全部選定檔案'
  );
}

// 新北市式：base input 不支援 multiple，逐一增量注入（見票券 03：
// .scratch/chrome-extension-p3-evidence-upload/issues/03-newtaipei-incremental-upload.md）。
{
  const fakeFiles = [{ name: 'a.jpg' }, { name: 'b.mp4' }];
  const baseInput = { multiple: false };
  assert.deepEqual(
    planEvidenceInjection(baseInput, fakeFiles), { action: 'incremental', files: fakeFiles },
    'multiple === false 時要回傳 incremental，帶上全部選定檔案'
  );
}

// 使用者取消選檔（或選了 0 個檔案）：不論 base input 是否支援 multiple 都一樣回報沒有檔案。
{
  assert.deepEqual(planEvidenceInjection({ multiple: true }, []), { action: 'no-files' }, '空陣列要回傳 no-files');
  assert.deepEqual(planEvidenceInjection({ multiple: true }, null), { action: 'no-files' }, 'null 要回傳 no-files');
  assert.deepEqual(planEvidenceInjection({ multiple: false }, undefined), { action: 'no-files' }, 'undefined 要回傳 no-files');
}

// findGrownAncestorLevel：新北市逐一增量注入的核心比較邏輯（點擊觸發按鈕前後，祖先鏈每一層的
// 子元素數量 diff，見票券 03「實作範圍」第 4 點），純陣列比對，不碰 DOM。

// 找到剛好 +1 的那一層（新北市式：新的 .row 直接 append 到某層祖先尾端，中間層數量不變）。
{
  const beforeCounts = [3, 2, 1];
  const afterCounts = [3, 2, 2];
  assert.strictEqual(findGrownAncestorLevel(beforeCounts, afterCounts), 2, '要找到子元素數量剛好 +1 的那一層 index');
}

// 找不到剛好 +1 的情境：每一層都持平（網站行為跟預期不符，例如按鈕點擊沒有產生新節點）。
{
  const beforeCounts = [3, 2, 1];
  const afterCounts = [3, 2, 1];
  assert.strictEqual(findGrownAncestorLevel(beforeCounts, afterCounts), -1, '每一層都沒變化時要回傳 -1，不要硬猜');
}

// 落差不是 +1（例如某層一次新增了 2 個節點）也算找不到，不誤判成命中。
{
  const beforeCounts = [3, 2, 1];
  const afterCounts = [3, 2, 3];
  assert.strictEqual(findGrownAncestorLevel(beforeCounts, afterCounts), -1, '落差不是剛好 +1 時要回傳 -1');
}

// findNewChild：從同一層祖先點擊前後的子節點陣列，找出新增的那個子節點，用假物件（不需要真實
// DOM 節點）即可測試。
{
  const nodeA = { id: 'a' };
  const nodeB = { id: 'b' };
  const nodeNew = { id: 'new' };
  assert.strictEqual(
    findNewChild([nodeA, nodeB], [nodeA, nodeB, nodeNew]), nodeNew,
    '要找出不在 before 陣列裡的新節點'
  );
}

// 找不到新節點（不該發生，但要能明確回傳 null 而不是拋錯或猜一個）。
{
  const nodeA = { id: 'a' };
  assert.strictEqual(findNewChild([nodeA], [nodeA]), null, '找不到新節點時要回傳 null');
}

console.log('extension-evidence-upload-contract.test.mjs OK');
