const VIOLATION_ITEMS_FILENAME = 'violation-items.txt';
const COMMON_VIOLATION_CITY = '通用';

// 位元組層級解碼：先試 UTF-8，若亂碼比例過高（例如檔案其實是 Big5）才改用 Big5 重解，
// 兩者都失敗時回傳 UTF-8 的盡力結果，不讓整份清單因編碼問題直接掛掉。
export function decodeViolationItemsBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const replacementCount = (text.match(/\uFFFD/g) || []).length;
  if (text.length > 0 && replacementCount / text.length > 0.02) {
    try {
      text = new TextDecoder('big5', { fatal: false }).decode(bytes);
    } catch {
      // 執行環境不支援 Big5 解碼器時，維持 UTF-8 的盡力結果。
    }
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// 格式：「# 縣市名稱」開新分類，其後每行一個項目文字；空白行忽略；相容 CRLF/LF/CR 換行。
// 分類標題只有在底下真的出現至少一個項目時才會成立，讓檔案裡可安心放置純文字說明/註解。
export function parseViolationItemsText(text) {
  const result = {};
  let currentCity = null;
  const lines = String(text ?? '').split(/\r\n|\r|\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      currentCity = line.slice(1).trim() || null;
      continue;
    }
    if (!currentCity) continue;
    if (!result[currentCity]) result[currentCity] = [];
    if (!result[currentCity].includes(line)) result[currentCity].push(line);
  }
  return result;
}

// 添加策略：base（跟隨程式碼的預設清單）優先，extra（root 位置、供人工後續維護）逐項附加，
// 同一縣市底下文字完全相同的項目直接跳過，不出現重複選項。
export function mergeViolationData(base, extra) {
  const merged = {};
  for (const city of Object.keys(base || {})) merged[city] = [...base[city]];
  for (const city of Object.keys(extra || {})) {
    if (!merged[city]) merged[city] = [];
    for (const item of extra[city]) {
      if (!merged[city].includes(item)) merged[city].push(item);
    }
  }
  return merged;
}

// 「通用」分類對所有縣市都適用；選單顯示某縣市時＝通用項目＋該縣市專屬項目。
function resolveEffectiveViolationItems(violationData, city) {
  if (!city) return [];
  if (city === COMMON_VIOLATION_CITY) return violationData[COMMON_VIOLATION_CITY] || [];
  const commonItems = violationData[COMMON_VIOLATION_CITY] || [];
  const cityItems = violationData[city] || [];
  return [...commonItems, ...cityItems.filter((item) => !commonItems.includes(item))];
}

async function fetchViolationItemsText(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return '';
    return decodeViolationItemsBuffer(await response.arrayBuffer());
  } catch {
    return '';
  }
}

// 兩個位置都抓：跟隨程式碼（modules/app/）與專案 root（index.html 所在目錄），採添加策略合併。
async function loadViolationData() {
  const codeUrl = new URL(`./${VIOLATION_ITEMS_FILENAME}`, import.meta.url);
  const rootUrl = new URL(`./${VIOLATION_ITEMS_FILENAME}`, document.baseURI);
  const [codeText, rootText] = await Promise.all([
    fetchViolationItemsText(codeUrl),
    fetchViolationItemsText(rootUrl)
  ]);
  return mergeViolationData(parseViolationItemsText(codeText), parseViolationItemsText(rootText));
}

function resetViolationDropdowns(root) {
  const citySelect = root.querySelector('#city-select');
  const violationSelect = root.querySelector('#ve-violation');
  if (!citySelect || !violationSelect) return;
  citySelect.innerHTML = '<option value="">選擇縣市</option>';
  violationSelect.innerHTML = '<option value="">選擇違規項目</option>';
  violationSelect.disabled = true;
}

function appendOption(select, text) {
  const opt = document.createElement('option');
  opt.value = text;
  opt.textContent = text;
  select.appendChild(opt);
}

function populateViolationDropdowns(root, violationData, options = {}) {
  const citySelect = root.querySelector('#city-select');
  const violationSelect = root.querySelector('#ve-violation');
  if (!citySelect || !violationSelect) return;
  const cityKeys = Object.keys(violationData);
  const defaultCity = options.defaultCity || cityKeys[0] || '';

  cityKeys.forEach((city) => appendOption(citySelect, city));

  citySelect.addEventListener('change', () => {
    const items = resolveEffectiveViolationItems(violationData, citySelect.value);
    violationSelect.innerHTML = '<option value="">選擇違規項目</option>';
    if (items.length > 0) {
      items.forEach((text) => appendOption(violationSelect, text));
      violationSelect.disabled = false;
    } else {
      violationSelect.disabled = true;
    }
  });

  if (defaultCity && violationData[defaultCity]) {
    citySelect.value = defaultCity;
    citySelect.dispatchEvent(new Event('change'));
  }
}

async function initViolationDropdowns(root, options = {}) {
  resetViolationDropdowns(root);
  const violationData = await loadViolationData();
  populateViolationDropdowns(root, violationData, options);
}

export function initializeViolationEditor(root) {
  const { config, modules, services, state, utils } = window.ViolationHelper;
  const { toast } = utils;
  modules.violationEditor = { init: initializeViolationEditor };
  if (!root) return;

  const autoOcrStorageKey = config.storageKeys.autoPlateOcrEnabled;
  root.innerHTML = `
    <div class="violation-editor">
      <div class="toolbar" role="group" aria-label="違規資料輸入區">
        <div class="group">
          <label for="ve-plate1">車牌號碼：</label>
          <div class="plate-boxes">
            <input id="ve-plate1" type="text" inputmode="latin" maxlength="4" placeholder="ABCD" aria-label="車牌前段（最多 4 英數字）" />
            <span class="dash">—</span>
            <input id="ve-plate2" type="text" inputmode="latin" maxlength="4" placeholder="1234" aria-label="車牌後段（最多 4 英數字）" />
          </div>
          <label class="auto-ocr-toggle" for="ve-auto-ocr" title="⚠️ 實驗性功能：車牌自動辨識準確度有限，請務必自行核對填寫的車牌號碼是否正確。">
            <input type="checkbox" id="ve-auto-ocr" aria-label="自動辨識車牌（實驗性功能，請自行核對辨識結果）" />
            自動辨識車牌
          </label>
        </div>

        <div class="group full">
          <label for="ve-violation">違規項目：</label>
          <div class="violation-row" style="display:flex; gap:8px; align-items:center; min-width:0; flex:1 1 auto;">
            <select id="city-select" aria-label="選擇縣市"></select>
            <select id="ve-violation" aria-label="選擇違規項目"></select>
          </div>
        </div>
        <div class="group">
          <label for="ve-date">違規日期：</label>
          <input id="ve-date" type="date" />
        </div>
        <div class="group">
          <label for="ve-hour">違規時間：</label>
          <div class="time-selects" aria-label="違規時間">
            <select id="ve-hour" aria-label="小時"></select>
            <select id="ve-minute" aria-label="分鐘"></select>
          </div>
        </div>
        <div class="group full">
          <label for="ve-road">路段：</label>
          <input id="ve-road" type="text" style="min-width: 240px; flex: 1 1 auto;"
                 value="違規地址" placeholder="請在此填寫違規地址" aria-label="請在此填寫違規地址" />
        </div>
      </div>

      <div class="preview" aria-live="polite">
        <textarea id="ve-output" spellcheck="false"></textarea>
        <div class="control-row">
          <label><input type="checkbox" id="ve-pause"> 暫停自動更新</label>
          <button class="btn" id="ve-copy" type="button" aria-label="複製到剪貼簿">複製到剪貼簿</button>
        </div>
      </div>
    </div>
  `;

  const $ = (selector) => root.querySelector(selector);

  function buildTimeOptions() {
    const hourSelect = $('#ve-hour');
    const minuteSelect = $('#ve-minute');
    hourSelect.innerHTML = '';
    minuteSelect.innerHTML = '';
    for (let hour = 0; hour <= 23; hour++) {
      const option = document.createElement('option');
      option.value = String(hour).padStart(2, '0');
      option.textContent = option.value;
      hourSelect.appendChild(option);
    }
    for (let minute = 0; minute <= 59; minute++) {
      const option = document.createElement('option');
      option.value = String(minute).padStart(2, '0');
      option.textContent = option.value;
      minuteSelect.appendChild(option);
    }
  }

  function setDefaultDateTime() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    $('#ve-date').value = `${year}-${month}-${day}`;
    const roundedMinutes = Math.round(now.getMinutes() / 10) * 10;
    $('#ve-hour').value = String(now.getHours()).padStart(2, '0');
    $('#ve-minute').value = String(roundedMinutes % 60).padStart(2, '0');
  }

  function formatDateToYMD(dateString) {
    if (!dateString) return '';
    const date = new Date(`${dateString}T00:00:00`);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  }

  function buildText() {
    const plate1 = $('#ve-plate1').value || '';
    const plate2 = $('#ve-plate2').value || '';
    const plate = (plate1 || plate2) ? `${plate1}${plate1 && plate2 ? '-' : ''}${plate2}` : '（車號未填）';
    const date = formatDateToYMD($('#ve-date').value);
    const hour = $('#ve-hour').value || '00';
    const minute = $('#ve-minute').value || '00';
    const dateTime = date ? `${date} ${hour}:${minute}` : '（日期/時間未填）';
    const road = ($('#ve-road').value || '').trim() || '請在此填寫違規地址';
    const violation = $('#ve-violation').value || '（尚未選擇違規項目）';
    return `${dateTime}，車號: ${plate} 於 "${road}"，${violation}。`;
  }

  function updateOutput() {
    if ($('#ve-pause').checked) return;
    $('#ve-output').value = buildText();
  }

  function sanitizePlate(element) {
    element.addEventListener('input', () => {
      const cleaned = element.value.replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, 4);
      if (cleaned !== element.value) element.value = cleaned;
      updateOutput();
    });
    element.addEventListener('change', updateOutput);
  }

  function bindEvents() {
    ['#ve-date', '#ve-hour', '#ve-minute', '#ve-violation', '#ve-road'].forEach((selector) => {
      const element = $(selector);
      element.addEventListener('input', updateOutput);
      element.addEventListener('change', updateOutput);
    });
    $('#ve-pause').addEventListener('change', function () {
      if (!this.checked) updateOutput();
    });
    $('#ve-copy').addEventListener('click', async () => {
      const text = $('#ve-output').value;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          toast('已複製到剪貼簿');
        } else {
          const output = $('#ve-output');
          output.select();
          document.execCommand('copy');
          toast('已複製到剪貼簿');
          output.setSelectionRange(output.value.length, output.value.length);
        }
      } catch {
        alert('複製失敗，請手動選取後按 Ctrl+C。');
      }
    });
    $('#ve-auto-ocr').addEventListener('change', function () {
      try {
        localStorage.setItem(autoOcrStorageKey, this.checked ? '1' : '0');
      } catch {}
      state.ocr.isAutoEnabled = this.checked;
      if (this.checked) services.ocr.load().catch(() => {});
    });
  }

  buildTimeOptions();
  setDefaultDateTime();
  sanitizePlate($('#ve-plate1'));
  sanitizePlate($('#ve-plate2'));
  bindEvents();
  updateOutput();

  let autoOcrRestored = false;
  try {
    autoOcrRestored = localStorage.getItem(autoOcrStorageKey) === '1';
  } catch {}
  if (autoOcrRestored) {
    $('#ve-auto-ocr').checked = true;
    state.ocr.isAutoEnabled = true;
    setTimeout(() => {
      services.ocr.load().catch(() => {});
    }, 0);
  }

  return initViolationDropdowns(root).catch((error) => {
    utils.errlog('違規項目清單載入失敗', error);
  });
}