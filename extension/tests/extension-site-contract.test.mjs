import assert from 'node:assert/strict';

const { siteIdFromHostname, originPatternFromUrl } = await import('../lib/site.js');

{
  assert.strictEqual(siteIdFromHostname('tvrs.ntpd.gov.tw'), 'tvrs_ntpd_gov_tw');
  assert.strictEqual(siteIdFromHostname('prsweb.tcpd.gov.tw'), 'prsweb_tcpd_gov_tw');
}

{
  assert.strictEqual(originPatternFromUrl('https://tvrs.ntpd.gov.tw/Home/Report'), 'https://tvrs.ntpd.gov.tw/*');
  assert.strictEqual(originPatternFromUrl('http://prsweb.tcpd.gov.tw/#/New'), 'http://prsweb.tcpd.gov.tw/*');
  assert.strictEqual(originPatternFromUrl('chrome://extensions'), null, '非 http(s) 網址一律視為不支援');
  assert.strictEqual(originPatternFromUrl('not a url'), null);
}

console.log('extension site contract passed');
