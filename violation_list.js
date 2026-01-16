const COMMON_VIOLATIONS = [
  "闖紅燈、紅燈右轉",
  "不依規定使用燈光",
  "機車駕駛人或附載座人未依規定戴安全帽",
  "迫近、驟然變換車道、迫使他車讓道(逼車)",
  "危險駕駛或蛇行",
  "二車以上競駛競技",
  "載運人客、貨物不穩妥，行駛時顯有危險",
  "併排停車"
];

var VIOLATION_DATA = {
  "通用項目": COMMON_VIOLATIONS,
  "台北市": [
    ...COMMON_VIOLATIONS,
    "汽車於人行道、行人穿越道臨時停車(但機車及騎樓不在此限)",
    "違規臨時停車-不依順行方向",
    "汽車於人行道、行人穿越道停車(但機車及騎樓不在此限)",
    "違規停車-佔用身心障礙專用停車位",
    "汽車裝載所載貨物滲漏、飛散、脫落、掉落或氣味惡臭",
    "汽車行駛道路車輛機件、設備、附著物不穩妥或脫落",
    "駕駛人以手持方式使用行動電話、電腦或其他相類功能裝置 (僅適用汽車違規)",
    "於車道驟然減速、煞停或暫停",
    "行近未設行車管制號誌之行人穿越道不減速慢行",
    "車輛行經行人穿越道或其他依法可供行人穿越之交岔路口，不停讓行人",
    "車輛行經行人穿越道或其他依法可供行人穿越之交岔路口，不停讓視覺功能障礙者"
  ],
  "新北市": [
    ...COMMON_VIOLATIONS,
    "手持行動電話",
    "汽車所載貨物滲漏、飛散、脫落、掉落",
    "(快速公路)未保持安全距離",
    "(快速公路)未依規定使用車道",
    "(快速公路)未依規定變換車道",
    "(快速公路)違規超車、迴車、倒車、逆向行駛",
    "(快速公路)未依規定使用路肩",
    "(快速公路)裝載貨物未覆蓋捆紮",
    "(快速公路)未依標誌標線號誌行車",
    "(快速公路)行駛禁行路段",
    "(快速公路)連續按喇叭、變換燈光或其他方式迫使前車讓道",
    "(快速公路)向車外丟棄物品",
    "人員、車輛、動力機械違規進入快速公路",
    "任意驟然減速、剎車或暫停",
    "車輛不暫停讓行人",
    "車輛不暫停讓視覺功能障礙者",
    "不按遵行之方向行駛(單行道)",
    "不依規定駛入來車道",
    "多車道未依規定駕車",
    "駕車行駛人行道",
    "機車不依規定車道行駛(如行駛禁行機車道)",
    "佔用自行車專用道",
    "聞警備車、消防車、救護車未依規定避讓",
    "違規超車",
    "不依標誌標線號誌指示轉彎或變換車道",
    "多車道轉彎未依規定",
    "設有快慢車道分隔島未依規定轉彎",
    "直行車佔用轉彎專用車道",
    "違規迴車",
    "行經大眾捷運系統共用號誌路口闖紅燈、右轉",
    "違規行駛鐵路平交道",
    "不遵守道路交通標誌、標線、號誌之指示",
    "於身心障礙專用停車位違規停車",
    "車輛機件、設備、附著物不穩妥或脫落",
    "(高、快速公路)不依規定使用燈光",
    "行近未設行車管制號誌之行人穿越道，不減速慢行",
    "起駛前不讓行進中之車輛、行人優先通行",
    "聞消防車、救護車、警備車、工程救險車、毒性化學物質災害事故應變車之警號，在後跟隨急駛，或駛過在救火時放置於路上之消防水帶",
    "不注意來、往行人，或轉彎前未減速慢行",
    "不依順行方向臨時停車",
    "人行道、行人穿越道違規臨時停車",
    "人行道、行人穿越道違規停車"
  ]
};

// 自動化填入邏輯

window.initViolationDropdowns = function initViolationDropdowns(options = {}) {
  const citySelect = document.getElementById('city-select');
  const violationSelect = document.getElementById('ve-violation');
  if (!citySelect || !violationSelect) return;
  const cityKeys = Object.keys(VIOLATION_DATA)
  const defaultCity = options.defaultCity || cityKeys[0] || '';

  // 1) 初始化「縣市」下拉
  citySelect.innerHTML = '<option value="">選擇縣市</option>';
  Object.keys(VIOLATION_DATA).forEach(city => {
    const opt = document.createElement('option');
    opt.value = city;
    opt.textContent = city;
    citySelect.appendChild(opt);
  });

  // 2) 初始化「違規項目」下拉（預設禁用，待選縣市後啟用）
  violationSelect.innerHTML = '<option value="">選擇違規項目</option>';
  violationSelect.disabled = true;

  // 3) 監聽縣市變動
  citySelect.addEventListener('change', () => {
    const items = VIOLATION_DATA[citySelect.value] || [];
    violationSelect.innerHTML = '<option value="">選擇違規項目</option>';
    if (items.length > 0) {
      items.forEach(text => {
        const opt = document.createElement('option');
        opt.value = text;
        opt.textContent = text;
        violationSelect.appendChild(opt);
      });
      violationSelect.disabled = false;
    } else {
      violationSelect.disabled = true;
    }
  });

  // 4) 設定預設值
  if (defaultCity && VIOLATION_DATA[defaultCity]) {
    citySelect.value = defaultCity;
    citySelect.dispatchEvent(new Event('change'));
  }
};
