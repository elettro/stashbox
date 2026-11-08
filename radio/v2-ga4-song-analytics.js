(() => {
  'use strict';
  if (window.StashboxRadioGA4) return;
  const ID = 'G-Z7QPLH8TY9';
  const sessions = new Map();
  const completed = new Set();
  const clean = v => String(v ?? '').trim().slice(0, 100);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  // GTM already owns pageview tracking. This direct tag supplies song events only.
  if (!document.querySelector('script[data-stashbox-ga4]')) {
    const script = document.createElement('script');
    script.async = true;
    script.dataset.stashboxGa4 = 'true';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(script);
  }
  window.gtag('js', new Date());
  window.gtag('config', ID, { send_page_view: false });
  function send(name, params) {
    window.gtag('event', name, { ...params, send_to: ID, transport_type: 'beacon' });
  }
  window.addEventListener('stashbox:qualified-play', event => {
    const d = event.detail || {};
    const key = clean(d.sessionId);
    const song = clean(d.songKey);
    if (!key || !song || sessions.has(key)) return;
    const player = d.audio?.closest?.('[data-player]');
    const info = {
      song_id: song,
      song_title: clean(d.songTitle || player?.querySelector('[data-ptitle]')?.textContent),
      song_artist: clean(d.songArtist || player?.querySelector('[data-partist]')?.textContent)
    };
    // A reused audio element must not complete a previous track.\n    for (const [priorKey, prior] of sessions) {\n      if (prior.audio === d.audio) sessions.delete(priorKey);\n    }\n    sessions.set(key, { info, audio: d.audio, src: d.audio?.currentSrc || d.audio?.src || '' });
    send('song_start', { ...info, play_threshold_seconds: 10 });
    if (sessions.size > 200) sessions.delete(sessions.keys().next().value);
  });
  document.addEventListener('ended', event => {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || !audio.closest('#v2App')) return;
    for (const [key, session] of sessions) {
      if (session.audio !== audio || completed.has(key) ||\n          session.src !== (audio.currentSrc || audio.src || '')) continue;
      // Only count natural completion for the same song source.
      completed.add(key);
      send('song_complete', {
        ...session.info,
        song_duration_seconds: Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0
      });
      sessions.delete(key);
      break;
    }
  }, true);
  window.StashboxRadioGA4 = Object.freeze({ measurementId: ID });
})();