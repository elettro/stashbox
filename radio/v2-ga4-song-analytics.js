(() => {
  'use strict';
  if (window.StashboxRadioGA4) return;
  const ID = 'G-Z7QPLH8TY9';
  const sessions = new Map();
  const clean = value => String(value ?? '').trim().slice(0, 100);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  // Preserve existing GTM pageviews while sending song events to GA4.
  if (!document.querySelector('script[data-stashbox-ga4]')) {
    const script = document.createElement('script');
    script.async = true;
    script.dataset.stashboxGa4 = 'true';
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
    document.head.appendChild(script);
  }
  window.gtag('js', new Date());
  window.gtag('config', ID, { send_page_view: false });

  function send(eventName, params) {
    window.gtag('event', eventName, { ...params, send_to: ID, transport_type: 'beacon' });
  }
  function diagnose(reason, info) {
    // Local browser diagnostic only. No AWS, PII, or extra GA event.
    console.warn('[Stashbox GA4] Song metadata incomplete:', reason, info.song_id);
    window.dispatchEvent(new CustomEvent('stashbox:ga4-metadata-missing', {
      detail: { reason, song_id: info.song_id, song_title: info.song_title }
    }));
  }
  function resolveInfo(detail) {
    const player = detail.audio?.closest?.('[data-player]');
    const songId = clean(detail.song_id || detail.songId || detail.songKey);
    const title = clean(detail.song_title || detail.songTitle);
    const artist = clean(detail.song_artist || detail.songArtist);
    // DOM is a last resort. Never use DOM artist for a different displayed title.
    const uiTitle = clean(player?.querySelector?.('[data-ptitle]')?.textContent);
    const uiArtist = clean(player?.querySelector?.('[data-partist]')?.textContent);
    const sameTrack = Boolean(title && uiTitle && title.toLowerCase() === uiTitle.toLowerCase());
    return {
      song_id: songId,
      song_title: title || uiTitle,
      song_artist: artist || (sameTrack ? uiArtist : '')
    };
  }
  window.addEventListener('stashbox:qualified-play', event => {
    const detail = event.detail || {};
    const key = clean(detail.session_id || detail.sessionId);
    if (!key || sessions.has(key)) return;
    const info = resolveInfo(detail);
    if (!info.song_id) return; // Without identity, no safe deduplication or attribution.
    if (!info.song_title || !info.song_artist) {
      diagnose(!info.song_title ? 'missing_title' : 'missing_artist', info);
    }
    // Remove unfinished sessions for a reused audio element before adding this song.
    for (const [priorKey, previous] of sessions) {
      if (previous.audio && previous.audio === detail.audio) sessions.delete(priorKey);
    }
    const audio = detail.audio || null;
    const src = audio?.currentSrc || audio?.src || '';
    sessions.set(key, { info, audio, src });
    send('song_start', { ...info, play_threshold_seconds: 10 });
    if (sessions.size > 200) sessions.delete(sessions.keys().next().value);
  });
  document.addEventListener('ended', event => {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || !audio.closest('#v2App')) return;
    for (const [key, session] of sessions) {
      if (session.audio !== audio || session.src !== (audio.currentSrc || audio.src || '')) continue;
      sessions.delete(key);
      send('song_complete', {
        ...session.info,
        song_duration_seconds: Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0
      });
      break;
    }
  }, true);
  window.StashboxRadioGA4 = Object.freeze({ measurementId: ID });
})();