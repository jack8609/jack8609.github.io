export function initializeDisclaimer() {
  const { config, dom, state } = window.ViolationHelper;
  const { overlay, scrollBox, checkbox, btn } = dom;
  const storageKey = config.storageKeys.disclaimerAcceptedAt;

  const handleAccept = () => {
    if (btn.disabled) return;
    if (checkbox && checkbox.checked) {
      localStorage.setItem(storageKey, Date.now().toString());
      document.documentElement.classList.add('hide-warning-overlay');
    }
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      overlay.style.display = 'none';
      state.ui.isDisclaimerDismissed = true;
    }, 300);
  };

  if (overlay && scrollBox && btn) {
    scrollBox.addEventListener('scroll', () => {
      const isBottom = scrollBox.scrollHeight - scrollBox.scrollTop <= scrollBox.clientHeight + 10;
      if (isBottom) {
        btn.disabled = false;
        btn.innerText = '我已了解並確定';
      }
    });
    btn.addEventListener('click', handleAccept);
  }
}