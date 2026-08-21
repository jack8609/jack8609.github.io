export function registerUtils() {
  const { dom, services, utils } = window.ViolationHelper;
  const {
    btnClip, btnDownloadFull, btnThumbnail, startRange, endRange, startLabel, endLabel
  } = dom;

  const fmt = (seconds) => {
    if (!isFinite(seconds)) return '00:00:00.00';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${remainingSeconds.toFixed(2).padStart(5, '0')}`;
  };
  const revokeURL = (url) => {
    try {
      if (url) URL.revokeObjectURL(url);
    } catch {}
  };
  const setActionsEnabled = (enabled) => {
    btnClip.disabled = !enabled;
    btnDownloadFull.disabled = !enabled;
    btnThumbnail.disabled = !enabled;
  };
  const resetClipUI = (duration = 0) => {
    if (duration > 0) {
      startRange.min = 0;
      endRange.min = 0;
      startRange.max = duration;
      endRange.max = duration;
      startRange.value = 0;
      endRange.value = duration;
    } else {
      startRange.min = 0;
      endRange.min = 0;
      startRange.max = 100;
      endRange.max = 100;
      startRange.value = 0;
      endRange.value = 100;
    }
    startLabel.textContent = `${fmt(0)}`;
    endLabel.textContent = `${fmt(duration || 0)}`;
    services.timeline.updateSelectionBar();
    requestAnimationFrame(() => {
      services.timeline.updateSelectionBar();
    });
  };
  const triggerDownloadFromBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const inferInputName = (name) => {
    const lower = (name || '').toLowerCase();
    if (lower.endsWith('.mp4')) return 'input.mp4';
    if (lower.endsWith('.ts')) return 'input.ts';
    if (lower.endsWith('.mov')) return 'input.mov';
    if (lower.endsWith('.mkv')) return 'input.mkv';
    if (lower.endsWith('.mp3')) return 'input.mp3';
    return 'input.mp4';
  };
  const fileToUint8Array = async (fileOrBlob) => new Uint8Array(await fileOrBlob.arrayBuffer());

  const getPlateFromInputs = () => {
    const plate1 = (document.getElementById('ve-plate1')?.value || '').trim();
    const plate2 = (document.getElementById('ve-plate2')?.value || '').trim();
    if (plate1 && plate2) return `${plate1}-${plate2}`;
    return plate1 || plate2 || '';
  };

  // 移除檔名非法字元（使用者上傳檔名可能含 / \ : * ? " < > |）
  const sanitizeFilenameComponent = (name) => (name || '').replace(/[\\/:*?"<>|]/g, '_');

  const getBaseNameWithoutExt = (filename) => sanitizeFilenameComponent((filename || '').replace(/\.[^./\\]+$/, ''));

  const toLocalTimestamp = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  };

  Object.assign(utils, {
    fmt,
    revokeURL,
    setActionsEnabled,
    resetClipUI,
    triggerDownloadFromBlob,
    inferInputName,
    fileToUint8Array,
    getPlateFromInputs,
    getBaseNameWithoutExt,
    toLocalTimestamp
  });
}