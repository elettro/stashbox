(() => {
  'use strict';

  if (matchMedia('(min-width: 900px)').matches || window.StashboxMobileAudioStreamPreference) return;

  const API_HOST = 'je3zud66nb.execute-api.us-east-1.amazonaws.com';
  const MAP = window.STASHBOX_BROWSER_AUDIO_MAP || {};
  const reverse = new Map();
  Object.entries(MAP).forEach(([master, stream]) => {
    reverse.set(String(stream), String(master));
    try { reverse.set(new URL(String(stream), location.href).href, String(master)); } catch (_) {}
  });
  const nativeFetch = window.fetch.bind(window);

  const clean = value => String(value ?? '').trim();
  const canonical = value => {
    const raw = clean(value);
    if (!raw) return '';
    try { return new URL(raw, location.href).href; } catch (_) { return raw; }
  };

  function derivativeFor(value) {
    const raw = clean(value);
    if (!raw) return '';
    return clean(MAP[raw] || MAP[canonical(raw)] || '');
  }

  function preferredStream(song, master) {
    const rdsStream = clean(song?.audio_stream_url || song?.preferred_audio_url);
    const status = clean(song?.audio_transcode_status).toLowerCase();
    if (rdsStream && (!status || status === 'ready')) return rdsStream;
    return derivativeFor(master);
  }

  function rewriteSong(song) {
    if (!song || typeof song !== 'object') return song;

    const master = clean(
      song.audio_master_url ||
      song.browser_original_audio_url ||
      song.audio_url ||
      song.resolved_audio_url ||
      song.audioUrl
    );
    const stream = preferredStream(song, master);
    if (!stream) return song;

    reverse.set(clean(stream), master);
    reverse.set(canonical(stream), master);

    return {
      ...song,
      browser_original_audio_url: master,
      audio_master_url: clean(song.audio_master_url || master),
      audio_stream_url: clean(song.audio_stream_url || stream),
      preferred_audio_url: stream,
      audio_url: stream,
      resolved_audio_url: stream,
      audioUrl: stream,
      stream_url: stream,
      mp3_url: stream
    };
  }

  function rewritePayload(payload) {
    if (Array.isArray(payload)) return payload.map(rewriteSong);
    if (!payload || typeof payload !== 'object') return payload;
    const clone = { ...payload };
    for (const key of ['songs', 'items', 'data']) {
      if (Array.isArray(clone[key])) clone[key] = clone[key].map(rewriteSong);
    }
    return clone;
  }

  function isSongsRequest(input) {
    const raw = typeof input === 'string' ? input : input?.url || '';
    try {
      const url = new URL(raw, location.href);
      return url.hostname === API_HOST && /\/prod-v2\/radio\/songs\/?$/.test(url.pathname);
    } catch (_) {
      return false;
    }
  }

  window.fetch = async (input, init = {}) => {
    const response = await nativeFetch(input, init);
    if (!isSongsRequest(input) || !response.ok) return response;

    try {
      const text = await response.clone().text();
      const parsed = text ? JSON.parse(text) : {};
      const rewritten = rewritePayload(parsed);
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json');
      headers.set('x-stashbox-audio-source', 'mobile-mp3-preferred');
      return new Response(JSON.stringify(rewritten), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch (_) {
      return response;
    }
  };

  document.addEventListener('error', event => {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || !audio.closest('#v2App')) return;
    if (audio.dataset.mobileAudioMasterFallback === 'true') return;

    const failed = canonical(audio.currentSrc || audio.src);
    const master = clean(reverse.get(failed) || reverse.get(clean(audio.currentSrc || audio.src)) || '');
    if (!master || canonical(master) === failed) return;

    const resumeAt = Number.isFinite(audio.currentTime) ? Number(audio.currentTime || 0) : 0;
    const shouldResume = !audio.paused && !audio.ended;
    audio.dataset.mobileAudioMasterFallback = 'true';
    audio.dataset.mobileAudioFailedStream = failed;
    audio.src = master;
    try { audio.load(); } catch (_) {}

    audio.addEventListener('loadedmetadata', () => {
      try {
        if (resumeAt > 0 && Number.isFinite(audio.duration)) {
          audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 0.1));
        }
      } catch (_) {}
      if (shouldResume) audio.play().catch(() => {});
    }, { once: true });
  }, true);

  window.StashboxMobileAudioStreamPreference = Object.freeze({
    mapSize: () => Object.keys(MAP).length,
    derivativeFor,
    masterFor: value => reverse.get(canonical(value)) || reverse.get(clean(value)) || '',
    state: () => ({ mapSize: Object.keys(MAP).length, reverseMappings: reverse.size })
  });
})();
