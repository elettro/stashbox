(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const MOBILE = window.matchMedia('(max-width: 699px)');
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const MIN_DISTANCE = 64;
  const MIN_VELOCITY = 0.28;
  const AXIS_LOCK_DISTANCE = 12;
  const COOLDOWN_MS = 650;

  let gesture = null;
  let lastSwitchAt = 0;
  let hintTimer = 0;

  function loggedIn() {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken);
    } catch (_) {
      return false;
    }
  }

  function activePlayer() {
    const player = app.querySelector('[data-player]');
    if (!player || player.hidden || !player.classList.contains('is-logged-in-player')) return null;
    return player;
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

  function actionDetails(action) {
    if (action === 'shuffle') return { icon: '↑', label: 'Shuffle All', className: 'is-shuffle' };
    if (action === 'previous') return { icon: '←', label: 'Previous Song', className: 'is-previous' };
    return { icon: '→', label: 'Next Song', className: 'is-next' };
  }

  function showHint(player, action) {
    const hint = ensureHint(player);
    const details = actionDetails(action);
    hint.classList.remove('is-next', 'is-previous', 'is-shuffle', 'is-visible');
    hint.classList.add(details.className);
    hint.querySelector('i').textContent = details.icon;
    hint.querySelector('strong').textContent = details.label;
    requestAnimationFrame(() => hint.classList.add('is-visible'));
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove('is-visible'), 520);
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
    if (!control) return;

    lastSwitchAt = now;
    showHint(player, action);
    player.classList.remove('is-swipe-next', 'is-swipe-previous', 'is-swipe-shuffle');
    player.classList.add(`is-swipe-${action}`);
    window.setTimeout(() => player.classList.remove('is-swipe-next', 'is-swipe-previous', 'is-swipe-shuffle'), 280);

    try { navigator.vibrate?.(12); } catch (_) {}
    control.click();
  }

  function resetGesture() {
    gesture = null;
  }

  app.addEventListener('touchstart', event => {
    if (!MOBILE.matches || !loggedIn() || event.touches.length !== 1) return resetGesture();
    const player = activePlayer();
    if (!player || !player.contains(event.target) || isInteractiveTarget(event.target)) return resetGesture();

    const touch = event.touches[0];
    gesture = {
      player,
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
      const velocity = Math.abs(dx) / elapsed;
      if (Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      if (Math.abs(dx) < MIN_DISTANCE && velocity < MIN_VELOCITY) return;
      performAction(current.player, dx < 0 ? 'previous' : 'next');
      return;
    }

    const velocity = Math.abs(dy) / elapsed;
    if (Math.abs(dy) <= Math.abs(dx) * 1.15) return;
    if (Math.abs(dy) < MIN_DISTANCE && velocity < MIN_VELOCITY) return;
    if (dy < 0) performAction(current.player, 'shuffle');
  }, { passive: true });

  app.addEventListener('touchcancel', resetGesture, { passive: true });
})();
