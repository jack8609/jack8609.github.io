import assert from 'node:assert/strict';

const {
  getCurrentSiteActionState,
  getProfileListActionState,
  normalizeDisplayName
} = await import('../popup/view-state.js');

const mappedProfile = {
  siteId: 'policemail-kcg-gov-tw',
  displayName: '高雄市政府警察局警政信箱',
  fieldOrder: ['plate']
};

// 未註冊網站仍能開始註冊，但既有網站操作全部維持不可用。
assert.deepEqual(
  getCurrentSiteActionState({ supported: true, granted: false }),
  {
    canRegister: true,
    canFill: false,
    canEditMapping: false,
    canRevoke: false,
    canDeleteProfile: false
  }
);

// 已註冊且有欄位對應時，所有目前網站的操作都可用。
assert.deepEqual(
  getCurrentSiteActionState({ supported: true, granted: true, profile: mappedProfile }),
  {
    canRegister: false,
    canFill: true,
    canEditMapping: true,
    canRevoke: true,
    canDeleteProfile: true
  }
);

// 已註冊但尚未對應欄位時，仍可編輯與刪除設定，但不可填表。
assert.deepEqual(
  getCurrentSiteActionState({
    supported: true,
    granted: true,
    profile: { ...mappedProfile, fieldOrder: [] }
  }),
  {
    canRegister: false,
    canFill: false,
    canEditMapping: true,
    canRevoke: true,
    canDeleteProfile: true
  }
);

assert.deepEqual(
  getProfileListActionState({ supported: true, siteId: mappedProfile.siteId }, mappedProfile),
  { isCurrentSite: true, canEditMapping: true }
);
assert.deepEqual(
  getProfileListActionState({ supported: true, siteId: 'other-site' }, mappedProfile),
  { isCurrentSite: false, canEditMapping: false }
);

assert.strictEqual(normalizeDisplayName('  高雄交通檢舉  '), '高雄交通檢舉');
assert.strictEqual(normalizeDisplayName('   '), null);

console.log('extension popup view state contract passed');