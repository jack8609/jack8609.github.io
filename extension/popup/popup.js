import { createProfileStore } from '../lib/storage.js';
import { createSiteContextService } from '../lib/site-context.js';

const store = createProfileStore(chrome.storage.local);
const siteContext = createSiteContextService(store);

const currentSiteInfoEl = document.getElementById('current-site-info');
const currentSiteActionsEl = document.getElementById('current-site-actions');
const currentSiteErrorEl = document.getElementById('current-site-error');
const profileListEl = document.getElementById('profile-list');
const exportImportMessageEl = document.getElementById('export-import-message');
const fuzzyMatchCheckbox = document.getElementById('checkbox-fuzzy-match');

async function getCurrentSiteContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return siteContext.getSiteContext(tab);
}

// popup 是瀏覽器預設的小視窗，動作完成後若不主動關閉會一直浮在畫面前景擋住頁面
// （尤其對應模式面板也開在頁面右上角，會被還開著的 popup 蓋住）。成功動作後統一延遲關閉，
// 留一點時間讓使用者看到結果訊息；失敗時則不關閉，讓使用者看得到錯誤訊息並可重試。
const AUTO_CLOSE_DELAY_MS = 800;
function scheduleAutoClose() {
  setTimeout(() => window.close(), AUTO_CLOSE_DELAY_MS);
}

// 按鈕點擊若失敗（例如注入對應模式時分頁已關閉/無權限），過去只在 console 留 log，
// 使用者看起來就像「沒有任何反應」；改成同時把訊息秀在畫面上。
async function injectMappingModeOrShowError(tabId) {
  currentSiteErrorEl.textContent = '';
  try {
    await siteContext.injectMappingMode(tabId);
    scheduleAutoClose();
  } catch (err) {
    console.error('[違規檢舉小幫手] 開啟對應模式失敗', err);
    currentSiteErrorEl.textContent = `開啟對應模式失敗：${err.message}`;
  }
}

function clearChildren(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

async function renderCurrentSite() {
  const ctx = await getCurrentSiteContext();
  clearChildren(currentSiteActionsEl);

  if (!ctx.supported) {
    currentSiteInfoEl.textContent = '這個分頁不是可註冊的目標網站（僅支援 http/https 網頁）。';
    return;
  }

  currentSiteInfoEl.textContent = ctx.granted
    ? `${ctx.hostname}（已註冊${ctx.profile?.fieldOrder.length ? '，已建檔' : '，尚未建立欄位對應'}）`
    : `${ctx.hostname}（尚未註冊）`;

  if (!ctx.granted) {
    const registerBtn = document.createElement('button');
    registerBtn.type = 'button';
    registerBtn.textContent = '註冊這個網站';
    registerBtn.addEventListener('click', async () => {
      const granted = await chrome.permissions.request({ origins: [ctx.originPattern] });
      if (!granted) return;
      await injectMappingModeOrShowError(ctx.tab.id);
      await renderCurrentSite();
      await renderProfileList();
    });
    currentSiteActionsEl.appendChild(registerBtn);
    return;
  }

  const mapBtn = document.createElement('button');
  mapBtn.type = 'button';
  mapBtn.textContent = '編輯這個網站的欄位對應';
  mapBtn.addEventListener('click', async () => {
    await injectMappingModeOrShowError(ctx.tab.id);
  });
  currentSiteActionsEl.appendChild(mapBtn);

  // P2：已建檔（至少綁過一個欄位）的目標網站才給「立即抓取並填表」，沿用既有左鍵開管理彈出
  // 視窗的行為不變，只是多一個按鈕觸發即時抓取來源分頁＋自動填表（ADR 0001 的即時抓取）。
  if (ctx.profile && ctx.profile.fieldOrder.length > 0) {
    const fillBtn = document.createElement('button');
    fillBtn.type = 'button';
    fillBtn.textContent = '立即抓取並填表';
    fillBtn.title = '從還開著的違規檢舉小幫手分頁讀取資料，依欄位對應表填進這個網站的表單';
    fillBtn.addEventListener('click', async () => {
      currentSiteErrorEl.textContent = '';
      const result = await siteContext.runAutoFill(ctx.tab);
      if (!result.ok) {
        currentSiteErrorEl.textContent = result.reason === 'source-tab-not-found'
          ? '找不到來源分頁，請先開一個新分頁到違規檢舉小幫手網站並保持開啟。'
          : '讀不到來源分頁的違規資料，請確認資料已經填好後再試一次。';
        return;
      }
      scheduleAutoClose();
    });
    currentSiteActionsEl.appendChild(fillBtn);
  }

  const revokeBtn = document.createElement('button');
  revokeBtn.type = 'button';
  revokeBtn.className = 'danger';
  revokeBtn.textContent = '取消註冊此網站';
  revokeBtn.title = '收回擴充功能對此網站的存取權限；已建立的欄位對應設定會保留，之後可重新註冊沿用';
  revokeBtn.addEventListener('click', async () => {
    if (!window.confirm(`確定要取消註冊「${ctx.hostname}」嗎？（將收回存取權限，欄位對應設定會保留）`)) return;
    await siteContext.revokeAccess(ctx.originPattern);
    await renderCurrentSite();
    await renderProfileList();
    scheduleAutoClose();
  });
  currentSiteActionsEl.appendChild(revokeBtn);

  if (ctx.profile) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = '刪除此網站設定';
    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(`確定要刪除「${ctx.hostname}」的欄位對應設定嗎？`)) return;
      await store.deleteProfile(ctx.siteId);
      await renderCurrentSite();
      await renderProfileList();
      scheduleAutoClose();
    });
    currentSiteActionsEl.appendChild(deleteBtn);
  }
}

async function renderProfileList() {
  const currentCtx = await getCurrentSiteContext();
  const profiles = await store.listProfiles();
  clearChildren(profileListEl);

  const entries = Object.values(profiles);
  if (!entries.length) {
    const li = document.createElement('li');
    li.textContent = '尚未建檔任何網站。';
    profileListEl.appendChild(li);
    return;
  }

  for (const profile of entries) {
    const li = document.createElement('li');

    const name = document.createElement('span');
    name.textContent = `${profile.displayName}（${profile.fieldOrder.length} 個欄位已對應）`;
    li.appendChild(name);

    const isCurrentSite = currentCtx.supported && currentCtx.siteId === profile.siteId;
    if (isCurrentSite) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = '編輯';
      editBtn.addEventListener('click', async () => {
        await injectMappingModeOrShowError(currentCtx.tab.id);
      });
      li.appendChild(editBtn);
    } else {
      const hint = document.createElement('span');
      hint.textContent = '（請先開啟此網站分頁再編輯）';
      li.appendChild(hint);
    }

    const revokeBtn = document.createElement('button');
    revokeBtn.type = 'button';
    revokeBtn.className = 'danger';
    revokeBtn.textContent = '取消註冊';
    revokeBtn.title = '收回擴充功能對此網站的存取權限；欄位對應設定會保留';
    revokeBtn.addEventListener('click', async () => {
      if (!window.confirm(`確定要取消註冊「${profile.displayName}」嗎？（將收回存取權限，欄位對應設定會保留）`)) return;
      await siteContext.revokeAccess(profile.matchPatterns);
      await renderCurrentSite();
      await renderProfileList();
      scheduleAutoClose();
    });
    li.appendChild(revokeBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'danger';
    deleteBtn.textContent = '刪除';
    deleteBtn.addEventListener('click', async () => {
      if (!window.confirm(`確定要刪除「${profile.displayName}」的欄位對應設定嗎？`)) return;
      await store.deleteProfile(profile.siteId);
      await renderCurrentSite();
      await renderProfileList();
      scheduleAutoClose();
    });
    li.appendChild(deleteBtn);

    profileListEl.appendChild(li);
  }
}

function setupExportImport() {
  document.getElementById('btn-export').addEventListener('click', async () => {
    const json = await store.exportProfiles();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `violation-helper-profiles-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    exportImportMessageEl.textContent = '已匯出。';
    // 不排程自動關閉：部分瀏覽器設定「每次下載都詢問儲存位置」會跳出另存新檔對話框，
    // 若這時 popup 視窗被關掉，對話框所屬的視窗一併消失，下載會直接被取消、檔案存不下來。
  });

  document.getElementById('input-import').addEventListener('change', async (evt) => {
    const file = evt.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const count = await store.importProfiles(text);
      exportImportMessageEl.textContent = `已匯入 ${count} 筆設定。`;
      await renderCurrentSite();
      await renderProfileList();
      scheduleAutoClose();
    } catch (err) {
      exportImportMessageEl.textContent = `匯入失敗：${err.message}`;
    } finally {
      evt.target.value = '';
    }
  });
}

async function setupAdvancedSettings() {
  const settings = await store.getSettings();
  fuzzyMatchCheckbox.checked = settings.fuzzyMatchAllowed;
  fuzzyMatchCheckbox.addEventListener('change', async () => {
    await store.saveSettings({ ...settings, fuzzyMatchAllowed: fuzzyMatchCheckbox.checked });
  });
}

await renderCurrentSite();
await renderProfileList();
setupExportImport();
await setupAdvancedSettings();
