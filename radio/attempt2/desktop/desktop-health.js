(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches || window.STASHBOX_DESKTOP_HEALTH) return;

  const health = {
    build: document.querySelector('meta[name="stashbox-v2-build"]')?.content || 'unknown',
    status: 'BOOTING',
    playerReady: false,
    audioState: 'IDLE',
    audioSourceMode: 'UNKNOWN',
    audioCompatMapSize: 0,
    songKey: '',
    title: '',
    vecState: 'IDLE',
    vecPoolSize: 0,
    vecPlayedCount: 0,
    vecFailedCount: 0,
    vecSafetyTripped: false,
    vecSafetyTripCount: 0,
    lastVecAsset: null,
    lastError: null,
    events: []
  };

  const push = (type, detail = {}) => {
    const entry = { at: new Date().toISOString(), type, ...detail };
    health.events.push(entry);
    if (health.events.length > 80) health.events.shift();
    window.dispatchEvent(new CustomEvent('stashbox:desktop-healthchange', { detail: snapshot() }));
  };

  const snapshot = () => ({ ...health, events: [...health.events] });

  function player() {
    return document.querySelector('#v2App [data-player]');
  }

  function audio() {
    return player()?.querySelector('[data-audio], audio') || null;
  }

  function syncAudioSource(a = audio()) {
    const source = String(a?.currentSrc || a?.src || '');
    health.audioCompatMapSize = Number(window.StashboxDesktopAudioCompat?.mapSize?.() || 0);
    if (!source) health.audioSourceMode = 'NONE';
    else if (a?.dataset?.browserAudioFallback === 'true') health.audioSourceMode = 'MASTER_FALLBACK';
    else if (/\.browser\.mp3(?:$|[?#])/i.test(source)) health.audioSourceMode = 'BROWSER_DERIVATIVE';
    else if (/\.wav(?:$|[?#])/i.test(source)) health.audioSourceMode = 'WAV_MASTER';
    else health.audioSourceMode = 'DIRECT';
  }

  function syncSafety() {
    const safety = window.StashboxDesktopVecSafety?.state?.() || null;
    health.vecSafetyTripped = Boolean(safety?.tripped);
    health.vecSafetyTripCount = Number(safety?.tripCount || 0);
  }

  function syncPlayer() {
    const p = player();
    const a = audio();
    health.playerReady = Boolean(p && a);
    health.title = p?.querySelector('[data-ptitle]')?.textContent?.trim() || '';
    health.songKey = p?.dataset?.songKey || p?.dataset?.vec2SongKey || health.songKey || '';
    syncAudioSource(a);
    syncSafety();
    if (health.playerReady && health.status === 'BOOTING') health.status = 'READY';
  }

  function ensureDesktopPlayStatUiLoader() {
    if (window.StashboxDesktopPlayStatUi || document.querySelector('script[data-desktop-play-stat-ui-loader]')) return;
    const script = document.createElement('script');
    script.src = '/radio/attempt2/desktop/desktop-play-stat-ui.js?v=20260819-playstats3';
    script.defer = true;
    script.dataset.desktopPlayStatUiLoader = 'true';
    document.head.appendChild(script);
  }

  document.addEventListener('play', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    syncPlayer();
    ensureDesktopPlayStatUiLoader();
    health.status = 'PLAYING';
    health.audioState = 'PLAY_REQUESTED';
    push('audio-play', { title: health.title, songKey: health.songKey, sourceMode: health.audioSourceMode });
  }, true);

  document.addEventListener('playing', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    syncPlayer();
    ensureDesktopPlayStatUiLoader();
    health.status = 'PLAYING';
    health.audioState = 'PLAYING';
    if (!event.target.error) health.lastError = null;
    push('audio-playing', { currentTime: event.target.currentTime, sourceMode: health.audioSourceMode });
  }, true);

  document.addEventListener('pause', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    syncAudioSource(event.target);
    health.audioState = event.target.ended ? 'ENDED' : 'PAUSED';
    if (!event.target.ended) health.status = 'PAUSED';
    push('audio-pause', { currentTime: event.target.currentTime, sourceMode: health.audioSourceMode });
  }, true);

  document.addEventListener('waiting', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    syncAudioSource(event.target);
    health.audioState = 'WAITING';
    push('audio-waiting', { currentTime: event.target.currentTime, readyState: event.target.readyState, sourceMode: health.audioSourceMode });
  }, true);

  document.addEventListener('stalled', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    syncAudioSource(event.target);
    health.audioState = 'STALLED';
    push('audio-stalled', { currentTime: event.target.currentTime, readyState: event.target.readyState, sourceMode: health.audioSourceMode });
  }, true);

  document.addEventListener('error', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    syncAudioSource(event.target);
    health.status = event.target.dataset.browserAudioFallback === 'true' ? 'DEGRADED' : 'ERROR';
    health.audioState = 'ERROR';
    health.lastError = `audio:${event.target.error?.code || 'unknown'}`;
    push('audio-error', {
      code: event.target.error?.code || null,
      message: event.target.error?.message || '',
      sourceMode: health.audioSourceMode
    });
  }, true);

  window.addEventListener('stashbox:desktop-vec2-diagnostic', event => {
    const detail = event.detail || {};
    const vec = window.StashboxDesktopVec2?.state?.() || {};
    health.vecState = vec.status || detail.status || health.vecState;
    health.songKey = vec.songKey || detail.songKey || health.songKey;
    health.vecPoolSize = Number(vec.poolSize || 0);
    health.vecPlayedCount = Number(vec.playedCount || 0);
    health.vecFailedCount = Number(vec.failedCount || 0);
    syncSafety();
    if (vec.currentAsset) health.lastVecAsset = vec.currentAsset;
    if (detail.type === 'session-error' || detail.type === 'asset-failed') {
      health.lastError = detail.error || detail.detail || detail.type;
      if (detail.type === 'session-error') health.status = 'DEGRADED';
    }
    push(`vec:${detail.type || 'update'}`, {
      vecState: health.vecState,
      pool: health.vecPoolSize,
      failed: health.vecFailedCount,
      safetyTripped: health.vecSafetyTripped,
      error: detail.error || null
    });
  });

  window.addEventListener('stashbox:desktop-vec-safety-trip', event => {
    syncSafety();
    health.status = health.audioState === 'PLAYING' ? 'DEGRADED' : health.status;
    health.vecState = 'FALLBACK';
    health.lastError = `vec-safety:${event.detail?.reason || 'rapid-media-failures'}`;
    push('vec-safety-trip', {
      reason: event.detail?.reason || 'rapid-media-failures',
      failures: Number(event.detail?.failures || 0),
      songKey: event.detail?.songKey || health.songKey
    });
  });

  window.addEventListener('error', event => {
    health.lastError = event.message || 'javascript-error';
    health.status = 'ERROR';
    push('javascript-error', { message: health.lastError });
  });

  window.addEventListener('unhandledrejection', event => {
    const message = event.reason?.message || String(event.reason || 'unhandled-rejection');
    health.lastError = message;
    health.status = 'ERROR';
    push('promise-error', { message });
  });

  document.addEventListener('DOMContentLoaded', () => {
    syncPlayer();
    ensureDesktopPlayStatUiLoader();
    push('dom-ready', { playerReady: health.playerReady, audioCompatMapSize: health.audioCompatMapSize });
  }, { once: true });

  ensureDesktopPlayStatUiLoader();

  window.STASHBOX_DESKTOP_HEALTH = Object.freeze({
    snapshot,
    refresh: () => { syncPlayer(); return snapshot(); }
  });
})();
