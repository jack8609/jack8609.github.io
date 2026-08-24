// P3 附件自動上傳共用邏輯（PLAN_B.md「已定案設計」）：觸發原生選檔視窗、依解析到的 base input
// 是否支援 multiple 決定怎麼把選定的檔案塞進去。「跳出選檔視窗＋拿到選定檔案」與「決定要不要走
// 一次性 DataTransfer 賦值」是台北市/新北市兩站共用的機制（見票券 02/03 說明）。
// multiple === false（新北市）時走 injectFilesIncrementally()：逐一點擊觸發按鈕，用祖先鏈
// 子元素數量 diff 演算法找出新增的檔案槽位（見票券 03）。
// DOM 互動（實際觸發選檔視窗、賦值上傳 input、點擊觸發按鈕）依專案慣例不寫自動化測試；
// 純決策/比對邏輯（planEvidenceInjection、findGrownAncestorLevel、findNewChild）不碰 DOM，
// 有 contract test。

// 台北市已知格式清單，兩站共用（PLAN_B.md 已定案設計第 4 點），僅輔助篩選不做強制驗證。
export const EVIDENCE_ACCEPT = '.jpg,.jpeg,.png,.bmp,.tiff,.mp4,.mov,.wmv,.avi,.3gp,.ts';

// 動態建立一個插件自己掌控的隱藏 file input 當選檔媒介，而不是直接複用目標網站那顆 hidden input
// 觸發選檔（PLAN_B.md「實作範圍」第 1 點）：避免跟網站自己的 change handler / Vue 監聽衝突。
// 選完（或使用者取消）就從 DOM 移除，不留下多餘節點。'cancel' 事件（Chrome 116+）在使用者按
// 取消時觸發，此時不會有 change 事件，明確回傳空陣列，不讓 Promise 永遠 pending。
// 呼叫端（content/fill-mode.js）必須從彙總視窗按鈕的 click handler 呼叫這個函式，而不是在填表
// 流程尾端自動呼叫：這裡的 input.click() 需要瀏覽器的 transient user activation 才能可靠觸發
// 原生選檔視窗，填表流程尾端經歷過多次 await/setTimeout 後，使用者最初點擊 popup 按鈕的手勢
// 資格可能已經失效，若靜默失敗（沒跳出視窗也沒有任何事件），這個 Promise 會永遠不 resolve。
export function promptForEvidenceFiles({ accept = EVIDENCE_ACCEPT } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = accept;
    input.style.display = 'none';
    function cleanup(files) {
      input.remove();
      resolve(files);
    }
    input.addEventListener('change', () => cleanup(Array.from(input.files || [])), { once: true });
    input.addEventListener('cancel', () => cleanup([]), { once: true });
    document.documentElement.appendChild(input);
    input.click();
  });
}

// 純決策邏輯：依解析到的 base input 是否支援 multiple 與使用者選定的檔案數量，決定怎麼處理，
// 不碰 DOM（只讀 baseInput.multiple），讓這段決策可以用假物件測試。
export function planEvidenceInjection(baseInput, files) {
  if (!files || files.length === 0) return { action: 'no-files' };
  if (baseInput.multiple) return { action: 'assign-all', files };
  // 新北市（multiple === false）：base input 一次只能放 1 個檔案，其餘檔案要靠逐一點擊觸發按鈕
  // 產生新槽位注入，見 injectFilesIncrementally（票券 03：.scratch/chrome-extension-p3-evidence-upload/issues/03-newtaipei-incremental-upload.md）。
  return { action: 'incremental', files };
}

// DOM 副作用：把選定的檔案組成 DataTransfer 賦值進 base input 並 dispatch 一次 change，
// 讓目標網站自己的 change handler / Vue 監聽接手渲染附件表格列。
export function injectFilesIntoInput(input, files) {
  const dataTransfer = new DataTransfer();
  files.forEach((file) => dataTransfer.items.add(file));
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// 新北市逐一增量注入（multiple === false，票券 03）：新增檔案槽位不是插進某個寫死的容器 id，
// 而是點擊「新增檔案」按鈕後，網站自己的 JS 把新的一整列 DOM 直接 append 到某一層祖先的尾端
// （見票券 03「背景」：實測是 append 到 #file_box，但這裡不寫死那個 id，兩站共用同一套「祖先鏈
// 子元素數量 diff」演算法，跟 resolveFileTriggerInput 反推 base input 是同一種思路）。

// 純函式（不碰 DOM）：比對點擊前後、同一組祖先鏈每一層的子元素數量，找出「剛好 +1」的那一層
// index；找不到（每一層都持平，或落差不是 +1，代表網站行為跟預期不符）回傳 -1，讓呼叫端明確
// 回報「這個檔案無法自動上傳」，不要猜測或硬套某一層。
export function findGrownAncestorLevel(beforeCounts, afterCounts) {
  for (let i = 0; i < beforeCounts.length; i += 1) {
    if (afterCounts[i] === beforeCounts[i] + 1) return i;
  }
  return -1;
}

// 純函式（不碰 DOM）：從同一層祖先點擊前後的子節點陣列，找出新增的那個子節點（不在 before
// 陣列裡的那個）；理論上不會發生「數量 +1 但找不到新節點」，找不到就回傳 null 讓呼叫端當失敗處理，
// 不拋錯。
export function findNewChild(beforeChildren, afterChildren) {
  const beforeSet = new Set(beforeChildren);
  return afterChildren.find((child) => !beforeSet.has(child)) || null;
}

function collectAncestorChain(triggerEl) {
  const chain = [];
  let ancestor = triggerEl && triggerEl.parentElement;
  while (ancestor) {
    chain.push(ancestor);
    ancestor = ancestor.parentElement;
  }
  return chain;
}

// DOM 副作用：點擊觸發按鈕產生新槽位，回傳新槽位裡的 input[type=file]；找不到（網站行為跟預期
// 不符）回傳 null，呼叫端負責回報「第 N 個附件無法自動上傳」，不靜默跳過或中斷整個流程
// （票券 03 驗收標準）。祖先鏈範圍跟 resolveFileTriggerInput 一致，不假設固定深度。
export function clickTriggerAndFindNewSlot(triggerEl) {
  const ancestors = collectAncestorChain(triggerEl);
  const beforeChildren = ancestors.map((ancestor) => Array.from(ancestor.children));
  triggerEl.click();
  const afterChildren = ancestors.map((ancestor) => Array.from(ancestor.children));
  const level = findGrownAncestorLevel(beforeChildren.map((c) => c.length), afterChildren.map((c) => c.length));
  if (level === -1) return null;
  const newChild = findNewChild(beforeChildren[level], afterChildren[level]);
  if (!newChild) return null;
  return newChild.matches('input[type="file"]') ? newChild : newChild.querySelector('input[type="file"]');
}

// 逐一增量注入所有選定檔案：第 1 個檔案直接賦值進 base input；第 2 個檔案起逐一點擊觸發按鈕、
// 找新槽位賦值。單一檔案失敗不中斷其餘檔案的處理，回傳 failedIndexes 讓呼叫端組出
// 「第 N 個附件無法自動上傳，請手動新增」這種明確訊息（票券 03 驗收標準，不要靜默跳過）。
export function injectFilesIncrementally(baseInput, triggerEl, files) {
  const failedIndexes = [];
  files.forEach((file, index) => {
    if (index === 0) {
      injectFilesIntoInput(baseInput, [file]);
      return;
    }
    const slot = clickTriggerAndFindNewSlot(triggerEl);
    if (!slot) {
      failedIndexes.push(index);
      return;
    }
    injectFilesIntoInput(slot, [file]);
  });
  return { failedIndexes };
}

// file-slots（臺南 Upfile1~6、桃園 files1~5，票券 01：
// .scratch/six-cities-mapping/issues/01-file-slots-evidence-upload.md）：頁面載入時就固定存在
// N 個獨立、非 multiple 的原生 input[type=file]，不像 file-trigger 需要祖先鏈反推、也不像
// assign-all 一次塞進單一 multiple input，是「第 i 個選定檔案對應第 i 個綁定槽位」的直接賦值。

// 純決策邏輯（不碰 DOM）：依綁定的槽位數與使用者選定的檔案數量，決定每個檔案要指定給第幾個槽位。
// 檔案數超過槽位數時，多出的檔案不猜測塞進不存在的槽位，只回報數量讓呼叫端明確告知使用者；
// 檔案數少於槽位數時，只填有對應檔案的槽位，其餘槽位維持原狀不動。
export function planFileSlotsInjection(slotCount, files) {
  if (!files || files.length === 0) return { assignments: [], overflowCount: 0 };
  const assignedFiles = files.slice(0, slotCount);
  const assignments = assignedFiles.map((file, slotIndex) => ({ slotIndex, file }));
  return { assignments, overflowCount: Math.max(0, files.length - slotCount) };
}

// DOM 副作用：依 planFileSlotsInjection 的結果，把每個檔案賦值進對應槽位的固定 input 並各自
// dispatch change（沿用 injectFilesIntoInput，不需要新的賦值機制）。
export function injectFilesIntoSlots(slotInputs, files) {
  const { assignments, overflowCount } = planFileSlotsInjection(slotInputs.length, files);
  assignments.forEach(({ slotIndex, file }) => injectFilesIntoInput(slotInputs[slotIndex], [file]));
  return { filledCount: assignments.length, overflowCount };
}
