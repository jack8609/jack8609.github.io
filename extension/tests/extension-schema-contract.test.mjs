import assert from 'node:assert/strict';

const { LOGICAL_FIELDS, createEmptyProfile, upsertField, removeField, validateProfile, partitionEvidenceSelector } =
  await import('../lib/schema.js');

assert.deepEqual(LOGICAL_FIELDS, [
  'date', 'time', 'plate', 'location', 'description', 'violation', 'evidenceImages'
]);

// createEmptyProfile
{
  const profile = createEmptyProfile({
    siteId: 'tvrs_ntpd_gov_tw',
    displayName: '新北市違規檢舉',
    matchPatterns: ['*://tvrs.ntpd.gov.tw/*']
  });
  assert.deepEqual(profile, {
    siteId: 'tvrs_ntpd_gov_tw',
    displayName: '新北市違規檢舉',
    matchPatterns: ['*://tvrs.ntpd.gov.tw/*'],
    fieldOrder: [],
    fields: {}
  });
  assert.throws(() => createEmptyProfile({ siteId: '', displayName: 'x', matchPatterns: ['*'] }));
  assert.throws(() => createEmptyProfile({ siteId: 'x', displayName: 'x', matchPatterns: [] }));
}

// upsertField: selector 一律是 { kind, value } 陣列，riskField 由陣列裡任何一個 item 是否風險決定
{
  const base = createEmptyProfile({
    siteId: 's1', displayName: 'S1', matchPatterns: ['*://s1/*']
  });
  const withPlate = upsertField(base, 'plate', {
    selector: [
      { kind: 'plain', value: '#vio_car_num1' },
      { kind: 'plain', value: '#vio_car_num2' }
    ]
  });
  assert.notStrictEqual(withPlate, base, 'upsertField 必須回傳新物件，不可原地修改');
  assert.deepEqual(base.fieldOrder, [], '原本的 profile 不可被改動');
  assert.deepEqual(withPlate.fieldOrder, ['plate']);
  assert.strictEqual(withPlate.fields.plate.riskField, false, '全部都是 plain 的欄位預設非風險欄位');

  const withViolation = upsertField(withPlate, 'violation', {
    selector: [{ kind: 'select', value: '#eventsData_vio_content_code' }]
  });
  assert.deepEqual(withViolation.fieldOrder, ['plate', 'violation'], 'fieldOrder 依綁定先後追加');
  assert.strictEqual(withViolation.fields.violation.riskField, true, 'select 欄位預設風險欄位');

  // 重新綁定同一欄位不應該把它移到 fieldOrder 尾端
  const rebound = upsertField(withViolation, 'plate', {
    selector: [
      { kind: 'plain', value: '#vio_car_num1' },
      { kind: 'plain', value: '#vio_car_num2' },
      { kind: 'plain', value: '#vio_car_num3' }
    ]
  });
  assert.deepEqual(rebound.fieldOrder, ['plate', 'violation']);

  assert.throws(() => upsertField(base, 'notARealField', { selector: [{ kind: 'plain', value: '#x' }] }));

  // select/custom 一律是風險欄位，呼叫端不可覆寫成 false（不變式）
  const forcedRisk = upsertField(base, 'violation', {
    selector: [{ kind: 'select', value: '#v' }], riskField: false
  });
  assert.strictEqual(forcedRisk.fields.violation.riskField, true, 'select 的 riskField 不可被覆寫成 false');

  // 混合 kind 的欄位（台北市「違規地點」真實案例：行政區是 custom，路名是 plain）：
  // 只要陣列裡有任何一個 item 是 select/custom，整個欄位就要是風險欄位——不能因為後來
  // 又新增了一個 plain item 就把整個欄位判定成非風險（這是本檔案曾經修過的真 bug）。
  const withMixedLocation = upsertField(base, 'location', {
    selector: [
      { kind: 'custom', value: '#district-trigger' },
      { kind: 'plain', value: '#road-name-input' }
    ]
  });
  assert.strictEqual(withMixedLocation.fields.location.riskField, true, '混合 kind 只要有一個 custom 就是風險欄位');
}

// removeField
{
  const base = createEmptyProfile({ siteId: 's1', displayName: 'S1', matchPatterns: ['*://s1/*'] });
  const withTwo = upsertField(
    upsertField(base, 'date', { selector: [{ kind: 'plain', value: '#d' }] }),
    'time', { selector: [{ kind: 'select', value: '#t' }] }
  );
  const removed = removeField(withTwo, 'date');
  assert.deepEqual(removed.fieldOrder, ['time']);
  assert.deepEqual(Object.keys(removed.fields), ['time']);
}

// validateProfile
{
  const good = upsertField(
    createEmptyProfile({ siteId: 's1', displayName: 'S1', matchPatterns: ['*://s1/*'] }),
    'date', { selector: [{ kind: 'plain', value: '#d' }] }
  );
  assert.deepEqual(validateProfile(good), { valid: true, errors: [] });

  const badKind = {
    ...good,
    fields: { date: { ...good.fields.date, selector: [{ kind: 'weird', value: '#d' }] } }
  };
  assert.strictEqual(validateProfile(badKind).valid, false);

  const emptySelector = {
    ...good,
    fields: { date: { ...good.fields.date, selector: [] } }
  };
  assert.strictEqual(validateProfile(emptySelector).valid, false, 'selector 不可是空陣列');

  const missingValue = {
    ...good,
    fields: { date: { ...good.fields.date, selector: [{ kind: 'plain' }] } }
  };
  assert.strictEqual(validateProfile(missingValue).valid, false, 'selector item 缺少 value');

  const missingFieldOrderTarget = { ...good, fieldOrder: ['date', 'ghost'] };
  assert.strictEqual(validateProfile(missingFieldOrderTarget).valid, false);

  const brokenRiskInvariant = {
    ...good,
    fields: {
      date: good.fields.date,
      violation: { selector: [{ kind: 'select', value: '#v' }], riskField: false }
    },
    fieldOrder: ['date', 'violation']
  };
  assert.strictEqual(validateProfile(brokenRiskInvariant).valid, false, 'select item 存在時 riskField 必須是 true');

  assert.strictEqual(validateProfile(null).valid, false);

  // P2 新增：location 欄位 item 的可選 role（district/road/remainder），不合法值要擋下來
  const withGoodRole = {
    ...good,
    fields: {
      date: good.fields.date,
      location: {
        riskField: true,
        selector: [
          { kind: 'custom', value: '#district', role: 'district' },
          { kind: 'plain', value: '#road', role: 'road' },
          { kind: 'plain', value: '#lane' }
        ]
      }
    },
    fieldOrder: ['date', 'location']
  };
  assert.deepEqual(validateProfile(withGoodRole), { valid: true, errors: [] }, 'role 缺省或合法值都應通過驗證');

  const withBadRole = {
    ...good,
    fields: {
      date: good.fields.date,
      location: {
        riskField: true,
        selector: [{ kind: 'plain', value: '#road', role: 'not-a-real-role' }]
      }
    },
    fieldOrder: ['date', 'location']
  };
  assert.strictEqual(validateProfile(withBadRole).valid, false, '不合法的 role 值要擋下來');

  // P3 新增：evidenceImages 的 file-trigger kind（PLAN_B.md「已定案設計」，見
  // .scratch/chrome-extension-p3-evidence-upload/issues/01-file-trigger-binding.md）。
  const withFileTrigger = {
    ...good,
    fields: {
      date: good.fields.date,
      evidenceImages: { riskField: false, selector: [{ kind: 'file-trigger', value: '#add-file-btn' }] }
    },
    fieldOrder: ['date', 'evidenceImages']
  };
  assert.deepEqual(validateProfile(withFileTrigger), { valid: true, errors: [] }, 'file-trigger 是合法 kind，且不強制 riskField');

  const withTwoFileTriggers = {
    ...good,
    fields: {
      date: good.fields.date,
      evidenceImages: {
        riskField: false,
        selector: [
          { kind: 'file-trigger', value: '#add-file-btn' },
          { kind: 'file-trigger', value: '#another-btn' }
        ]
      }
    },
    fieldOrder: ['date', 'evidenceImages']
  };
  assert.strictEqual(validateProfile(withTwoFileTriggers).valid, false, 'evidenceImages 的 file-trigger selector 固定只能有 1 個 item');

  // 票券 01 新增：evidenceImages 的 file-slots kind（臺南/桃園固定多槽位附件），不像
  // file-trigger 限制只能 1 個 item，允許依序綁定多個固定 input。
  const withFileSlots = {
    ...good,
    fields: {
      date: good.fields.date,
      evidenceImages: {
        riskField: false,
        selector: [
          { kind: 'file-slots', value: '#Upfile1' },
          { kind: 'file-slots', value: '#Upfile2' },
          { kind: 'file-slots', value: '#Upfile3' }
        ]
      }
    },
    fieldOrder: ['date', 'evidenceImages']
  };
  assert.deepEqual(validateProfile(withFileSlots), { valid: true, errors: [] }, 'file-slots 是合法 kind，且允許多個 item');

  const withSingleFileSlot = {
    ...good,
    fields: {
      date: good.fields.date,
      evidenceImages: { riskField: false, selector: [{ kind: 'file-slots', value: '#Upfile1' }] }
    },
    fieldOrder: ['date', 'evidenceImages']
  };
  assert.deepEqual(validateProfile(withSingleFileSlot), { valid: true, errors: [] }, 'file-slots 也允許只綁 1 個 item');

  // 票券 02 新增：evidenceImages 的確認上傳按鈕 role（高雄兩段式上傳，選檔後需再按一次獨立
  // 的「上傳」鈕），跟主要的 file-trigger item 分開維護，不計入 file-trigger 只能 1 個 item
  // 的規則。
  const withConfirmUploadButton = {
    ...good,
    fields: {
      date: good.fields.date,
      evidenceImages: {
        riskField: false,
        selector: [
          { kind: 'file-trigger', value: '#add-file-btn' },
          { kind: 'file-trigger', value: '#btnMailFile', role: 'confirm-upload' }
        ]
      }
    },
    fieldOrder: ['date', 'evidenceImages']
  };
  assert.deepEqual(
    validateProfile(withConfirmUploadButton), { valid: true, errors: [] },
    'confirm-upload role 不計入 file-trigger 只能 1 個 item 的限制'
  );

  const withTwoConfirmUploadButtons = {
    ...good,
    fields: {
      date: good.fields.date,
      evidenceImages: {
        riskField: false,
        selector: [
          { kind: 'file-trigger', value: '#add-file-btn' },
          { kind: 'file-trigger', value: '#btnA', role: 'confirm-upload' },
          { kind: 'file-trigger', value: '#btnB', role: 'confirm-upload' }
        ]
      }
    },
    fieldOrder: ['date', 'evidenceImages']
  };
  assert.strictEqual(
    validateProfile(withTwoConfirmUploadButtons).valid, false, '確認上傳按鈕最多只能綁定 1 個 item'
  );

  const withConfirmUploadRoleOnOtherField = {
    ...good,
    fields: {
      date: { ...good.fields.date, selector: [{ kind: 'plain', value: '#d', role: 'confirm-upload' }] }
    },
    fieldOrder: ['date']
  };
  assert.strictEqual(
    validateProfile(withConfirmUploadRoleOnOtherField).valid, false, 'confirm-upload role 只能用在 evidenceImages 欄位'
  );

  // 確認上傳按鈕可以搭配單一個 file-slots 主要 item（高雄 fl_File 是單一 multiple input，
  // 使用者直接點選它會被記錄成單一個 file-slots item，實測發現原本「不支援 file-slots」的
  // 限制擋住了這個真實案例，見票券 02 使用者手動驗收回報）。
  const withConfirmUploadOnSingleFileSlot = {
    ...good,
    fields: {
      date: good.fields.date,
      evidenceImages: {
        riskField: false,
        selector: [
          { kind: 'file-slots', value: '#fl_File' },
          { kind: 'file-trigger', value: '#btnMailFile', role: 'confirm-upload' }
        ]
      }
    },
    fieldOrder: ['date', 'evidenceImages']
  };
  assert.deepEqual(
    validateProfile(withConfirmUploadOnSingleFileSlot), { valid: true, errors: [] },
    '確認上傳按鈕可以搭配剛好 1 個 file-slots 主要 item'
  );

  // 確認上傳按鈕不能搭配 2 個以上的 file-slots 主要 item（臺南/桃園那種各自獨立槽位選檔即
  // 直接生效，沒有「再按一次上傳鈕」這個中間步驟；見票券 02 code review）。
  const withConfirmUploadOnMultipleFileSlots = {
    ...good,
    fields: {
      date: good.fields.date,
      evidenceImages: {
        riskField: false,
        selector: [
          { kind: 'file-slots', value: '#Upfile1' },
          { kind: 'file-slots', value: '#Upfile2' },
          { kind: 'file-trigger', value: '#btnMailFile', role: 'confirm-upload' }
        ]
      }
    },
    fieldOrder: ['date', 'evidenceImages']
  };
  assert.strictEqual(
    validateProfile(withConfirmUploadOnMultipleFileSlots).valid, false, '確認上傳按鈕不能搭配 2 個以上的主要 item'
  );

  // 只綁確認上傳按鈕、沒有任何主要的檔案輸入 item 也要擋下來，不是有意義的狀態。
  const withOnlyConfirmUploadButton = {
    ...good,
    fields: {
      date: good.fields.date,
      evidenceImages: {
        riskField: false,
        selector: [{ kind: 'file-trigger', value: '#btnMailFile', role: 'confirm-upload' }]
      }
    },
    fieldOrder: ['date', 'evidenceImages']
  };
  assert.strictEqual(
    validateProfile(withOnlyConfirmUploadButton).valid, false, '不能只綁確認上傳按鈕、沒有主要的檔案輸入 item'
  );
}

// partitionEvidenceSelector：跟主要檔案輸入 item 分開拆出確認上傳按鈕 item 的共用純函式
// （票券 02，schema.js/fill-mode.js/mapping-mode.js 三處共用，避免各自維護一份 filter/find）。
{
  const withConfirm = [
    { kind: 'file-trigger', value: '#add-file-btn' },
    { kind: 'file-trigger', value: '#btnMailFile', role: 'confirm-upload' }
  ];
  assert.deepEqual(
    partitionEvidenceSelector(withConfirm),
    { confirmItem: withConfirm[1], primaryItems: [withConfirm[0]] },
    '要把確認上傳按鈕 item 跟主要 item 分開'
  );

  const withoutConfirm = [{ kind: 'file-trigger', value: '#add-file-btn' }];
  assert.deepEqual(
    partitionEvidenceSelector(withoutConfirm),
    { confirmItem: null, primaryItems: withoutConfirm },
    '沒有確認上傳按鈕時 confirmItem 要回傳 null，primaryItems 是整個陣列'
  );

  const multiSlots = [
    { kind: 'file-slots', value: '#Upfile1' },
    { kind: 'file-slots', value: '#Upfile2' }
  ];
  assert.deepEqual(
    partitionEvidenceSelector(multiSlots),
    { confirmItem: null, primaryItems: multiSlots },
    'file-slots 多個 item 且沒有確認按鈕時全部都算主要 item'
  );
}

// upsertField：file-trigger kind 不是風險 kind，跟 select/custom 不同，riskField 沿用呼叫端指定值（預設 false）
{
  const base = createEmptyProfile({ siteId: 's1', displayName: 'S1', matchPatterns: ['*://s1/*'] });
  const withEvidence = upsertField(base, 'evidenceImages', {
    selector: [{ kind: 'file-trigger', value: '#add-file-btn' }]
  });
  assert.strictEqual(withEvidence.fields.evidenceImages.riskField, false, 'file-trigger 欄位預設非風險欄位');
}

// upsertField：file-slots kind 一樣不是風險 kind，多個 item 也一樣預設非風險欄位
{
  const base = createEmptyProfile({ siteId: 's1', displayName: 'S1', matchPatterns: ['*://s1/*'] });
  const withEvidence = upsertField(base, 'evidenceImages', {
    selector: [
      { kind: 'file-slots', value: '#Upfile1' },
      { kind: 'file-slots', value: '#Upfile2' }
    ]
  });
  assert.strictEqual(withEvidence.fields.evidenceImages.riskField, false, 'file-slots 欄位預設非風險欄位');
}


console.log('extension schema contract passed');