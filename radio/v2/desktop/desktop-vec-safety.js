(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches || window.StashboxDesktopVecSafety) return;

  const FAILURE_WINDOW_MS = 2500;
  const FAILURE_LIMIT = 4;
  const state = {
    generation: 0,
    songKey: '',
    failures: [],
    tripped: false,
    tripCount: 0,
    lastTripAt: 0,
    lastReason: ''
  };

  const clean = value => String(value ?? '').trim();

  function player() {
    return [...document.querySelectorAll('#v2App [data-player]')].find(node => {
      if (!node?.isConnected || node.hidden) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || document.querySelector('#v2App [data-player]');
  }

  function reset(detail = {}) {
    state.generation = Number(detail.generation || state.generation || 0);
    state.songKey = clean(detail.songKey || state.songKey);
    state.failures = [];
    state.tripped = false;
    state.lastReason = '';
    const current = player();
    if (current) {
      delete current.dataset.vec2Safety;
      delete current.dataset.vec2SafetyReason;
      delete current.dataset.vec2SafetyFailures;
    }
  }

  function trip(detail = {}) {
    if (state.tripped) return;
    state.tripped = true;
    state.tripCount += 1;
    state.lastTripAt = Date.now();
    state.lastReason = 'rapid-media-failures';

    const current = player();
    if (current) {
      current.dataset.vec2Safety = 'fallback';
      current.dataset.vec2SafetyReason = state.lastReason;
      current.dataset.vec2SafetyFailures = String(state.failures.length);
    }

    // Stop only the visual engine. Audio and the base artwork remain under the
    // core player so a decoder failure can never lock the listener controls.
    try { window.StashboxDesktopVec2?.stop?.(); } catch (_) {}

    window.dispatchEvent(new CustomEvent('stashbox:desktop-vec-safety-trip', {
      detail: {
        at: state.lastTripAt,
        generation: Number(detail.generation || state.generation || 0),
        songKey: clean(detail.songKey || state.songKey),
        failures: state.failures.length,
        reason: state.lastReason
      }
    }));
  }

  function recordFailure(detail = {}) {
    if (state.tripped) return;
    const now = Date.now();
    state.failures = state.failures.filter(at => now - at <= FAILURE_WINDOW_MS);
    state.failures.push(now);
    const current = player();
    if (current) current.dataset.vec2SafetyFailures = String(state.failures.length);
    if (state.failures.length >= FAILURE_LIMIT) trip(detail);
  }

  window.addEventListener('stashbox:desktop-vec2-diagnostic', event => {
    const detail = event?.detail || {};
    const type = clean(detail.type);
    const nextSong = clean(detail.songKey);

    // A trip remains latched for the current song even though Vec2.stop()
    // increments the engine generation and emits another IDLE state event.
    // Only a real new session/song is allowed to clear the circuit breaker.
    if (type === 'session-start' || (nextSong && nextSong !== state.songKey && type !== 'state')) {
      reset(detail);
    }

    if (type === 'asset-ready') {
      state.failures = [];
      const current = player();
      if (current) current.dataset.vec2SafetyFailures = '0';
      return;
    }

    if (type === 'asset-failed') recordFailure(detail);
  });

  window.StashboxDesktopVecSafety = Object.freeze({
    reset: () => reset({}),
    state: () => ({
      generation: state.generation,
      songKey: state.songKey,
      failureWindowMs: FAILURE_WINDOW_MS,
      failureLimit: FAILURE_LIMIT,
      recentFailures: state.failures.length,
      tripped: state.tripped,
      tripCount: state.tripCount,
      lastTripAt: state.lastTripAt,
      lastReason: state.lastReason
    })
  });
})();
