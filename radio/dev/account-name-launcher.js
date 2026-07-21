(() => {
  const BUTTON_SELECTOR = '.radio-account-user-button';
  const mobileQuery = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  const isMobile = () => mobileQuery.matches || mobileUserAgent;

  function initialsFor(value) {
    const words = String(value || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'ME';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0] || ''}${words[words.length - 1][0] || ''}`.toUpperCase();
  }

  function fullNameFor(button) {
    const accountName = String(window.StashboxRadioAccount?.getAccount?.()?.display_name || '').trim();
    if (accountName) return accountName;

    const savedName = String(button.dataset.accountFullName || '').trim();
    if (savedName && savedName.length > 2) return savedName;

    const visibleText = String(button.textContent || '').trim();
    if (visibleText && visibleText.length > 2) return visibleText;

    return 'Listener';
  }

  function enhanceAccountButton() {
    document.querySelectorAll(BUTTON_SELECTOR).forEach(button => {
      const fullName = fullNameFor(button);
      const initials = initialsFor(fullName);

      button.dataset.accountDirectLauncher = 'true';
      button.dataset.accountFullName = fullName;
      button.dataset.accountInitials = initials;
      button.setAttribute('aria-label', `Open My Account for ${fullName}`);
      button.setAttribute('title', `My Account: ${fullName}`);
      button.removeAttribute('aria-expanded');

      if (!isMobile()) return;

      if (button.textContent !== initials) button.textContent = initials;
      button.style.setProperty('width', '52px', 'important');
      button.style.setProperty('min-width', '52px', 'important');
      button.style.setProperty('max-width', '52px', 'important');
      button.style.setProperty('height', '52px', 'important');
      button.style.setProperty('min-height', '52px', 'important');
      button.style.setProperty('padding', '0', 'important');
      button.style.setProperty('font-size', '14px', 'important');
      button.style.setProperty('font-weight', '950', 'important');
      button.style.setProperty('line-height', '1', 'important');
      button.style.setProperty('letter-spacing', '.055em', 'important');
      button.style.setProperty('text-align', 'center', 'important');
      button.style.setProperty('text-indent', '0', 'important');
      button.style.setProperty('overflow', 'hidden', 'important');
      button.style.setProperty('white-space', 'nowrap', 'important');
      button.style.setProperty('color', '#fff', 'important');
    });
  }

  function handleAccountButtonClick(event) {
    const button = event.target.closest?.(BUTTON_SELECTOR);
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    window.StashboxRadioAccount?.open?.('account');
  }

  document.addEventListener('click', handleAccountButtonClick, true);
  enhanceAccountButton();

  new MutationObserver(enhanceAccountButton).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  window.setInterval(enhanceAccountButton, 100);
  mobileQuery.addEventListener?.('change', enhanceAccountButton);
})();
