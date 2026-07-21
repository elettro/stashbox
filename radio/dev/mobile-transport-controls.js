(() => {
  if (window.__stashboxMobileTransportControlsLoaded) return;
  window.__stashboxMobileTransportControlsLoaded = true;

  const mobileQuery = window.matchMedia('(max-width: 900px), (hover: none), (pointer: coarse)');
  const mobileUserAgent = /android|iphone|ipad|ipod|mobile|blackberry|iemobile|opera mini/i.test(navigator.userAgent || '');
  if (!mobileQuery.matches && !mobileUserAgent) return;

  const STYLE_ID = 'stashbox-mobile-transport-controls-style';
  const TAP_MOVE_TOLERANCE = 14;
  const COMPAT_CLICK_SUPPRESSION_MS = 850;
  const suppressedUntil = new WeakMap();
  let activePointer = null;
  let replayingClick = false;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 900px), (hover: none), (pointer: coarse) {
        .player-bar,
        .player-controls,
        .player-controls-layout,
        .player-mobile-main-controls {
          position: relative !important;
          z-index: 80 !important;
          pointer-events: auto !important;
        }

        .player-mobile-main-controls .transport-pill {
          position: relative !important;
          z-index: 82 !important;
          min-width: 50px !important;
          width: 50px !important;
          min-height: 50px !important;
          height: 50px !important;
          padding: 0 !important;
          pointer-events: auto !important;
          touch-action: manipulation !important;
          -webkit-tap-highlight-color: rgba(240, 165, 0, 0.26) !important;
          user-select: none !important;
          -webkit-user-select: none !important;
        }

        .player-mobile-main-controls .play-toggle {
          min-width: 58px !important;
          width: 58px !important;
          min-height: 58px !important;
          height: 58px !important;
        }

        .player-mobile-main-controls .transport-pill.is-mobile-pressed {
          transform: scale(0.93) !important;
          opacity: 0.86 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function transportButtonFrom(target) {
    return target?.closest?.('.player-mobile-main-controls .transport-pill') || null;
  }

  function currentAudio() {
    return document.querySelector('.player .native-audio');
  }

  function replayReactClick(button) {
    replayingClick = true;
    try {
      button.click();
    } finally {
      replayingClick = false;
    }
  }

  function stabilizeAudioAfterPlayTap(wantsToPlay) {
    const repair = () => {
      const audio = currentAudio();
      if (!audio) return;
      if (wantsToPlay) {
        if (!audio.paused && !audio.ended) return;
        const promise = audio.play?.();
        promise?.catch?.(error => console.warn('[radio-dev] mobile play fallback failed', error?.message || error));
        return;
      }
      if (!audio.paused) audio.pause?.();
    };

    window.setTimeout(repair, 90);
    if (wantsToPlay) window.setTimeout(repair, 280);
  }

  function activateTransport(button) {
    if (!button || button.disabled) return;

    const isPlayToggle = button.classList.contains('play-toggle');
    const wantsToPlay = isPlayToggle
      ? !(button.getAttribute('aria-pressed') === 'true' || /pause/i.test(button.getAttribute('aria-label') || ''))
      : false;

    replayReactClick(button);

    if (isPlayToggle) stabilizeAudioAfterPlayTap(wantsToPlay);
  }

  function clearPressedState() {
    activePointer?.button?.classList.remove('is-mobile-pressed');
    activePointer = null;
  }

  function handlePointerDown(event) {
    const button = transportButtonFrom(event.target);
    if (!button || button.disabled || event.button > 0) return;

    activePointer = {
      id: event.pointerId,
      button,
      startX: event.clientX,
      startY: event.clientY,
      moved: false
    };
    button.classList.add('is-mobile-pressed');
  }

  function handlePointerMove(event) {
    if (!activePointer || activePointer.id !== event.pointerId) return;
    const dx = Math.abs(event.clientX - activePointer.startX);
    const dy = Math.abs(event.clientY - activePointer.startY);
    if (dx > TAP_MOVE_TOLERANCE || dy > TAP_MOVE_TOLERANCE) {
      activePointer.moved = true;
      activePointer.button.classList.remove('is-mobile-pressed');
    }
  }

  function handlePointerUp(event) {
    if (!activePointer || activePointer.id !== event.pointerId) return;

    const { button, moved } = activePointer;
    button.classList.remove('is-mobile-pressed');
    activePointer = null;

    if (moved || !button.isConnected || button.disabled) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    suppressedUntil.set(button, performance.now() + COMPAT_CLICK_SUPPRESSION_MS);
    activateTransport(button);
  }

  function handlePointerCancel() {
    clearPressedState();
  }

  function suppressCompatibilityClick(event) {
    if (replayingClick) return;
    const button = transportButtonFrom(event.target);
    if (!button) return;
    const until = suppressedUntil.get(button) || 0;
    if (performance.now() >= until) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  injectStyles();

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('pointermove', handlePointerMove, true);
  document.addEventListener('pointerup', handlePointerUp, true);
  document.addEventListener('pointercancel', handlePointerCancel, true);
  document.addEventListener('click', suppressCompatibilityClick, true);
})();
