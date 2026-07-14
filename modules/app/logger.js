export function initializeLogger() {
  const { dom, state, utils } = window.ViolationHelper;
  const { logEl, btnCopyLog, logPanel, toggleLog } = dom;

  const log = (...messages) => {
    const timestamp = new Date().toISOString();
    const text = messages.map((message) => {
      if (typeof message === 'string') return message;
      try {
        return JSON.stringify(message);
      } catch {
        return String(message);
      }
    }).join(' ');
    if (logEl) {
      logEl.textContent += `\n[${timestamp}] ${text}`;
      logEl.scrollTop = logEl.scrollHeight;
    }
    console.log(...messages);
  };
  const errlog = (...messages) => {
    log('ERROR:', ...messages);
    console.error(...messages);
  };
  const toast = (message) => {
    const div = document.createElement('div');
    Object.assign(div.style, {
      position: 'fixed', left: '50%', bottom: '24px', transform: 'translateX(-50%)',
      background: '#1d2129', color: '#fff', padding: '8px 12px', borderRadius: '6px',
      fontSize: '14px', zIndex: '9999', border: '1px solid var(--border)'
    });
    div.textContent = message;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 1200);
  };

  Object.assign(utils, { log, errlog, toast });

  if (toggleLog && logPanel) {
    toggleLog.addEventListener('change', () => {
      logPanel.classList.toggle('show', toggleLog.checked);
      state.ui.isLogVisible = toggleLog.checked;
    });
  }
  if (btnCopyLog && logEl) {
    btnCopyLog.addEventListener('click', async () => {
      const text = logEl.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        toast('已複製到剪貼簿');
      } catch {
        const range = document.createRange();
        range.selectNodeContents(logEl);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('copy');
        selection.removeAllRanges();
        toast('已複製到剪貼簿');
      }
    });
  }
}