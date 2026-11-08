(() => {
  'use strict';
  if (window.StashboxRadioGA4) return;
  const ID = 'G-Z7QPLH8TY9';
  const RESOLVE_WAIT_MS = 3000;
  const sessions = new Map();
  const seen = new Set();
  const clean = value => String(value ?? '').trim().slice(0, 100);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  // Keep GTM's existing pageviews; direct GA4 tag sends song events only.
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
  function diagnose(reason, info) {
    console.warn('[Stashbox GA4] Unresolved song metadata:', reason, info.song_id);
    window.dispatchEvent(new CustomEvent('stashbox:ga4-metadata-missing', {
      detail: { reason, song_id: info.song_id, song_title: info.song_title }
    }));
  }
  function resolveInfo(detail) {
    const songId = clean(detail.song_id || detail.songId || detail.songKey);
    const canonical = window.StashboxV2PlayTracker?.getSongMetadata?.(songId);
    // Only a matching canonical ID is authoritative. Do not use current UI
    // metadata: the interface might already be displaying the next track.
    const verified = canonical && clean(canonical.song_id) === songId ? canonical : null;
    return {
      song_id: songId,
      song_title: clean(verified?.song_title || detail.song_title || detail.songTitle),
      song_artist: clean(verified?.song_artist || detail.song_artist || detail.songArtist)
    };
  }
  function flush(key, final = false) {
    const session = sessions.get(key);
    if (!session || session.sent) return;
    const info = resolveInfo(session.detail);
    if ((!info.song_title || !info.song_artist) && !final) return;
    if (!info.song_title || !info.song_artist) {
      diagnose(!info.song_title ? 'missing_title' : 'missing_artist', info);
    }
    session.sent = true;
    session.info = info;
    clearTimeout(session.timer);
    send('song_start', { ...info, play_threshold_seconds: 10 });
    if (session.completed) complete(key);
  }
  function complete(key) {
    const session = sessions.get(key);
    if (!session || !session.sent || !session.completed) return;
    send('song_complete', {
      ...session.info,
      song_duration_seconds: session.duration
    });
    sessions.delete(key);
  }
  window.addEventListener('stashbox:catalog-ready', () => {
    for (const key of sessions.keys()) flush(key);
  });
  window.addEventListener('stashbox:qualified-play', event => {
    const detail = event.detail || {};
    const key = clean(detail.session_id || detail.sessionId);
    const songId = clean(detail.song_id || detail.songId || detail.songKey);
    if (!key || !songId || seen.has(key)) return;
    const audio = detail.audio || null;
    // A reused audio element belongs to the new track. Preserve earlier
    // qualified starts but never count an earlier song as completed.
    for (const [priorKey, prior] of sessions) {
      if (audio && prior.audio === audio) {
        prior.completed = false;
        flush(priorKey, true);
        sessions.delete(priorKey);
      }
    }
    seen.add(key);
    const session = {
      detail: { ...detail, song_id: songId },
      audio, src: audio?.currentSrc || audio?.src || '',
      sent: false, completed: false, duration: 0, timer: null, info: null
    };
    sessions.set(key, session);
    // Resolve immediately when possible. Otherwise wait for the catalog
    // already being loaded by the player. Never issue another network call.
    flush(key);
    if (!session.sent) session.timer = setTimeout(() => flush(key, true), RESOLVE_WAIT_MS);
    if (sessions.size > 200) {
      const oldest = sessions.keys().next().value;
      flush(oldest, true);
      clearTimeout(sessions.get(oldest)?.timer);
      sessions.delete(oldest);
    }
    if (seen.size > 1000) seen.delete(seen.values().next().value);
  });
  document.addEventListener('ended', event => {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || !audio.closest('#v2App')) return;
    for (const [key, session] of sessions) {
      if (session.audio !== audio ||
          session.src !== (audio.currentSrc || audio.src || '')) continue;
      session.completed = true;
      session.duration = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
      // For a pending start, preserve ordering: start first, completion second.
      if (session.sent) complete(key);
      else flush(key);
      break;
    }
  }, true);
  window.StashboxRadioGA4 = Object.freeze({ measurementId: ID });
})();