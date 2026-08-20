import assert from 'node:assert/strict';

const { createProfileStore } = await import('../lib/storage.js');
const { createEmptyProfile, upsertField } = await import('../lib/schema.js');

function createFakeStorageArea() {
  const data = {};
  return {
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(entries) {
      Object.assign(data, entries);
    },
    _dump: () => data
  };
}

// listProfiles/getProfile 在空 storage 下的預設值
{
  const store = createProfileStore(createFakeStorageArea());
  assert.deepEqual(await store.listProfiles(), {});
  assert.strictEqual(await store.getProfile('ghost'), null);
}

// saveProfile 拒絕不合法的 profile，且不落地寫入
{
  const area = createFakeStorageArea();
  const store = createProfileStore(area);
  await assert.rejects(() => store.saveProfile({ siteId: 'x' }));
  assert.deepEqual(area._dump(), {});
}

// saveProfile / getProfile / listProfiles / deleteProfile 完整往返
{
  const area = createFakeStorageArea();
  const store = createProfileStore(area);
  const profile = upsertField(
    createEmptyProfile({ siteId: 'tvrs', displayName: '新北市', matchPatterns: ['*://tvrs.ntpd.gov.tw/*'] }),
    'date', { selector: [{ kind: 'plain', value: '#eventsData_vio_date' }] }
  );
  await store.saveProfile(profile);
  assert.deepEqual(await store.getProfile('tvrs'), profile);
  assert.deepEqual(await store.listProfiles(), { tvrs: profile });

  await store.deleteProfile('tvrs');
  assert.strictEqual(await store.getProfile('tvrs'), null);
}

// exportProfiles / importProfiles 往返，且拒絕不合法內容
{
  const area = createFakeStorageArea();
  const store = createProfileStore(area);
  const profile = createEmptyProfile({ siteId: 'tvrs', displayName: '新北市', matchPatterns: ['*://tvrs.ntpd.gov.tw/*'] });
  const withField = upsertField(profile, 'plate', {
    selector: [
      { kind: 'plain', value: '#vio_car_num1' },
      { kind: 'plain', value: '#vio_car_num2' }
    ]
  });
  await store.saveProfile(withField);

  const json = await store.exportProfiles();
  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.profiles, { tvrs: withField });

  const otherArea = createFakeStorageArea();
  const otherStore = createProfileStore(otherArea);
  const importedCount = await otherStore.importProfiles(json);
  assert.strictEqual(importedCount, 1);
  assert.deepEqual(await otherStore.getProfile('tvrs'), withField);

  await assert.rejects(() => otherStore.importProfiles(JSON.stringify({ profiles: { bad: { siteId: 'bad' } } })));
}

// getSettings 預設值 / saveSettings 往返
{
  const store = createProfileStore(createFakeStorageArea());
  assert.deepEqual(await store.getSettings(), { fuzzyMatchAllowed: false });
  await store.saveSettings({ fuzzyMatchAllowed: true });
  assert.deepEqual(await store.getSettings(), { fuzzyMatchAllowed: true });
}

console.log('extension storage contract passed');
