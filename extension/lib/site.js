// siteId 是 chrome.storage.local 裡欄位對應表的 key，取 hostname 並把非英數字元換成底線。
export function siteIdFromHostname(hostname) {
  return hostname.replace(/[^a-zA-Z0-9]/g, '_');
}

// 只有 http(s) 網址才可能是目標網站；chrome://、file:// 等一律視為不支援。
export function originPatternFromUrl(urlString) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  return `${url.protocol}//${url.hostname}/*`;
}
