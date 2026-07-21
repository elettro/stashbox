(() => {
  if (window.__stashboxAccountConfigReadyGuard) return;
  window.__stashboxAccountConfigReadyGuard = true;

  const AUTH_CONFIG_PATH = '/radio/auth/config';
  const originalFetch = window.fetch.bind(window);
  const pendingAuthViews = [];
  let readyPoll = null;

  const sleep = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    return String(input?.url || '');
  }

  async function fetchAuthConfigWithRetry(input, init = {}) {
    let lastResponse = null;
    let lastError = null;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        const response = await originalFetch(input, { ...init, cache: 'no-store' });
        lastResponse = response;
        if (response.ok) return response;
      } catch (error) {
        lastError = error;
      }

      if (attempt < 3) await sleep(180 * (attempt + 1));
    }

    if (lastResponse) return lastResponse;
    throw lastError || new Error('Unable to load the account configuration.');
  }

  window.fetch = (input, init) => {
    const url = requestUrl(input);
    if (url.includes(AUTH_CONFIG_PATH)) return fetchAuthConfigWithRetry(input, init);
    return originalFetch(input, init);
  };

  function releasePendingViews() {
    if (!window.StashboxRadioAccount?.open || !pendingAuthViews.length) return false;
    const view = pendingAuthViews.pop() || 'login';
    pendingAuthViews.length = 0;
    window.StashboxRadioAccount.open(view);
    return true;
  }

  function startReadyPoll() {
    if (readyPoll) return;
    let attempts = 0;
    readyPoll = window.setInterval(() => {
      attempts += 1;
      if (releasePendingViews() || attempts > 160) {
        window.clearInterval(readyPoll);
        readyPoll = null;
      }
    }, 50);
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-account-open]');
    if (!button || window.StashboxRadioAccount?.open) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    pendingAuthViews.push(button.dataset.accountOpen || 'login');
    button.setAttribute('aria-busy', 'true');
    window.setTimeout(() => button.removeAttribute('aria-busy'), 1200);
    startReadyPoll();
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    @media (max-width: 900px), (hover: none), (pointer: coarse) {
      .radio-account-overlay {
        overflow-y: auto !important;
        overscroll-behavior: contain;
      }

      .radio-account-modal {
        max-height: calc(100dvh - 12px) !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch;
      }

      .radio-account-content input {
        font-size: 16px !important;
      }
    }
  `;
  document.head.appendChild(style);
})();
