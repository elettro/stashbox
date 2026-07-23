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

  function showHint(player, direction) {
    const hint = ensureHint(player);
    const next = direction === 'next';
    hint.classList.remove('is-next', 'is-previous', 'is-visible');
    hint.classList.add(next ? 'is-next' : 'is-previous');
    hint.querySelector('i').textContent = next ? '↑' : '↓';
    hint.querySelector('strong').textContent = next ? 'Next song' : 'Previous song';
    requestAnimationFrame(() => hint.classList.add('is-visible'));
    clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => hint.classList.remove('is-visible'), 520);
  }

  function switchSong(player, direction) {
    const now = Date.now();
    if (now - lastSwitchAt < COOLDOWN_MS) return;
    lastSwitchAt = now;

    const selector = direction === 'next' ? '[data-next]' : '[data-prev]';
    const control = player.querySelector(selector);
    if (!control) return;

    showHint(player, direction);
    player.classList.remove('is-swipe-next', 'is-swipe-previous');
    player.classList.add(direction === 'next' ? 'is-swipe-next' : 'is-swipe-previous');
    window.setTimeout(() => player.classList.remove('is-swipe-next', 'is-swipe-previous'), 280);

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
      axis: '',
      cancelled: false
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
      if (gesture.axis !== 'vertical') gesture.cancelled = true;
    }

    if (gesture.axis === 'vertical' && !gesture.cancelled) event.preventDefault();
  }, { passive: false });

  app.addEventListener('touchend', event => {
    if (!gesture) return;
    const current = gesture;
    resetGesture();
    if (current.cancelled || current.axis !== 'vertical' || activePlayer() !== current.player) return;

    const touch = event.changedTouches?.[0];
    const endY = touch ? touch.clientY : current.lastY;
    const endX = touch ? touch.clientX : current.lastX;
    const dy = endY - current.startY;
    const dx = endX - current.startX;
    const elapsed = Math.max(1, performance.now() - current.startedAt);
    const velocity = Math.abs(dy) / elapsed;

    if (Math.abs(dy) <= Math.abs(dx) * 1.15) return;
    if (Math.abs(dy) < MIN_DISTANCE && velocity < MIN_VELOCITY) return;

    switchSong(current.player, dy < 0 ? 'next' : 'previous');
  }, { passive: true });

  app.addEventListener('touchcancel', resetGesture, { passive: true });
})();
