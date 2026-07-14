export function initializeOcrIntegration() {
  const { config, services, state, utils } = window.ViolationHelper;
  const { toast } = utils;

  function fmtBytes(bytes) {
    if (!bytes && bytes !== 0) return '未知大小';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getOcrProgressPanel() {
    let panel = document.getElementById('plate-ocr-progress-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'plate-ocr-progress-panel';
      panel.innerHTML = `
        <div class="label"></div>
        <progress max="100" value="0"></progress>
        <div class="detail"></div>
      `;
      document.body.appendChild(panel);
    }
    return panel;
  }

  function updateOcrProgressPanel(labelText, loaded, total) {
    const panel = getOcrProgressPanel();
    panel.querySelector('.label').textContent = labelText;
    const progressEl = panel.querySelector('progress');
    const detailEl = panel.querySelector('.detail');
    if (total > 0) {
      progressEl.removeAttribute('indeterminate');
      progressEl.value = Math.min(100, Math.round((loaded / total) * 100));
      detailEl.textContent = `${fmtBytes(loaded)} / ${fmtBytes(total)}`;
    } else {
      progressEl.removeAttribute('value');
      detailEl.textContent = `已下載 ${fmtBytes(loaded)}（檔案大小未知）`;
    }
  }

  function removeOcrProgressPanel() {
    const panel = document.getElementById('plate-ocr-progress-panel');
    if (panel) panel.remove();
  }

  async function fetchScriptWithProgress(url, label) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`下載失敗：${url}（HTTP ${response.status}）`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !response.body.getReader) {
      updateOcrProgressPanel(label, 0, 0);
      return response.blob();
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      updateOcrProgressPanel(label, received, total);
    }
    return new Blob(chunks, { type: 'application/javascript' });
  }

  function execScriptBlob(blob) {
    return new Promise((resolve, reject) => {
      const blobUrl = URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.src = blobUrl;
      script.onload = () => {
        URL.revokeObjectURL(blobUrl);
        resolve();
      };
      script.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error(`腳本執行失敗：${blobUrl}`));
      };
      document.head.appendChild(script);
    });
  }

  function loadPlateOcrLibs() {
    if (typeof PlateOCR !== 'undefined') return Promise.resolve();
    if (state.ocr.libsPromise) return state.ocr.libsPromise;
    state.ocr.libsPromise = (async () => {
      try {
        for (let index = 0; index < config.ocrScripts.length; index++) {
          const { url, label } = config.ocrScripts[index];
          const stageLabel = `正在載入車牌辨識引擎 (${index + 1}/${config.ocrScripts.length})：${label}`;
          updateOcrProgressPanel(stageLabel, 0, 0);
          const blob = await fetchScriptWithProgress(url, stageLabel);
          await execScriptBlob(blob);
        }
        removeOcrProgressPanel();
        toast('車牌辨識引擎已就緒');
      } catch (error) {
        removeOcrProgressPanel();
        console.error('PlateOCR 引擎載入失敗：', error);
        toast('車牌辨識引擎載入失敗，請檢查網路連線');
        state.ocr.libsPromise = null;
        throw error;
      }
    })();
    return state.ocr.libsPromise;
  }

  async function triggerAutoPlateOCR(canvas) {
    if (state.ocr.isBusy) {
      toast('上一次車牌辨識尚未完成，請稍候');
      return;
    }
    state.ocr.isBusy = true;
    try {
      toast('辨識車牌中...');
      await loadPlateOcrLibs();
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error('canvas.toBlob 失敗')), 'image/png');
      });
      const result = await PlateOCR.runPipeline(blob);
      const plate1 = document.getElementById('ve-plate1');
      const plate2 = document.getElementById('ve-plate2');
      let filled = false;
      if (result.left && plate1) {
        plate1.value = result.left.slice(0, 4);
        plate1.dispatchEvent(new Event('input', { bubbles: true }));
        filled = true;
      }
      if (result.right && plate2) {
        plate2.value = result.right.slice(0, 4);
        plate2.dispatchEvent(new Event('input', { bubbles: true }));
        filled = true;
      }
      toast(filled ? `車牌辨識完成：${result.left || ''}-${result.right || ''}（請核對）` : '車牌辨識結果空白，請手動輸入');
    } catch (error) {
      console.error('車牌自動辨識失敗：', error);
      toast('車牌辨識失敗，請手動輸入');
    } finally {
      state.ocr.isBusy = false;
    }
  }

  services.ocr = { load: loadPlateOcrLibs, recognize: triggerAutoPlateOCR };
}