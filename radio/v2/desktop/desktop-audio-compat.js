(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches || window.StashboxDesktopAudioCompat) return;

  const API_HOST = 'd21fbe6u80.execute-api.us-east-1.amazonaws.com';
  const MAP = window.STASHBOX_BROWSER_AUDIO_MAP || {};
  const reverse = new Map(Object.entries(MAP).map(([original, browser]) => [String(browser), String(original)]));
  const underlyingFetch = window.fetch.bind(window);

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

  function preferredStream(song, original) {
    const stream = clean(song?.audio_stream_url || song?.stream_url || song?.mp3_url || song?.preferred_audio_url);
    const status = clean(song?.audio_transcode_status).toLowerCase();
    if (stream && (!status || status === 'ready')) return stream;
    return derivativeFor(original);
  }

  function rewriteSong(song) {
    if (!song || typeof song !== 'object') return song;
    const original = clean(song.audio_master_url || song.audio_url || song.resolved_audio_url || song.audioUrl || song.stream_url || song.mp3_url);
    const browser = preferredStream(song, original);
    if (!browser) return song;

    reverse.set(canonical(browser), original);
    reverse.set(clean(browser), original);

    return {
      ...song,
      browser_original_audio_url: original,
      browser_audio_url: browser,
      preferred_audio_url: browser,
      audio_master_url: clean(song.audio_master_url || original),
      audio_url: browser,
      resolved_audio_url: browser,
      audioUrl: browser,
      stream_url: browser,
      mp3_url: browser
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
      return url.hostname === API_HOST && /\/dev\/radio\/songs\/?$/.test(url.pathname);
    } catch (_) { return false; }
  }

  window.fetch = async (input, init = {}) => {
    const response = await underlyingFetch(input, init);
    if (!isSongsRequest(input) || !response.ok) return response;
    try {
      const text = await response.clone().text();
      const parsed = text ? JSON.parse(text) : {};
      const rewritten = rewritePayload(parsed);
      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json');
      headers.set('x-stashbox-audio-source', 'rds-stream-preferred');
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

    const failedUrl = canonical(audio.currentSrc || audio.src);
    const browserUrl = derivativeFor(failedUrl);
    if (!browserUrl || canonical(browserUrl) === failedUrl || audio.dataset.browserAudioFallback === 'true') return;

    const resumeAt = Number.isFinite(audio.currentTime) ? Number(audio.currentTime || 0) : 0;
    const shouldResume = !audio.paused && !audio.ended;
    audio.dataset.browserAudioFallback = 'true';
    audio.dataset.browserAudioFailedUrl = failedUrl;
    audio.dataset.browserAudioOriginalUrl = failedUrl;
    audio.src = browserUrl;
    try { audio.load(); } catch (_) {}

    const resume = () => {
      try { if (resumeAt > 0 && Number.isFinite(audio.duration)) audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 0.1)); } catch (_) {}
      if (shouldResume) audio.play().catch(() => {});
    };
    audio.addEventListener('loadedmetadata', resume, { once: true });
  }, true);

  window.StashboxDesktopAudioCompat = Object.freeze({
    mapSize: () => Object.keys(MAP).length,
    derivativeFor,
    originalFor: value => reverse.get(canonical(value)) || reverse.get(clean(value)) || '',
    state: () => ({ mapSize: Object.keys(MAP).length, dynamicMappings: reverse.size })
  });
})();
