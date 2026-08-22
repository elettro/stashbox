(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';

  function loggedIn() {
    try {
      if (window.StashboxV2Session?.hasSession) return window.StashboxV2Session.hasSession();
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken || tokens.refreshToken);
    } catch (_) {
      return false;
    }
  }

  function currentPlayer() {
    return app.querySelector('[data-player]');
  }

  function playerIsOpen(player) {
    return Boolean(
      player &&
      !player.hidden &&
      getComputedStyle(player).display !== 'none' &&
      getComputedStyle(player).visibility !== 'hidden'
    );
  }

  function ensureGate(player) {
    let gate = player.querySelector('[data-guest-vec-gate]');
    if (gate) return gate;

    gate = document.createElement('button');
    gate.type = 'button';
    gate.className = 'v2-guest-vec-gate';
    gate.dataset.guestVecGate = 'true';
    gate.dataset.v2AuthOpen = 'login';
    gate.setAttribute('aria-label', 'VEC is off. Log in or create an account to activate video visuals.');
    gate.innerHTML = `
      <span class="v2-guest-vec-gate-status"><i aria-hidden="true"></i><b>VEC OFF</b></span>
      <small>Log in to activate</small>
    `;
    player.appendChild(gate);
    return gate;
  }

  function sync() {
    const player = currentPlayer();
    if (!player) return;

    const shouldShow = playerIsOpen(player) && !loggedIn();
    const gate = shouldShow ? ensureGate(player) : player.querySelector('[data-guest-vec-gate]');
    if (!gate) return;

    gate.hidden = !shouldShow;
    gate.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
  }

  const observer = new MutationObserver(sync);
  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden', 'class']
  });

  window.addEventListener('storage', event => {
    if (!event.key || event.key === TOKEN_KEY) sync();
  });
  window.addEventListener('stashbox:v2-auth-changed', sync);
  window.addEventListener('stashbox:v2-session-changed', sync);

  window.setInterval(sync, 1000);
  sync();
})();