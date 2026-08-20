import { createProfileStore } from '../lib/storage.js';
import { createSiteContextService } from '../lib/site-context.js';
import { originPatternFromUrl } from '../lib/site.js';

const store = createProfileStore(chrome.storage.local);
const siteContext = createSiteContextService(store);

const MENU_ACTION_PRIMARY = 'action-primary';

// 沒有 "tabs" 權限時，chrome.tabs.onActivated/onUpdated 拿到的 tab 物件不含 url，
// 無法在使用者點擊「之前」動態判斷網站狀態改標題；tab.url 只在使用者實際觸發
// activeTab 手勢（點圖示、點右鍵選單項目）時才可讀，因此標題維持固定文字，
// 實際「註冊」或「編輯」的分流判斷延後到 onClicked 當下才做。
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ACTION_PRIMARY, title: '註冊 / 編輯這個網站的欄位對應', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'separator-1', type: 'separator', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'manage-all', title: '管理所有已建檔網站', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'export-import', title: '匯出/匯入設定', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'advanced-settings', title: '進階設定', contexts: ['action'] });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  if (info.menuItemId === 'manage-all' || info.menuItemId === 'export-import' || info.menuItemId === 'advanced-settings') {
    try {
      await chrome.action.openPopup();
    } catch (err) {
      console.warn('[違規檢舉小幫手] 無法自動開啟管理彈出視窗，請直接點擊擴充功能圖示。', err);
    }
    return;
  }

  if (info.menuItemId !== MENU_ACTION_PRIMARY) return;

  const originPattern = originPatternFromUrl(tab.url);
  if (!originPattern) {
    console.warn('[違規檢舉小幫手] 這個分頁不是可註冊的目標網站（僅支援 http/https 網頁）。');
    return;
  }

  // chrome.permissions.request 必須是這個 handler 裡第一個 await——
  // 前面只要多等一次別的 await（例如先查 permissions.contains/storage），
  // 使用者手勢就會失效，跳出 "This function must be called during a user gesture"。
  // 已授權的網域呼叫 request() 會直接 resolve true、不會再跳提示，所以不用先查 contains。
  const granted = await chrome.permissions.request({ origins: [originPattern] });
  if (!granted) return;

  try {
    await siteContext.injectMappingMode(tab.id);
  } catch (err) {
    console.error('[違規檢舉小幫手] 注入對應模式失敗', err);
  }
});
