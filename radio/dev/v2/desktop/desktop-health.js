(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches || window.STASHBOX_DESKTOP_HEALTH) return;

  const health = {
    build: document.querySelector('meta[name="stashbox-v2-build"]')?.content || 'unknown',
    status: 'BOOTING',
    playerReady: false,
    audioState: 'IDLE',
    songKey: '',
    title: '',
    vecState: 'IDLE',
    vecPoolSize: 0,
    vecPlayedCount: 0,
    vecFailedCount: 0,
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

  function syncPlayer() {
    const p = player();
    const a = audio();
    health.playerReady = Boolean(p && a);
    health.title = p?.querySelector('[data-ptitle]')?.textContent?.trim() || '';
    health.songKey = p?.dataset?.songKey || p?.dataset?.vec2SongKey || health.songKey || '';
    if (health.playerReady && health.status === 'BOOTING') health.status = 'READY';
  }

  document.addEventListener('play', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    syncPlayer();
    health.status = 'PLAYING';
    health.audioState = 'PLAY_REQUESTED';
    push('audio-play', { title: health.title, songKey: health.songKey });
  }, true);

  document.addEventListener('playing', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    syncPlayer();
    health.status = 'PLAYING';
    health.audioState = 'PLAYING';
    push('audio-playing', { currentTime: event.target.currentTime });
  }, true);

  document.addEventListener('pause', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    health.audioState = event.target.ended ? 'ENDED' : 'PAUSED';
    if (!event.target.ended) health.status = 'PAUSED';
    push('audio-pause', { currentTime: event.target.currentTime });
  }, true);

  document.addEventListener('waiting', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    health.audioState = 'WAITING';
    push('audio-waiting', { currentTime: event.target.currentTime, readyState: event.target.readyState });
  }, true);

  document.addEventListener('stalled', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    health.audioState = 'STALLED';
    push('audio-stalled', { currentTime: event.target.currentTime, readyState: event.target.readyState });
  }, true);

  document.addEventListener('error', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    health.status = 'ERROR';
    health.audioState = 'ERROR';
    health.lastError = `audio:${event.target.error?.code || 'unknown'}`;
    push('audio-error', { code: event.target.error?.code || null, message: event.target.error?.message || '' });
  }, true);

  window.addEventListener('stashbox:desktop-vec2-diagnostic', event => {
    const detail = event.detail || {};
    const vec = window.StashboxDesktopVec2?.state?.() || {};
    health.vecState = vec.status || detail.status || health.vecState;
    health.songKey = vec.songKey || detail.songKey || health.songKey;
    health.vecPoolSize = Number(vec.poolSize || 0);
    health.vecPlayedCount = Number(vec.playedCount || 0);
    health.vecFailedCount = Number(vec.failedCount || 0);
    if (vec.currentAsset) health.lastVecAsset = vec.currentAsset;
    if (detail.type === 'session-error' || detail.type === 'asset-failed') {
      health.lastError = detail.error || detail.detail || detail.type;
      if (detail.type === 'session-error') health.status = 'DEGRADED';
    }
    push(`vec:${detail.type || 'update'}`, {
      vecState: health.vecState,
      pool: health.vecPoolSize,
      failed: health.vecFailedCount,
      error: detail.error || null
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
    push('dom-ready', { playerReady: health.playerReady });
  }, { once: true });

  window.STASHBOX_DESKTOP_HEALTH = Object.freeze({
    snapshot,
    refresh: () => { syncPlayer(); return snapshot(); }
  });
})();
