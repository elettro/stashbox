(() => {
  'use strict';
  // GA4 song analytics. No new AWS requests or database reads.
  if (window.StashboxRadioGA4) return;
  const MEASUREMENT_ID = 'G-Z7QPLH8TY9';
  const sessions = new Map();
  const clean = value => String(value ?? '').trim().slice(0, 100);

  // Configure the GA4 destination without sending another page_view.
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', MEASUREMENT_ID, { send_page_view: false });

  function metadata() {
    const player = document.querySelector('#v2App [data-player]:not([hidden])') ||
      document.querySelector('#v2App [data-player]');
    return {
      song_title: clean(player?.querySelector('[data-ptitle]')?.textContent),
      song_artist: clean(player?.querySelector('[data-partist]')?.textContent)
    };
  }
  function send(name, parameters) {
    window.gtag('event', name, {
      ...parameters,
      send_to: MEASUREMENT_ID,
      transport_type: 'beacon'
    });
  }
  function activeAudio() {
    return document.querySelector('#v2App [data-player]:not([hidden]) audio') ||
      document.querySelector('#v2App [data-player] audio');
  }
  window.addEventListener('stashbox:qualified-play', event => {
    const detail = event.detail || {};
    const songId = clean(detail.songKey);
    const sessionId = clean(detail.sessionId);
    if (!songId || !sessionId || sessions.has(sessionId)) return;
    const info = { song_id: songId, ...metadata() };
    sessions.set(sessionId, info);
    // This matches the existing player's 10-second qualified-play definition.
    send('song_start', { ...info, play_threshold_seconds: 10 });
    if (sessions.size > 100) sessions.delete(sessions.keys().next().value);
  });
  document.addEventListener('ended', event => {
    if (!(event.target instanceof HTMLAudioElement) || !event.target.closest('#v2App')) return;
    const state = window.StashboxV2PlayTracker?.state?.();
    const info = state?.sessionId && sessions.get(state.sessionId);
    if (!info) return;
    send('song_complete', { ...info, song_duration_seconds: Math.round(event.target.duration || 0) });
    sessions.delete(state.sessionId);
  }, true);
  window.StashboxRadioGA4 = Object.freeze({ measurementId: MEASUREMENT_ID });
})();
