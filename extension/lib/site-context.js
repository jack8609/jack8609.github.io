import { siteIdFromHostname, originPatternFromUrl } from './site.js';

// 來源網站（違規檢舉小幫手本體）固定網域，跟 manifest.json 的 host_permissions 要保持一致——
// 這是擴充功能唯一、已知、發布時就固定的來源網站，不像目標網站是使用者日後才註冊的未知網域
// （ADR 0003 的 optional_host_permissions 只涵蓋那些），所以用固定的 host_permissions。
const SOURCE_SITE_URL_PATTERN = 'https://jack8609.github.io/*';

// 在來源分頁（MAIN world 不需要，DOM 值本身就是 isolated world 共享的）讀取違規資料。
// 必須是不依賴外層閉包變數的獨立函式，因為 chrome.scripting.executeScript 的 func 會被
// 序列化後丟到分頁的頁面內容執行，只能參考 document/window 這類頁面全域。
function readSourceDataFromPage() {
  const byId = (id) => document.getElementById(id);
  const plate1 = byId('ve-plate1');
  const violationSelect = byId('ve-violation');
  const dateInput = byId('ve-date');
  if (!plate1 || !violationSelect || !dateInput) return null;
  const plate2 = byId('ve-plate2');
  const hourSelect = byId('ve-hour');
  const minuteSelect = byId('ve-minute');
  const roadInput = byId('ve-road');
  const outputTextarea = byId('ve-output');
  const selectedViolationOption = violationSelect.options[violationSelect.selectedIndex];
  return {
    plate: [plate1.value || '', plate2 ? (plate2.value || '') : ''],
    violationText: selectedViolationOption ? selectedViolationOption.textContent.trim() : '',
    date: dateInput.value || '',
    hour: hourSelect ? (hourSelect.value || '') : '',
    minute: minuteSelect ? (minuteSelect.value || '') : '',
    address: roadInput ? (roadInput.value || '') : '',
    description: outputTextarea ? (outputTextarea.value || '') : ''
  };
}

// 背景 service worker 與 popup 都需要「判斷目前分頁的註冊/建檔狀態」與「注入對應模式」，
// 抽成共用模組避免兩處各自維護一份一樣的邏輯（Shotgun Surgery）。
export function createSiteContextService(store) {
  async function getSiteContext(tab) {
    const originPattern = tab?.url ? originPatternFromUrl(tab.url) : null;
    if (!originPattern) {
      return { supported: false };
    }
    const hostname = new URL(tab.url).hostname;
    const siteId = siteIdFromHostname(hostname);
    const granted = await chrome.permissions.contains({ origins: [originPattern] });
    const profile = granted ? await store.getProfile(siteId) : null;
    return { supported: true, tab, hostname, siteId, originPattern, granted, profile };
  }

  async function injectMappingMode(tabId) {
    await chrome.scripting.insertCSS({ target: { tabId }, files: ['content/mapping-mode.css'] });
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/mapping-mode.js'] });
  }

  // 「取消註冊」= 收回 optional_host_permissions 授權，欄位對應設定不受影響（可留待日後重新註冊沿用）。
  async function revokeAccess(originPatterns) {
    const origins = Array.isArray(originPatterns) ? originPatterns : [originPatterns];
    return chrome.permissions.remove({ origins });
  }

  // 即時抓取（ADR 0001）：找還開著的來源分頁，取用完即丟，找不到就明確回報原因讓呼叫端提示使用者。
  async function findSourceTab() {
    const tabs = await chrome.tabs.query({ url: SOURCE_SITE_URL_PATTERN });
    return tabs[0] || null;
  }

  async function pullSourceData(tabId) {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: readSourceDataFromPage });
    return result;
  }

  // P2「左鍵=立即抓取並填表」的完整流程：找來源分頁→讀資料→把資料丟進目標分頁→注入填表邏輯。
  async function runAutoFill(targetTab) {
    const sourceTab = await findSourceTab();
    if (!sourceTab) return { ok: false, reason: 'source-tab-not-found' };

    const sourceData = await pullSourceData(sourceTab.id);
    if (!sourceData) return { ok: false, reason: 'source-data-not-found' };

    await chrome.scripting.executeScript({
      target: { tabId: targetTab.id },
      func: (data) => { window.__violationHelperSourceData = data; },
      args: [sourceData]
    });
    await chrome.scripting.insertCSS({ target: { tabId: targetTab.id }, files: ['content/fill-mode.css'] });
    await chrome.scripting.executeScript({ target: { tabId: targetTab.id }, files: ['content/fill-mode.js'] });
    return { ok: true };
  }

  return { getSiteContext, injectMappingMode, revokeAccess, findSourceTab, pullSourceData, runAutoFill };
}
