import assert from 'node:assert/strict';

const { resolveOptionMatch, applyDateTransform, buildFillPlan, resolveCandidateGroupMatch, buildDateTimeMergeValue } =
  await import('../lib/fill-engine.js');

// resolveOptionMatch：valueMap 優先 > 選項文字完全比對 > （fuzzyAllowed 才）模糊比對
{
  const options = ['闖紅燈-紅燈右轉', '違規停車-佔用身心障礙專用停車位', '未依規定兩段式左轉'];

  // valueMap 命中：來源值對到 valueMap 記錄的其中一個選項
  assert.deepEqual(
    resolveOptionMatch(options, '紅燈右轉', { valueMap: { '闖紅燈-紅燈右轉': '紅燈右轉' } }),
    { matched: true, index: 0, reason: 'valueMap' }
  );

  // 完全比對（沒有 valueMap，來源文字跟選項文字逐字相同）
  assert.deepEqual(
    resolveOptionMatch(options, '未依規定兩段式左轉', {}),
    { matched: true, index: 2, reason: 'exact' }
  );

  // fuzzyAllowed=false 時，找不到就是找不到，不做模糊比對
  assert.deepEqual(
    resolveOptionMatch(options, '紅燈右轉沒有valueMap', { fuzzyAllowed: false }),
    { matched: false, reason: 'not-found' }
  );

  // fuzzyAllowed=true 時才退而求其次做子字串包含比對
  assert.deepEqual(
    resolveOptionMatch(options, '違規停車', { fuzzyAllowed: true }),
    { matched: true, index: 1, reason: 'fuzzy' }
  );

  // 沒有來源值就不嘗試比對
  assert.deepEqual(resolveOptionMatch(options, '', {}), { matched: false, reason: 'no-source-value' });
  assert.deepEqual(resolveOptionMatch(options, undefined, {}), { matched: false, reason: 'no-source-value' });
}

// resolveOptionMatch：路段「幾段」中文數字/阿拉伯數字寫法不一致時，退而求其次比對（介於 exact
// 跟 fuzzy 之間，不受 fuzzyAllowed 限制），這是新北市「文化路一段」比對「文化路1段」的真實案例
{
  const roadOptions = ['文化路', '文化路1段', '文化路2段'];

  // 來源是中文數字，選項是阿拉伯數字：exact 比對不到，改用路段數字轉換後才比對到「文化路1段」，
  // 不會誤選成沒有段別的「文化路」（fuzzyAllowed 預設 false 也要能命中，因為這不是鬆散猜測）
  assert.deepEqual(
    resolveOptionMatch(roadOptions, '文化路一段', {}),
    { matched: true, index: 1, reason: 'road-numeral-canonical' }
  );
  assert.deepEqual(
    resolveOptionMatch(roadOptions, '文化路二段', { fuzzyAllowed: false }),
    { matched: true, index: 2, reason: 'road-numeral-canonical' }
  );

  // 反過來：來源剛好已經是阿拉伯數字，選項是中文數字，也要能比對到
  assert.deepEqual(
    resolveOptionMatch(['文化路一段', '文化路二段'], '文化路1段', {}),
    { matched: true, index: 0, reason: 'road-numeral-canonical' }
  );

  // 沒有「段」可轉換、且完全比對不到：維持 not-found，不會被路段邏輯誤觸發
  assert.deepEqual(
    resolveOptionMatch(['選項A', '選項B'], '選項C', {}),
    { matched: false, reason: 'not-found' }
  );
}

// resolveOptionMatch：目標網站選項結尾句號有無不一致時（真實案例：桃園違規法條選項幾乎每一項
// 都帶句號，但 modules/app/violation-items.txt 內建清單不帶句號），去除結尾句號後比對（介於
// road-numeral-canonical 跟 fuzzy 之間，不受 fuzzyAllowed 限制，因為純標點差異不是猜測）
{
  const options = ['所載貨物滲漏、飛散、脫落、掉落。', '未戴安全帽。'];

  assert.deepEqual(
    resolveOptionMatch(options, '未戴安全帽', { fuzzyAllowed: false }),
    { matched: true, index: 1, reason: 'terminal-punctuation-normalized' }
  );

  // 兩邊都沒有句號時走一般 exact，不會被這層新邏輯影響既有行為
  assert.deepEqual(
    resolveOptionMatch(['未戴安全帽'], '未戴安全帽', {}),
    { matched: true, index: 0, reason: 'exact' }
  );

  // 去除句號後仍然對不上：維持 not-found
  assert.deepEqual(
    resolveOptionMatch(options, '未依規定使用安全帶', { fuzzyAllowed: false }),
    { matched: false, reason: 'not-found' }
  );
}

// resolveCandidateGroupMatch（票券 03：桃園違規事項候選元素群組 chose_type→chosen1/chosen2）：
// 依序跟每個候選群組的選項清單比對，第一個命中的群組就是答案；都沒命中則回傳 matched:false。
{
  const groups = [
    { controllerValue: '動態違規', optionTexts: ['闖紅燈-紅燈右轉', '未依規定兩段式左轉'] },
    { controllerValue: '靜態違規', optionTexts: ['違規停車-佔用身心障礙專用停車位', '併排停車'] }
  ];

  // 命中候選 1（動態違規清單）
  assert.deepEqual(
    resolveCandidateGroupMatch('未依規定兩段式左轉', groups),
    { matched: true, controllerValue: '動態違規', optionIndex: 1, reason: 'exact' }
  );

  // 命中候選 2（靜態違規清單）——即使命中的候選群組排在陣列後面，也要找到正確答案，不是永遠回傳第一個
  assert.deepEqual(
    resolveCandidateGroupMatch('併排停車', groups),
    { matched: true, controllerValue: '靜態違規', optionIndex: 1, reason: 'exact' }
  );

  // 兩邊都沒命中：回傳 matched:false，呼叫端一律標記待確認，不猜測選哪個候選群組
  assert.deepEqual(
    resolveCandidateGroupMatch('完全不存在的違規事實', groups),
    { matched: false, reason: 'not-found' }
  );
}

// applyDateTransform
{
  assert.equal(applyDateTransform('2026-08-17', undefined), '2026-08-17');
  assert.equal(applyDateTransform('2026-08-17', 'westernToMinguo'), '115/08/17');
  assert.equal(applyDateTransform('2026-08-17', 'westernToMinguoChinese'), '115 年 8 月 17 日');
  assert.equal(applyDateTransform('2026-01-05', 'westernToMinguoChinese'), '115 年 1 月 5 日', '月/日不補零');
  assert.equal(applyDateTransform('', 'westernToMinguo'), '');
  assert.equal(applyDateTransform('', 'westernToMinguoChinese'), '');
  assert.equal(applyDateTransform(null, 'westernToMinguo'), '');
  assert.equal(applyDateTransform(null, 'westernToMinguoChinese'), '');

  // westernToMinguoCompact（票券 05：臺中違規日期，7 碼無分隔符民國數字，月/日補零）
  assert.equal(applyDateTransform('2026-08-17', 'westernToMinguoCompact'), '1150817');
  assert.equal(applyDateTransform('2026-01-05', 'westernToMinguoCompact'), '1150105', '月/日要補零，跟中文全形格式不同');
  assert.equal(applyDateTransform('', 'westernToMinguoCompact'), '');
  assert.equal(applyDateTransform(null, 'westernToMinguoCompact'), '');
}

// buildFillPlan：純資料整形，不碰 DOM。給定 profile + 來源資料，決定每個 selector item 該填什麼值，
// 填不了（沒有來源值/角色未指定）的一律回傳 skipReason，呼叫端（content script）看到就直接標記待確認。
{
  const sourceData = {
    plate: ['ABC', '1234'],
    hour: '13',
    minute: '05',
    violationText: '未依規定兩段式左轉',
    date: '2026-08-17',
    address: '新北市板橋區文化路一段100號',
    description: '完整檢舉文字內容'
  };

  const profile = {
    fieldOrder: ['plate', 'time', 'violation', 'date', 'location', 'description'],
    fields: {
      plate: {
        riskField: false,
        selector: [{ kind: 'plain', value: '#p1' }, { kind: 'plain', value: '#p2' }]
      },
      time: {
        riskField: true,
        selector: [{ kind: 'select', value: '#hour' }, { kind: 'select', value: '#minute' }]
      },
      violation: {
        riskField: true,
        selector: [{ kind: 'select', value: '#violation' }]
      },
      date: {
        riskField: false,
        selector: [{ kind: 'plain', value: '#date', transform: 'westernToMinguo' }]
      },
      location: {
        riskField: true,
        selector: [
          { kind: 'custom', value: '#district', role: 'district' },
          { kind: 'plain', value: '#road', role: 'road' },
          { kind: 'plain', value: '#remainder', role: 'remainder' },
          { kind: 'plain', value: '#lane' } // 沒有 role：一律待確認，不猜測
        ]
      },
      description: {
        riskField: false,
        selector: [{ kind: 'plain', value: '#desc' }]
      }
    }
  };

  const plan = buildFillPlan(sourceData, profile);
  const byField = Object.fromEntries(plan.map((p) => [p.fieldName, p]));

  assert.deepEqual(byField.plate.items.map((i) => i.targetValue), ['ABC', '1234']);
  assert.deepEqual(byField.time.items.map((i) => i.targetValue), ['13', '05']);
  assert.equal(byField.violation.items[0].targetValue, '未依規定兩段式左轉');
  assert.equal(byField.date.items[0].targetValue, '115/08/17');
  assert.equal(byField.description.items[0].targetValue, '完整檢舉文字內容');

  const [district, road, remainder, lane] = byField.location.items;
  assert.equal(district.targetValue, '板橋區');
  assert.equal(road.targetValue, '文化路一段');
  assert.equal(remainder.targetValue, '100號');
  assert.equal(lane.skipReason, 'unassigned-role');

  // 沒有來源資料的欄位（例如 plate 第二格缺值）要 skip，不能填空字串
  const sparsePlan = buildFillPlan({ ...sourceData, plate: ['ABC'] }, profile);
  const sparsePlate = sparsePlan.find((p) => p.fieldName === 'plate');
  assert.equal(sparsePlate.items[0].targetValue, 'ABC');
  assert.equal(sparsePlate.items[1].skipReason, 'no-source-value');

  // 地址完全解不出行政區/路名時（例如根本不是台灣地址格式），對應 item 要 skip 而不是填空字串
  const noAddressPlan = buildFillPlan({ ...sourceData, address: '不是地址的字串' }, profile);
  const noAddressLocation = noAddressPlan.find((p) => p.fieldName === 'location');
  assert.equal(noAddressLocation.items[0].skipReason, 'address-missing-district');
  assert.equal(noAddressLocation.items[1].skipReason, 'address-missing-road');

  // kind: file 一律 skip（附件上傳這個階段不會自動處理）
  const fileProfile = {
    fieldOrder: ['evidenceImages'],
    fields: { evidenceImages: { riskField: false, selector: [{ kind: 'file', value: '#upload' }] } }
  };
  const filePlan = buildFillPlan(sourceData, fileProfile);
  assert.equal(filePlan[0].items[0].skipReason, 'unsupported-kind');

  // kind: 'file-trigger'（evidenceImages 實際使用的 kind，見票券 01/02）也要一律 skip——
  // 這個欄位走 content/fill-mode.js 的 resolveEvidenceUploadTarget() 專用流程，不套用這裡的
  // 一般 applyItem 賦值邏輯，buildFillPlan 這裡只需要正確標記，不能落到 'no-source-value'
  // （fieldName 對不上 plate/time/violation/date/description 任何一個時的預設分支）。
  const fileTriggerProfile = {
    fieldOrder: ['evidenceImages'],
    fields: { evidenceImages: { riskField: false, selector: [{ kind: 'file-trigger', value: '#add-file-btn' }] } }
  };
  const fileTriggerPlan = buildFillPlan(sourceData, fileTriggerProfile);
  assert.equal(fileTriggerPlan[0].items[0].skipReason, 'unsupported-kind');

  // kind: 'file-slots'（票券 01：臺南/桃園固定多槽位附件）同樣一律 skip——這個欄位走
  // resolveEvidenceUploadTarget() 的 file-slots 分支，不套用這裡的一般 applyItem 賦值邏輯。
  const fileSlotsProfile = {
    fieldOrder: ['evidenceImages'],
    fields: {
      evidenceImages: {
        riskField: false,
        selector: [{ kind: 'file-slots', value: '#Upfile1' }, { kind: 'file-slots', value: '#Upfile2' }]
      }
    }
  };
  const fileSlotsPlan = buildFillPlan(sourceData, fileSlotsProfile);
  assert.equal(fileSlotsPlan[0].items[0].skipReason, 'unsupported-kind');
  assert.equal(fileSlotsPlan[0].items[1].skipReason, 'unsupported-kind');

  // kind: 'custom' 的 date 欄位（台北市違規日期，Vuetify 點選式）不再靜默跳過——套用 transform 後
  // 照樣產生 targetValue，實際要不要走點擊選單流程由 content/fill-mode.js 依元素是否在 Vuetify
  // 容器內判斷，這裡的純決策邏輯不需要知道 kind 是 custom 還是 plain。
  const customDateProfile = {
    fieldOrder: ['date'],
    fields: {
      date: {
        riskField: true,
        selector: [{ kind: 'custom', value: '#dateCombobox', transform: 'westernToMinguoChinese' }]
      }
    }
  };
  const customDatePlan = buildFillPlan(sourceData, customDateProfile);
  assert.equal(customDatePlan[0].items[0].targetValue, '115 年 8 月 17 日');
  assert.equal(customDatePlan[0].items[0].skipReason, undefined);

  // time 欄位只綁 1 個 item（票券 05：臺中違規時間，單一輸入框接收合併後的 4 碼字串）——
  // 要把 hour+minute 合併成 'HHmm'，不是沿用「index 0 = hour」的兩元素位置慣例
  const singleTimeProfile = {
    fieldOrder: ['time'],
    fields: { time: { riskField: false, selector: [{ kind: 'plain', value: '#time' }] } }
  };
  const singleTimePlan = buildFillPlan(sourceData, singleTimeProfile);
  assert.equal(singleTimePlan[0].items[0].targetValue, '1305');

  // hour/minute 其中之一缺值時不猜測，直接 skip
  const singleTimeMissingMinute = buildFillPlan({ ...sourceData, minute: '' }, singleTimeProfile);
  assert.equal(singleTimeMissingMinute[0].items[0].skipReason, 'no-source-value');
  const singleTimeMissingHour = buildFillPlan({ ...sourceData, hour: '' }, singleTimeProfile);
  assert.equal(singleTimeMissingHour[0].items[0].skipReason, 'no-source-value');

  // violation 欄位的候選群組控制型 select（role: 'candidate-controller'）與候選 select
  // （role: 'candidate'，票券 03）一律 skip（'candidate-group-pending'）——這兩種 item 走
  // content/fill-mode.js 的專用候選群組流程，不套用這裡的一般 select 賦值邏輯，也不能落到
  // 'no-source-value'（否則會誤以為只是單純沒有來源資料）。
  const candidateGroupProfile = {
    fieldOrder: ['violation'],
    fields: {
      violation: {
        riskField: true,
        selector: [
          { kind: 'select', value: '#chose_type', role: 'candidate-controller' },
          { kind: 'select', value: '#chosen1', role: 'candidate', controllerValue: '動態違規' },
          { kind: 'select', value: '#chosen2', role: 'candidate', controllerValue: '靜態違規' }
        ]
      }
    }
  };
  const candidateGroupPlan = buildFillPlan(sourceData, candidateGroupProfile);
  assert.deepEqual(
    candidateGroupPlan[0].items.map((i) => i.skipReason),
    ['candidate-group-pending', 'candidate-group-pending', 'candidate-group-pending']
  );

  // date/time 合併欄位（票券 04：高雄違規日期/時間單一 DOM 元素，role: 'datetime-merge'）：
  // 同一個 item 掛在 date、time 兩個欄位下，都要算出完整的合併字串，不能只填半邊。
  const mergeItem = { kind: 'plain', value: '#ContentPlaceHolder1_ViolationDate', role: 'datetime-merge' };
  const dateTimeMergeProfile = {
    fieldOrder: ['date', 'time'],
    fields: {
      date: { riskField: false, selector: [mergeItem] },
      time: { riskField: false, selector: [mergeItem] }
    }
  };
  const dateTimeMergePlan = buildFillPlan(sourceData, dateTimeMergeProfile);
  const [datePlan, timePlan] = dateTimeMergePlan;
  assert.equal(datePlan.items[0].targetValue, '2026-08-17 13:05', 'date 欄位下的合併項也要算出完整字串');
  assert.equal(timePlan.items[0].targetValue, '2026-08-17 13:05', 'time 欄位下的合併項也要算出完整字串（跟 date 欄位相同）');

  // date/hour/minute 任一缺值就不猜測，直接 skip
  const dateTimeMergeMissingHour = buildFillPlan({ ...sourceData, hour: '' }, dateTimeMergeProfile);
  assert.equal(dateTimeMergeMissingHour[0].items[0].skipReason, 'no-source-value');
  const dateTimeMergeMissingDate = buildFillPlan({ ...sourceData, date: '' }, dateTimeMergeProfile);
  assert.equal(dateTimeMergeMissingDate[0].items[0].skipReason, 'no-source-value');
}

// buildDateTimeMergeValue（票券 04）：純函式，組合出 'YYYY-MM-DD HH:mm' 格式字串
{
  assert.equal(buildDateTimeMergeValue({ date: '2026-08-01', hour: '13', minute: '45' }), '2026-08-01 13:45');

  // hour/minute 缺補零時要自行補齊，不假設呼叫端一定會補好
  assert.equal(buildDateTimeMergeValue({ date: '2026-08-01', hour: '3', minute: '5' }), '2026-08-01 03:05', '單位數的 hour/minute 要補零');
  assert.equal(buildDateTimeMergeValue({ date: '2026-08-01', hour: '0', minute: '0' }), '2026-08-01 00:00', 'hour/minute 為 0（字串 "0"）要視為有效值，補零成 00:00，不能被當成缺值');

  // date/hour/minute 任一缺值就回傳空字串，不猜測
  assert.equal(buildDateTimeMergeValue({ date: '', hour: '13', minute: '45' }), '');
  assert.equal(buildDateTimeMergeValue({ date: '2026-08-01', hour: '', minute: '45' }), '');
  assert.equal(buildDateTimeMergeValue({ date: '2026-08-01', hour: '13', minute: '' }), '');
  assert.equal(buildDateTimeMergeValue({}), '');
  assert.equal(buildDateTimeMergeValue(undefined), '');
}

console.log('extension-fill-engine-contract.test.mjs OK');
