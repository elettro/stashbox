(() => {
  const TOKEN_STORAGE_KEY = 'stashbox_radio_dev_cognito_tokens';
  const DEV_RADIO_URL = 'https://stashbox.com/radio/dev/';
  let redirecting = false;

  function clearLocalSession() {
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_) {}
  }

  function logoutAndReturnToRadio(event) {
    const button = event.target.closest?.('[data-action="logout"], [data-account-logout]');
    if (!button || redirecting) return;

    redirecting = true;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    clearLocalSession();

    try {
      const request = window.StashboxRadioAccount?.logout?.();
      request?.catch?.(() => {});
    } catch (_) {}

    window.location.replace(DEV_RADIO_URL);
  }

  document.addEventListener('click', logoutAndReturnToRadio, true);
})();
