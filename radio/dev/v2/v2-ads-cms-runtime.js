(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (window.StashboxV2Ads) return;

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const ADS_URLS = [`${API_ROOT}/radio/ads`, `${API_ROOT}/ads`];
  const SETTINGS_URLS = [`${API_ROOT}/radio/ad-settings`, `${API_ROOT}/ad-settings`];
  const TRACK_URL = `${API_ROOT}/radio/track`;
  const SESSION_KEY = 'stashbox-radio-rds-dev-session-id';
  const WEIGHTS = Object.freeze({ low: 1, medium: 3, high: 6 });
  const FALLBACK_DURATION = 15;
  const REFRESH_MIN_MS = 60000;
  const SAFE_SETTINGS = Object.freeze({
    ads_enabled: false,
    break_method: 'count',
    ads_per_break: 1,
    target_ad_seconds: 30,
    break_interval: 1
  });

  const state = {
    settings: { ...SAFE_SETTINGS },
    ads: [],
    ready: false,
    loading: null,
    lastRefreshAt: 0,
    completedSongs: 0,
    playCounts: Object.create(null),
    durationMemory: Object.create(null),
    pendingBreak: null,
    pendingTimer: 0,
    active: false,
    queue: [],
    resumeAudio: null,
    currentAd: null,
    media: null,
    overlay: null,
    startedAt: 0,
    watchedSeconds: 0,
    breakTotal: 0,
    breakIndex: 0
  };

  const clean = value => String(value ?? '').trim().replace(/^"|"$/g, '');
  const bool = value => value === true || value === 1 || ['true', '1', 'yes', 'on'].includes(clean(value).toLowerCase());
  const fixUrl = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  function parseBody(data) {
    if (typeof data?.body === 'string') {
      try { return parseBody(JSON.parse(data.body)); } catch (_) { return data; }
    }
    return data;
  }

  function rowsFrom(data) {
    const parsed = parseBody(data);
    if (Array.isArray(parsed)) return parsed;
    for (const key of ['ads', 'items', 'data']) {
      if (Array.isArray(parsed?.[key])) return parsed[key];
    }
    return [];
  }

  function normalizeSettings(data) {
    const parsed = parseBody(data);
    const source = parsed?.settings && typeof parsed.settings === 'object' ? parsed.settings : parsed;
    if (!source || typeof source !== 'object' || !Object.prototype.hasOwnProperty.call(source, 'ads_enabled')) {
      return { ...SAFE_SETTINGS };
    }
    const adsPerBreak = [1, 2, 3, 4, 5].includes(Number(source.ads_per_break)) ? Number(source.ads_per_break) : 1;
    const targetSeconds = [15, 30, 45, 60, 90].includes(Number(source.target_ad_seconds)) ? Number(source.target_ad_seconds) : 30;
    const interval = [1, 2, 3].includes(Number(source.break_interval)) ? Number(source.break_interval) : 1;
    return {
      ads_enabled: bool(source.ads_enabled),
      break_method: source.break_method === 'seconds' ? 'seconds' : 'count',
      ads_per_break: adsPerBreak,
      target_ad_seconds: targetSeconds,
      break_interval: interval
    };
  }

  function normalizeAd(row) {
    if (!row || typeof row !== 'object') return null;
    const title = clean(row.internal_title || row.title || row.ad_title || row.name || 'Stashbox Radio Ad');
    const mediaUrl = fixUrl(row.mediaUrl || row.media_url || row.video_url || row.videoUrl || row.ad_url || row.adUrl || row.file_url || row.fileUrl || row.s3_url || row.s3Url);
    const clickUrl = clean(row.clickUrl || row.click_url || row.cta_url || row.ctaUrl || row.url);
    const id = clean(row.id || row.ad_id || row.adId || title.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    const active = (bool(row.active) || clean(row.status).toLowerCase() === 'active' || bool(row.is_active)) && !bool(row.hidden);
    return {
      ...row,
      id,
      title,
      description: clean(row.internal_description || row.description || row.ad_description || row.notes),
      mediaUrl,
      clickUrl,
      ctaLabel: clean(row.cta_label || row.ctaLabel || (clickUrl ? 'Learn More' : '')),
      posterUrl: fixUrl(row.thumbnail_url || row.thumbnailUrl || row.poster_image_url || row.posterImageUrl),
      frequency: WEIGHTS[clean(row.frequency).toLowerCase()] ? clean(row.frequency).toLowerCase() : 'medium',
      durationSeconds: Math.max(0, Number(row.durationSeconds ?? row.duration_seconds ?? row.duration ?? 0) || 0),
      active,
      skipEnabled: row.no_skipping !== undefined ? !bool(row.no_skipping) : (row.skip_enabled === undefined ? true : bool(row.skip_enabled)),
      skipAfterSeconds: Math.max(0, Number(row.skip_after_seconds ?? row.skipAfterSeconds ?? 0) || 0),
      maxPlaysPerSession: Math.max(1, Number(row.max_plays_per_session ?? row.maxPlaysPerSession ?? 99) || 99),
      startDate: clean(row.start_date || row.startDate),
      endDate: clean(row.end_date || row.endDate)
    };
  }

  function dateEligible(ad, now = new Date()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ad.startDate) {
      const start = new Date(`${ad.startDate}T00:00:00`).getTime();
      if (Number.isFinite(start) && today < start) return false;
    }
    if (ad.endDate) {
      const end = new Date(`${ad.endDate}T23:59:59`).getTime();
      if (Number.isFinite(end) && now.getTime() > end) return false;
    }
    return true;
  }

  function isAudioUrl(url) {
    return /\.(mp3|m4a|aac|wav|ogg)(\?|#|$)/i.test(clean(url));
  }

  async function fetchJson(url, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
      if (!response.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${response.status}`);
      return data;
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function firstSuccessful(urls, normalizer) {
    let lastError = null;
    for (const url of urls) {
      try { return normalizer(await fetchJson(url)); }
      catch (error) { lastError = error; }
    }
    throw lastError || new Error('No endpoint succeeded.');
  }

  async function refresh(force = false) {
    if (state.loading) return state.loading;
    if (!force && state.ready && Date.now() - state.lastRefreshAt < REFRESH_MIN_MS) return snapshot();
    state.loading = Promise.all([
      firstSuccessful(SETTINGS_URLS, normalizeSettings),
      firstSuccessful(ADS_URLS, data => rowsFrom(data).map(normalizeAd).filter(Boolean))
    ])
      .then(([settings, ads]) => {
        state.settings = settings;
        state.ads = ads.filter(ad => ad.active && ad.mediaUrl && dateEligible(ad));
        state.ready = true;
        state.lastRefreshAt = Date.now();
        document.documentElement.dataset.v2AdsEnabled = settings.ads_enabled && state.ads.length ? 'true' : 'false';
        return snapshot();
      })
      .catch(error => {
        // Fail closed: any CMS/API failure means no ad insertion.
        state.settings = { ...SAFE_SETTINGS };
        state.ads = [];
        state.ready = true;
        state.lastRefreshAt = Date.now();
        document.documentElement.dataset.v2AdsEnabled = 'false';
        console.warn('[V2 Ads] CMS unavailable; ads disabled for this listener session', error?.message || error);
        return snapshot();
      })
      .finally(() => { state.loading = null; });
    return state.loading;
  }

  function sessionId() {
    try {
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
      const value = crypto.randomUUID?.() || `v2-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, value);
      return value;
    } catch (_) {
      return `v2-${Date.now()}`;
    }
  }

  function track(ad, eventType) {
    if (!ad?.id || !eventType) return;
    fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        ad_id: ad.id,
        ad_title: ad.title || '',
        event_type: eventType,
        session_id: sessionId(),
        page: 'dev-v2',
        source: 'public_player_v2'
      })
    }).catch(() => {});
  }

  function eligibleAds() {
    if (!state.ready || !state.settings.ads_enabled) return [];
    return state.ads.filter(ad => (
      ad.active &&
      ad.mediaUrl &&
      dateEligible(ad) &&
      (state.playCounts[ad.id] || 0) < ad.maxPlaysPerSession
    ));
  }

  function weightedPick(ads, used = new Set()) {
    const unique = ads.filter(ad => !used.has(ad.id));
    const candidates = unique.length ? unique : ads;
    const weighted = candidates.flatMap(ad => Array(WEIGHTS[ad.frequency] || WEIGHTS.medium).fill(ad));
    return weighted.length ? weighted[Math.floor(Math.random() * weighted.length)] : null;
  }

  function estimatedDuration(ad) {
    return Number(state.durationMemory[ad.id] || ad.durationSeconds || FALLBACK_DURATION) || FALLBACK_DURATION;
  }

  function buildQueue() {
    const ads = eligibleAds();
    if (!ads.length) return [];
    const queue = [];
    const used = new Set();
    if (state.settings.break_method === 'seconds') {
      let seconds = 0;
      while (seconds < state.settings.target_ad_seconds && queue.length < 20) {
        const ad = weightedPick(ads, used);
        if (!ad) break;
        queue.push(ad);
        used.add(ad.id);
        seconds += estimatedDuration(ad);
        if (used.size >= ads.length) used.clear();
      }
      return queue;
    }
    while (queue.length < state.settings.ads_per_break) {
      const ad = weightedPick(ads, used);
      if (!ad) break;
      queue.push(ad);
      used.add(ad.id);
      if (used.size >= ads.length) used.clear();
    }
    return queue;
  }

  function ensureOverlay() {
    if (state.overlay?.isConnected) return state.overlay;
    const overlay = document.createElement('section');
    overlay.className = 'v2-ad-break-overlay';
    overlay.hidden = true;
    overlay.setAttribute('aria-label', 'Sponsored message');
    overlay.innerHTML = `
      <div class="v2-ad-break-shell">
        <div class="v2-ad-break-top"><span>Sponsored</span><strong data-v2-ad-position></strong></div>
        <div class="v2-ad-break-media" data-v2-ad-media></div>
        <div class="v2-ad-break-copy">
          <div><strong data-v2-ad-title></strong><p data-v2-ad-description></p></div>
          <a data-v2-ad-cta target="_blank" rel="noopener" hidden>Learn More</a>
        </div>
        <div class="v2-ad-break-bottom">
          <span data-v2-ad-time>0:00</span>
          <button type="button" data-v2-ad-skip hidden>Skip Ad</button>
        </div>
      </div>`;
    overlay.addEventListener('click', event => {
      const skip = event.target.closest('[data-v2-ad-skip]');
      if (skip && !skip.disabled) finishCurrent('ad_skip');
      const cta = event.target.closest('[data-v2-ad-cta]');
      if (cta && state.currentAd) track(state.currentAd, 'ad_click');
    });
    document.body.appendChild(overlay);
    state.overlay = overlay;
    return overlay;
  }

  function stopMedia() {
    if (!state.media) return;
    try { state.media.pause(); } catch (_) {}
    try { state.media.removeAttribute('src'); state.media.load(); } catch (_) {}
    state.media = null;
  }

  function showAd(ad, index, total) {
    const overlay = ensureOverlay();
    stopMedia();
    state.currentAd = ad;
    state.startedAt = Date.now();
    state.watchedSeconds = 0;
    state.playCounts[ad.id] = (state.playCounts[ad.id] || 0) + 1;

    overlay.querySelector('[data-v2-ad-position]').textContent = total > 1 ? `Ad ${index} of ${total}` : '';
    overlay.querySelector('[data-v2-ad-title]').textContent = ad.title || 'Sponsored message';
    const description = overlay.querySelector('[data-v2-ad-description]');
    description.textContent = ad.description || '';
    description.hidden = !ad.description;
    const cta = overlay.querySelector('[data-v2-ad-cta]');
    cta.hidden = !ad.clickUrl;
    cta.href = ad.clickUrl || '#';
    cta.textContent = ad.ctaLabel || 'Learn More';

    const mediaWrap = overlay.querySelector('[data-v2-ad-media]');
    mediaWrap.innerHTML = '';
    const media = document.createElement(isAudioUrl(ad.mediaUrl) ? 'audio' : 'video');
    media.className = 'v2-ad-break-player';
    media.preload = 'auto';
    media.playsInline = true;
    media.setAttribute('playsinline', '');
    if (media instanceof HTMLVideoElement && ad.posterUrl) media.poster = ad.posterUrl;
    media.src = ad.mediaUrl;
    mediaWrap.appendChild(media);
    if (media instanceof HTMLAudioElement) {
      const poster = document.createElement('div');
      poster.className = 'v2-ad-audio-poster';
      if (ad.posterUrl) poster.style.backgroundImage = `url("${ad.posterUrl.replace(/"/g, '%22')}")`;
      poster.innerHTML = '<span>STASHBOX RADIO</span><strong>Sponsored Message</strong>';
      mediaWrap.prepend(poster);
    }
    state.media = media;

    const time = overlay.querySelector('[data-v2-ad-time]');
    const skip = overlay.querySelector('[data-v2-ad-skip]');
    skip.hidden = !ad.skipEnabled;
    skip.disabled = ad.skipEnabled && ad.skipAfterSeconds > 0;

    const update = () => {
      if (state.media !== media) return;
      const current = Math.max(0, Number(media.currentTime || 0));
      state.watchedSeconds = current;
      const duration = Number.isFinite(media.duration) ? media.duration : estimatedDuration(ad);
      time.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
      if (ad.skipEnabled) {
        const remaining = Math.max(0, Math.ceil(ad.skipAfterSeconds - current));
        skip.hidden = false;
        skip.disabled = remaining > 0;
        skip.textContent = remaining > 0 ? `Skip in ${remaining}` : 'Skip Ad';
      }
    };

    media.addEventListener('timeupdate', update);
    media.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(media.duration) && media.duration > 0) state.durationMemory[ad.id] = media.duration;
      update();
    });
    media.addEventListener('ended', () => finishCurrent('ad_complete'), { once: true });
    media.addEventListener('error', () => finishCurrent('ad_error'), { once: true });

    overlay.hidden = false;
    document.body.classList.add('v2-ad-break-active');
    track(ad, 'ad_start');
    media.play().catch(() => finishCurrent('ad_error'));
  }

  function formatTime(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(safe / 60);
    const secs = Math.floor(safe % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function finishCurrent(eventType) {
    if (!state.active || !state.currentAd) return;
    const completed = state.currentAd;
    if (eventType) track(completed, eventType);
    stopMedia();
    state.currentAd = null;
    if (state.queue.length) {
      const next = state.queue.shift();
      state.breakIndex += 1;
      showAd(next, state.breakIndex, state.breakTotal);
      return;
    }
    finishBreak();
  }

  function finishBreak() {
    stopMedia();
    state.active = false;
    state.currentAd = null;
    state.queue = [];
    state.breakTotal = 0;
    state.breakIndex = 0;
    const overlay = ensureOverlay();
    overlay.hidden = true;
    document.body.classList.remove('v2-ad-break-active');
    const audio = state.resumeAudio;
    state.resumeAudio = null;
    if (audio?.isConnected) audio.play().catch(() => {});
  }

  function startBreak(audio, queue) {
    if (state.active || !queue.length) return false;
    state.active = true;
    state.resumeAudio = audio;
    state.queue = queue.slice(1);
    state.breakTotal = queue.length;
    state.breakIndex = 1;
    showAd(queue[0], 1, state.breakTotal);
    return true;
  }

  function armBreakAfterCompletedSong(audio) {
    if (!state.ready || !state.settings.ads_enabled || state.active) return false;
    const queue = buildQueue();
    if (!queue.length) return false;
    state.pendingBreak = { queue };
    // A CMS-scheduled break is an obligation, not a short-lived timing hint.
    // Keep it pending until the next song actually starts, even if media/VEC
    // initialization takes longer than a couple of seconds.
    if (state.pendingTimer) {
      window.clearTimeout(state.pendingTimer);
      state.pendingTimer = 0;
    }
    return true;
  }

  // Mark a break as due when a song naturally completes. We deliberately do not
  // stop the normal V2 ended handlers: they retain full-play/history semantics and
  // select the next song. The first play of that next song is synchronously paused
  // and replaced by the ad break, then resumed from the beginning afterward.
  document.addEventListener('ended', event => {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || !audio.closest('#v2App [data-player]')) return;
    if (state.active) return;
    state.completedSongs += 1;
    if (!state.ready || !state.settings.ads_enabled) return;
    if (state.completedSongs < state.settings.break_interval) return;
    state.completedSongs = 0;
    armBreakAfterCompletedSong(audio);
  }, true);

  document.addEventListener('play', event => {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement) || !audio.closest('#v2App [data-player]')) return;
    if (!state.pendingBreak || state.active) return;
    const pending = state.pendingBreak;
    state.pendingBreak = null;
    if (state.pendingTimer) {
      window.clearTimeout(state.pendingTimer);
      state.pendingTimer = 0;
    }
    try { audio.pause(); } catch (_) {}
    try { if (audio.currentTime < 1) audio.currentTime = 0; } catch (_) {}
    startBreak(audio, pending.queue);
  }, true);

  window.addEventListener('focus', () => {
    if (!state.active) refresh(false);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !state.active) refresh(false);
  });

  function snapshot() {
    return {
      ready: state.ready,
      enabled: Boolean(state.settings.ads_enabled),
      activeAds: state.ads.length,
      breakMethod: state.settings.break_method,
      breakInterval: state.settings.break_interval,
      adsPerBreak: state.settings.ads_per_break,
      targetAdSeconds: state.settings.target_ad_seconds,
      adPlaying: state.active,
      currentAdId: state.currentAd?.id || ''
    };
  }

  window.StashboxV2Ads = Object.freeze({
    refresh: () => refresh(true),
    state: snapshot,
    stop: () => {
      state.settings = { ...SAFE_SETTINGS };
      state.pendingBreak = null;
      if (state.active) finishBreak();
    }
  });

  refresh(true);
})();