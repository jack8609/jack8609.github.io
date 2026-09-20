import { createProfileStore } from '../lib/storage.js';
import { createSiteContextService } from '../lib/site-context.js';
import {
  getCurrentSiteActionState,
  getProfileListActionState,
  normalizeDisplayName
} from './view-state.js';

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

function createButton({ text, className = '', disabled = false, title = '', onClick }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.className = className;
  button.disabled = disabled;
  button.title = title;
  if (onClick && !disabled) button.addEventListener('click', onClick);
  return button;
}

async function renameCurrentProfile(profile) {
  const requestedName = window.prompt('網站名稱', profile.displayName);
  if (requestedName === null) return;

  const displayName = normalizeDisplayName(requestedName);
  if (!displayName) {
    currentSiteErrorEl.textContent = '網站名稱不可為空白。';
    return;
  }

  currentSiteErrorEl.textContent = '';
  await store.saveProfile({ ...profile, displayName });
  await renderCurrentSite();
  await renderProfileList();
}

function renderCurrentSiteInfo(ctx) {
  clearChildren(currentSiteInfoEl);
  currentSiteInfoEl.classList.remove('site-message');

  if (!ctx.supported) {
    currentSiteInfoEl.classList.add('site-message');
    currentSiteInfoEl.textContent = '這個分頁不是可註冊的目標網站（僅支援 http/https 網頁）。';
    return;
  }

  const nameRow = document.createElement('div');
  nameRow.className = 'site-name-row';

  const name = document.createElement('span');
  name.className = 'site-name';
  name.textContent = ctx.profile?.displayName || ctx.hostname;
  name.title = name.textContent;
  nameRow.appendChild(name);

  if (ctx.profile) {
    const renameBtn = createButton({
      text: '✎',
      className: 'site-name-edit',
      title: '編輯網站名稱',
      onClick: async () => renameCurrentProfile(ctx.profile)
    });
    renameBtn.setAttribute('aria-label', '編輯網站名稱');
    nameRow.appendChild(renameBtn);
  }

  currentSiteInfoEl.appendChild(nameRow);

  if (ctx.profile) {
    const hostname = document.createElement('p');
    hostname.className = 'site-hostname';
    hostname.textContent = ctx.hostname;
    hostname.title = ctx.hostname;
    currentSiteInfoEl.appendChild(hostname);
  }

  const status = document.createElement('span');
  status.className = `site-status${ctx.granted ? '' : ' unregistered'}`;
  status.textContent = ctx.granted
    ? `已註冊 · ${ctx.profile?.fieldOrder.length || 0} 個欄位已對應`
    : '尚未註冊';
  currentSiteInfoEl.appendChild(status);
}

async function renderCurrentSite() {
  const ctx = await getCurrentSiteContext();
  const actionState = getCurrentSiteActionState(ctx);
  clearChildren(currentSiteActionsEl);
  renderCurrentSiteInfo(ctx);

  if (!ctx.supported) {
    return;
  }

  const actionGrid = document.createElement('div');
  actionGrid.className = `site-action-grid${actionState.canRegister ? ' is-unregistered' : ''}`;

  if (actionState.canRegister) {
    actionGrid.appendChild(createButton({
      text: '註冊這個網站',
      className: 'primary site-register-action',
      onClick: async () => {
      const granted = await chrome.permissions.request({ origins: [ctx.originPattern] });
      if (!granted) return;
      await injectMappingModeOrShowError(ctx.tab.id);
      await renderCurrentSite();
      await renderProfileList();
      }
    }));
  }

  actionGrid.appendChild(createButton({
    text: '立即抓取並填表',
    className: 'primary site-fill-action',
    disabled: !actionState.canFill,
    title: actionState.canFill ? '從來源分頁讀取資料並填入目前網站的表單' : '請先註冊並建立至少一個欄位對應',
    onClick: async () => {
      currentSiteErrorEl.textContent = '';
      const result = await siteContext.runAutoFill(ctx.tab);
      if (!result.ok) {
        currentSiteErrorEl.textContent = result.reason === 'source-tab-not-found'
          ? '找不到來源分頁，請先開一個新分頁到違規檢舉小幫手網站並保持開啟。'
          : '讀不到來源分頁的違規資料，請確認資料已經填好後再試一次。';
        return;
      }
      scheduleAutoClose();
    }
  }));

  actionGrid.appendChild(createButton({
    text: '編輯欄位對應',
    disabled: !actionState.canEditMapping,
    title: actionState.canEditMapping ? '開啟欄位對應模式' : '請先註冊這個網站',
    onClick: async () => injectMappingModeOrShowError(ctx.tab.id)
  }));

  actionGrid.appendChild(createButton({
    text: '取消註冊',
    className: 'danger',
    disabled: !actionState.canRevoke,
    title: actionState.canRevoke ? '收回這個網站的存取權限；欄位對應設定會保留' : '請先註冊這個網站',
    onClick: async () => {
      if (!window.confirm(`確定要取消註冊「${ctx.hostname}」嗎？（將收回存取權限，欄位對應設定會保留）`)) return;
      await siteContext.revokeAccess(ctx.originPattern);
      await renderCurrentSite();
      await renderProfileList();
      scheduleAutoClose();
    }
  }));

  actionGrid.appendChild(createButton({
    text: '刪除設定',
    className: 'danger',
    disabled: !actionState.canDeleteProfile,
    title: actionState.canDeleteProfile ? '刪除這個網站的欄位對應設定' : '尚無可刪除的網站設定',
    onClick: async () => {
      if (!window.confirm(`確定要刪除「${ctx.hostname}」的欄位對應設定嗎？`)) return;
      await store.deleteProfile(ctx.siteId);
      await renderCurrentSite();
      await renderProfileList();
      scheduleAutoClose();
    }
  }));

  currentSiteActionsEl.appendChild(actionGrid);
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
    const actionState = getProfileListActionState(currentCtx, profile);

    const info = document.createElement('div');
    info.className = 'profile-info';

    const name = document.createElement('span');
    name.className = 'profile-name';
    name.textContent = profile.displayName;
    name.title = profile.displayName;
    info.appendChild(name);

    const meta = document.createElement('span');
    meta.className = 'profile-meta';
    meta.textContent = actionState.canEditMapping
      ? `目前網站 · ${profile.fieldOrder.length} 個欄位已對應`
      : actionState.isCurrentSite
        ? '此網站已取消註冊，請先在上方重新註冊'
        : '請先開啟此網站分頁再編輯';
    info.appendChild(meta);
    li.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'profile-actions';

    actions.appendChild(createButton({
      text: '編輯',
      disabled: !actionState.canEditMapping,
      title: actionState.canEditMapping
        ? '開啟欄位對應模式'
        : actionState.isCurrentSite
          ? '此網站已取消註冊，請先在上方重新註冊'
          : '請先開啟此網站分頁再編輯',
      onClick: async () => injectMappingModeOrShowError(currentCtx.tab.id)
    }));

    actions.appendChild(createButton({
      text: '取消註冊',
      className: 'danger',
      title: '收回擴充功能對此網站的存取權限；欄位對應設定會保留',
      onClick: async () => {
        if (!window.confirm(`確定要取消註冊「${profile.displayName}」嗎？（將收回存取權限，欄位對應設定會保留）`)) return;
        await siteContext.revokeAccess(profile.matchPatterns);
        await renderCurrentSite();
        await renderProfileList();
        scheduleAutoClose();
      }
    }));

    actions.appendChild(createButton({
      text: '刪除',
      className: 'danger',
      title: '刪除這個網站的欄位對應設定',
      onClick: async () => {
        if (!window.confirm(`確定要刪除「${profile.displayName}」的欄位對應設定嗎？`)) return;
        await store.deleteProfile(profile.siteId);
        await renderCurrentSite();
        await renderProfileList();
        scheduleAutoClose();
      }
    }));
    li.appendChild(actions);

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
