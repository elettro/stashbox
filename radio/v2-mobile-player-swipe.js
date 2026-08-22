(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const MOBILE = window.matchMedia('(max-width: 699px)');
  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const MIN_DISTANCE = 64;
  const MIN_VELOCITY = 0.28;
  const AXIS_LOCK_DISTANCE = 12;
  const COOLDOWN_MS = 650;
  const VIEW_MODES = ['full', 'title', 'cinema'];

  let gesture = null;
  let lastSwitchAt = 0;
  let lastModeChangeAt = 0;
  let hintTimer = 0;
  let cinemaPeekTimer = 0;
  let observedPlayer = null;
  let playerObserver = null;

  function loggedIn() {
    try {
      if (window.StashboxV2Session?.hasSession) return window.StashboxV2Session.hasSession();
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken || tokens.refreshToken);
    } catch (_) {
      return false;
    }
  }

  function activePlayer() {
    const player = app.querySelector('[data-player]');
    if (!player || player.hidden) return null;
    return player;
  }

  function allowsSongNavigation(player) {
    return Boolean(player && loggedIn() && player.querySelector('[data-prev]') && player.querySelector('[data-next]'));
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest([
      'button',
      'a',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '[contenteditable="true"]',
      '.v2-li-sheet',
      '.v2-li-merch-tray',
      '[data-mobile-vec-commerce]',
      '[data-mobile-vec-commerce-tray]'
    ].join(',')));
  }

  function ensureHint(player) {
    let hint = player.querySelector('[data-player-swipe-hint]');
    if (hint) return hint;
    hint = document.createElement('div');
    hint.className = 'v2-player-swipe-hint';
    hint.dataset.playerSwipeHint = 'true';
    hint.setAttribute('aria-live', 'polite');
    hint.innerHTML = '<i aria-hidden="true"></i><strong></strong>';
    player.appendChild(hint);
    return hint;
  }

  function removeDesktopModeHints(player) {
    if (!player || MOBILE.matches) return false;
    player.querySelectorAll('[data-interface-restore-hint], .v2-interface-restore-hint').forEach(node => node.remove());
    return true;
  }

  function ensureModeHint(player) {
    if (removeDesktopModeHints(player)) return null;
    let hint = player.querySelector('[data-interface-restore-hint]');
    if (hint) return hint;
    hint = document.createElement('div');
    hint.className = 'v2-interface-restore-hint';
    hint.dataset.interfaceRestoreHint = 'true';
    hint.setAttribute('aria-hidden', 'true');
    hint.innerHTML = '<i aria-hidden="true">↓</i><strong></strong>';
    player.appendChild(hint);
    return hint;
  }

  function currentMode(player) {
    if (player?.classList.contains('is-video-cinema-mode')) return 'cinema';
    if (player?.classList.contains('is-video-title-mode') || player?.classList.contains('is-video-focus-mode')) return 'title';
    return 'full';
  }

  function nextMode(mode) {
    const index = VIEW_MODES.indexOf(mode);
    return VIEW_MODES[(index + 1 + VIEW_MODES.length) % VIEW_MODES.length];
  }

  function syncModeHint(player) {
    const hint = ensureModeHint(player);
    if (!hint) return;
    const mode = currentMode(player);
    const visible = mode === 'cinema';
    hint.querySelector('strong').textContent = visible ? 'Flick down for Full Interface' : '';
    hint.classList.toggle('is-visible', visible);
    hint.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  function actionDetails(action) {
    if (action === 'shuffle') return { icon: '↑', label: 'Shuffle All', className: 'is-shuffle' };
    if (action === 'previous') return { icon: '←', label: 'Previous Song', className: 'is-previous' };
    if (action === 'mode-title') return { icon: '↓', label: 'Title Mode', className: 'is-title' };
    if (action === 'mode-cinema') return { icon: '↓', label: 'Cinema Mode', className: 'is-cinema' };
    if (action === 'mode-full') return { icon: '↓', label: 'Full Interface', className: 'is-focus-off' };
    return { icon: '→', label: 'Next Song', className: 'is-next' };
  }

  function showHint(player, action) {
    if (!MOBILE.matches) return;
    const hint = ensureHint(player);
    const details = actionDetails(action);
    hint.classList.remove('is-next', 'is-previous', 'is-shuffle', 'is-focus-on', 'is-title', 'is-cinema', 'is-focus-off', 'is-visible');
    hint.classList.add(details.className);
    hint.querySelector('i').textContent = details.icon;
    hint.querySelector('strong').textContent = details.label;
    requestAnimationFrame(() => hint.classList.add('is-visible'));
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove('is-visible'), 760);
  }

  function shuffleFallback() {
    const cards = [...app.querySelectorAll('[data-song]')].filter(card => !card.hidden);
    if (!cards.length) return false;
    const currentTitle = String(activePlayer()?.querySelector('[data-ptitle]')?.textContent || '').trim().toLowerCase();
    const choices = cards.filter(card => String(card.querySelector('h3')?.textContent || '').trim().toLowerCase() !== currentTitle);
    const pool = choices.length ? choices : cards;
    pool[Math.floor(Math.random() * pool.length)]?.click();
    return true;
  }

  function performAction(player, action) {
    const now = Date.now();
    if (now - lastSwitchAt < COOLDOWN_MS) return;

    const selector = action === 'shuffle'
      ? '[data-li-shuffle]'
      : action === 'previous'
        ? '[data-prev]'
        : '[data-next]';
    const control = player.querySelector(selector);
    if (!control && action !== 'shuffle') return;
    if (!control && !shuffleFallback()) return;

    lastSwitchAt = now;
    showHint(player, action);
    player.classList.remove('is-swipe-next', 'is-swipe-previous', 'is-swipe-shuffle');
    player.classList.add(`is-swipe-${action}`);
    window.setTimeout(() => player.classList.remove('is-swipe-next', 'is-swipe-previous', 'is-swipe-shuffle'), 280);

    try { navigator.vibrate?.(12); } catch (_) {}
    control?.click();
  }

  function clearCinemaPeek(player) {
    clearTimeout(cinemaPeekTimer);
    player?.classList.remove('is-cinema-controls-peek');
  }

  function applyPlayerMode(player, mode, { announce = true, source = 'flick-down' } = {}) {
    if (!player) return;
    clearCinemaPeek(player);
    player.classList.remove('is-video-focus-mode', 'is-video-title-mode', 'is-video-cinema-mode');
    if (mode === 'title') player.classList.add('is-video-title-mode');
    if (mode === 'cinema') player.classList.add('is-video-cinema-mode');
    player.dataset.playerViewMode = mode;
    lastModeChangeAt = Date.now();
    syncModeHint(player);
    if (announce) showHint(player, `mode-${mode}`);
    try {
      if (mode === 'cinema') navigator.vibrate?.([9, 18, 9, 18, 9]);
      else if (mode === 'title') navigator.vibrate?.([9, 16, 9]);
      else navigator.vibrate?.(14);
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('stashbox:video-focus-change', {
      detail: { active: mode !== 'full', mode, source }
    }));
    window.dispatchEvent(new CustomEvent('stashbox:player-view-mode-change', {
      detail: { mode, source }
    }));
  }

  function cyclePlayerMode(player) {
    if (Date.now() - lastModeChangeAt < 320) return;
    applyPlayerMode(player, nextMode(currentMode(player)));
  }

  function revealCinemaControls(player) {
    if (!player?.classList.contains('is-video-cinema-mode')) return;
    player.classList.add('is-cinema-controls-peek');
    clearTimeout(cinemaPeekTimer);
    cinemaPeekTimer = window.setTimeout(() => {
      player.classList.remove('is-cinema-controls-peek');
    }, 2400);
  }

  function resetGesture() {
    gesture = null;
  }

  function observePlayer(player) {
    if (!player || player === observedPlayer) {
      removeDesktopModeHints(player);
      return;
    }
    playerObserver?.disconnect();
    observedPlayer = player;
    playerObserver = new MutationObserver(() => {
      if (player.hidden) applyPlayerMode(player, 'full', { announce: false, source: 'player-close' });
      syncModeHint(player);
    });
    playerObserver.observe(player, { attributes: true, attributeFilter: ['hidden'] });
    syncModeHint(player);
  }

  app.addEventListener('touchstart', event => {
    if (!MOBILE.matches || event.touches.length !== 1) return resetGesture();
    const player = activePlayer();
    observePlayer(player);
    if (!player || !player.contains(event.target) || isInteractiveTarget(event.target)) return resetGesture();

    const touch = event.touches[0];
    gesture = {
      player,
      allowNavigation: allowsSongNavigation(player),
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      startedAt: performance.now(),
      axis: ''
    };
  }, { passive: true });

  app.addEventListener('touchmove', event => {
    if (!gesture || event.touches.length !== 1) return;
    const touch = event.touches[0];
    gesture.lastX = touch.clientX;
    gesture.lastY = touch.clientY;

    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!gesture.axis && Math.max(absX, absY) >= AXIS_LOCK_DISTANCE) {
      gesture.axis = absY > absX * 1.15 ? 'vertical' : 'horizontal';
    }

    if (gesture.axis) event.preventDefault();
  }, { passive: false });

  app.addEventListener('touchend', event => {
    if (!gesture) return;
    const current = gesture;
    resetGesture();
    if (!current.axis || activePlayer() !== current.player) return;

    const touch = event.changedTouches?.[0];
    const endY = touch ? touch.clientY : current.lastY;
    const endX = touch ? touch.clientX : current.lastX;
    const dy = endY - current.startY;
    const dx = endX - current.startX;
    const elapsed = Math.max(1, performance.now() - current.startedAt);

    if (current.axis === 'horizontal') {
      if (!current.allowNavigation) return;
      const velocity = Math.abs(dx) / elapsed;
      if (Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      if (Math.abs(dx) < MIN_DISTANCE && velocity < MIN_VELOCITY) return;
      performAction(current.player, dx < 0 ? 'next' : 'previous');
      return;
    }

    const velocity = Math.abs(dy) / elapsed;
    if (Math.abs(dy) <= Math.abs(dx) * 1.15) return;
    if (Math.abs(dy) < MIN_DISTANCE && velocity < MIN_VELOCITY) return;

    if (dy > 0) {
      cyclePlayerMode(current.player);
      return;
    }

    if (current.allowNavigation) performAction(current.player, 'shuffle');
  }, { passive: true });

  app.addEventListener('touchcancel', resetGesture, { passive: true });

  app.addEventListener('click', event => {
    const player = activePlayer();
    if (!player || !player.classList.contains('is-video-cinema-mode')) return;
    if (!player.contains(event.target) || isInteractiveTarget(event.target)) return;
    if (Date.now() - lastModeChangeAt < 500) return;
    revealCinemaControls(player);
  });

  window.addEventListener('blur', resetGesture);
  window.addEventListener('pagehide', resetGesture);
  window.addEventListener('stashbox:v2-session-changed', () => observePlayer(activePlayer()));
  MOBILE.addEventListener?.('change', () => observePlayer(app.querySelector('[data-player]')));

  const installTimer = window.setInterval(() => {
    const player = app.querySelector('[data-player]');
    if (!player) return;
    observePlayer(player);
    window.clearInterval(installTimer);
  }, 50);
})();