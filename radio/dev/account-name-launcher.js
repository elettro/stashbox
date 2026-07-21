(() => {
  const BUTTON_SELECTOR = '.radio-account-user-button';

  function enhanceAccountButton() {
    document.querySelectorAll(BUTTON_SELECTOR).forEach(button => {
      button.dataset.accountDirectLauncher = 'true';
      button.setAttribute('aria-label', 'Open My Account');
      button.setAttribute('title', 'Open My Account');
      button.removeAttribute('aria-expanded');
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
    subtree: true
  });
})();
