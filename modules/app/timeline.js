export function initializeTimeline() {
  const { dom, services, utils } = window.ViolationHelper;
  const {
    preview, curEl, durEl, rail, selectionEl, startRange, endRange, startLabel, endLabel
  } = dom;
  const { fmt, resetClipUI } = utils;

  const updateSelectionBar = () => {
    const hasDuration = isFinite(preview.duration) && preview.duration > 0;
    const rangeMax = hasDuration ? preview.duration : parseFloat(startRange.max) || 100;
    let startValue = parseFloat(startRange.value);
    let endValue = parseFloat(endRange.value);
    if (startValue > endValue) [startValue, endValue] = [endValue, startValue];

    const innerWidth = rail.getBoundingClientRect().width;
    const startPercent = Math.max(0, Math.min(1, startValue / rangeMax));
    const endPercent = Math.max(0, Math.min(1, endValue / rangeMax));
    const leftPixels = innerWidth * startPercent;
    const widthPixels = innerWidth * (endPercent - startPercent);

    selectionEl.style.left = `${leftPixels}px`;
    selectionEl.style.width = `${widthPixels}px`;
  };

  const clampAndPreview = (which) => {
    const hasDuration = isFinite(preview.duration) && preview.duration > 0;
    let startValue = parseFloat(startRange.value);
    let endValue = parseFloat(endRange.value);
    if (which === 'start' && startValue > endValue) {
      endRange.value = startValue;
      endValue = startValue;
    }
    if (which === 'end' && endValue < startValue) {
      startRange.value = endValue;
      startValue = endValue;
    }

    startLabel.textContent = `開始：${fmt(hasDuration ? startValue : 0)}`;
    endLabel.textContent = `結束：${fmt(hasDuration ? endValue : 0)}`;

    if (hasDuration) {
      if (which === 'start' && isFinite(startValue)) preview.currentTime = startValue;
      if (which === 'end' && isFinite(endValue)) preview.currentTime = endValue;
    }
    updateSelectionBar();
  };

  preview.addEventListener('loadedmetadata', () => {
    const duration = preview.duration;
    durEl.textContent = fmt(duration);
    curEl.textContent = fmt(preview.currentTime || 0);
    resetClipUI(isFinite(duration) ? duration : 0);
  });
  preview.addEventListener('timeupdate', () => {
    curEl.textContent = fmt(preview.currentTime);
  });
  startRange.addEventListener('input', () => clampAndPreview('start'));
  endRange.addEventListener('input', () => clampAndPreview('end'));
  window.addEventListener('resize', updateSelectionBar);

  services.timeline = { updateSelectionBar, clampAndPreview, resetClipUI };
}