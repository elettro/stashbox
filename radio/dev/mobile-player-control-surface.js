(() => {
  if (window.__stashboxMobilePlayerControlSurfaceLoaded) return;
  window.__stashboxMobilePlayerControlSurfaceLoaded = true;

  const mobileQuery = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  const STYLE_ID = 'stashbox-mobile-player-control-surface-style';
  const CONTROL_SELECTOR = [
    '.artist-follow-button',
    '.player-mobile-main-controls .like-button',
    '.player-mobile-main-controls .transport-pill',
    '.player-mobile-main-controls .share-pill'
  ].join(',');
  const MOVE_TOLERANCE = 15;
  const CLICK_SUPPRESSION_MS = 900;
  const suppressedUntil = new WeakMap();
  let activeGesture = null;
  let replayingClick = false;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 900px), (hover: none), (pointer: coarse) {
        body:not(:has(.radio-account-overlay:not([hidden]))):not(:has(.sbr-notification-drawer:not([hidden]))) .player,
        body:not(:has(.radio-account-overlay:not([hidden]))):not(:has(.sbr-notification-drawer:not([hidden]))) .player-bar,
        body:not(:has(.radio-account-overlay:not([hidden]))):not(:has(.sbr-notification-drawer:not([hidden]))) .player-controls,
        body:not(:has(.radio-account-overlay:not([hidden]))):not(:has(.sbr-notification-drawer:not([hidden]))) .player-controls-layout,
        body:not(:has(.radio-account-overlay:not([hidden]))):not(:has(.sbr-notification-drawer:not([hidden]))) .player-info,
        body:not(:has(.radio-account-overlay:not([hidden]))):not(:has(.sbr-notification-drawer:not([hidden]))) .player-mobile-main-controls {
          position: relative !important;
          pointer-events: auto !important;
        }

        body:not(:has(.radio-account-overlay:not([hidden]))):not(:has(.sbr-notification-drawer:not([hidden]))) .player-bar {
          z-index: 10001 !important;
          isolation: isolate !important;
        }

        .artist-follow-control,
        .artist-follow-button,
        .player-mobile-main-controls,
        .player-mobile-main-controls .like-button,
        .player-mobile-main-controls .transport-pill,
        .player-mobile-main-controls .share-pill {
          pointer-events: auto !important;
          touch-action: manipulation !important;
          -webkit-tap-highlight-color: rgba(240,165,0,.28) !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }

        .artist-follow-button,
        .player-mobile-main-controls .like-button,
        .player-mobile-main-controls .transport-pill,
        .player-mobile-main-controls .share-pill {
          position: relative !important;
          z-index: 10002 !important;
          min-height: 48px !important;
        }

        .artist-follow-button {
          min-width: 92px !important;
          padding: 0 18px !important;
        }

        .player-mobile-main-controls .like-button,
        .player-mobile-main-controls .share-pill {
          min-width: 74px !important;
          padding-left: 12px !important;
          padding-right: 12px !important;
        }

        .player-mobile-main-controls .transport-pill {
          width: 52px !important;
          min-width: 52px !important;
          height: 52px !important;
          min-height: 52px !important;
          padding: 0 !important;
        }

        .player-mobile-main-controls .play-toggle {
          width: 62px !important;
          min-width: 62px !important;
          height: 62px !important;
          min-height: 62px !important;
        }

        .player-mobile-main-controls .is-control-pressed,
        .artist-follow-button.is-control-pressed {
          transform: scale(.94) !important;
          opacity: .84 !important;
        }

        .player-bar::before,
        .player-bar::after,
        .player-controls::before,
        .player-controls::after,
        .player-controls-layout::before,
        .player-controls-layout::after,
        .player-mobile-main-controls::before,
        .player-mobile-main-controls::after {
          pointer-events: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function controls() {
    return [...document.querySelectorAll(CONTROL_SELECTOR)].filter(control => {
      if (!(control instanceof HTMLElement)) return false;
      if (control.hidden || control.disabled) return false;
      const style = getComputedStyle(control);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
    });
  }

  function controlAtPoint(x, y) {
    const direct = document.elementFromPoint(x, y)?.closest?.(CONTROL_SELECTOR);
    if (direct && !direct.disabled) return direct;

    return controls().find(control => {
      const rect = control.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    }) || null;
  }

  function currentAudio() {
    return document.querySelector('.player .native-audio');
  }

  function replayClick(control) {
    replayingClick = true;
    try {
      control.click();
    } finally {
      replayingClick = false;
    }
  }

  function stabilizePlayPause(control, wantsPlay) {
    const applyExpectedState = () => {
      const audio = currentAudio();
      if (!audio) return;

      if (wantsPlay) {
        if (!audio.paused && !audio.ended) return;
        const promise = audio.play?.();
        promise?.catch?.(error => console.warn('[radio-dev] mobile play recovery failed', error?.message || error));
        return;
      }

      if (!audio.paused) audio.pause?.();
    };

    window.setTimeout(applyExpectedState, 80);
    window.setTimeout(applyExpectedState, 240);
  }

  function activateControl(control) {
    if (!control || control.disabled) return;

    const isPlayToggle = control.classList.contains('play-toggle');
    const wantsPlay = isPlayToggle
      ? !(control.getAttribute('aria-pressed') === 'true' || /pause/i.test(control.getAttribute('aria-label') || ''))
      : false;

    replayClick(control);

    if (isPlayToggle) stabilizePlayPause(control, wantsPlay);
  }

  function startGesture(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const control = controlAtPoint(event.clientX, event.clientY);
    if (!control) return;

    activeGesture = {
      pointerId: event.pointerId,
      control,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    control.classList.add('is-control-pressed');
  }

  function moveGesture(event) {
    if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;
    const dx = Math.abs(event.clientX - activeGesture.startX);
    const dy = Math.abs(event.clientY - activeGesture.startY);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
      activeGesture.moved = true;
      activeGesture.control.classList.remove('is-control-pressed');
    }
  }

  function endGesture(event, cancelled = false) {
    if (!activeGesture || event.pointerId !== activeGesture.pointerId) return;

    const gesture = activeGesture;
    activeGesture = null;
    gesture.control.classList.remove('is-control-pressed');

    if (cancelled || gesture.moved || !gesture.control.isConnected || gesture.control.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    suppressedUntil.set(gesture.control, performance.now() + CLICK_SUPPRESSION_MS);
    activateControl(gesture.control);
  }

  function suppressCompatibilityClick(event) {
    if (replayingClick) return;
    const control = event.target?.closest?.(CONTROL_SELECTOR);
    if (!control) return;
    const until = suppressedUntil.get(control) || 0;
    if (performance.now() >= until) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function clearGesture() {
    activeGesture?.control?.classList.remove('is-control-pressed');
    activeGesture = null;
  }

  injectStyles();

  document.addEventListener('pointerdown', startGesture, true);
  document.addEventListener('pointermove', moveGesture, true);
  document.addEventListener('pointerup', event => endGesture(event, false), true);
  document.addEventListener('pointercancel', event => endGesture(event, true), true);
  document.addEventListener('click', suppressCompatibilityClick, true);
  window.addEventListener('blur', clearGesture);
})();
