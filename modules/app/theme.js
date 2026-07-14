export function initializeTheme() {
  const { config, dom, state } = window.ViolationHelper;
  const html = document.documentElement;
  const { themeSwitch, themeLabel } = dom;
  if (!themeSwitch || !themeLabel) return;

  const storageKey = config.storageKeys.theme;
  const saved = localStorage.getItem(storageKey);
  const systemPrefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;

  state.ui.theme = saved || (systemPrefersLight ? 'light' : 'dark');
  applyTheme(state.ui.theme);

  themeSwitch.addEventListener('change', () => {
    state.ui.theme = themeSwitch.checked ? 'light' : 'dark';
    applyTheme(state.ui.theme, true);
  });

  function applyTheme(mode, persist = false) {
    if (mode === 'light') {
      html.setAttribute('data-theme', 'light');
      themeSwitch.checked = true;
      themeLabel.textContent = '明亮';
    } else {
      html.removeAttribute('data-theme');
      themeSwitch.checked = false;
      themeLabel.textContent = '深色';
    }
    if (persist) localStorage.setItem(storageKey, mode);
  }
}