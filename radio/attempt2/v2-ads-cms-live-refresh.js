(() => {
  'use strict';

  if (!location.pathname.includes('/radio/attempt2/') || location.pathname.includes('/artist/')) return;
  if (window.StashboxV2AdsLiveRefresh) return;

  const PUBLIC_SETTINGS_URL = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2/radio/ad-settings';
  const SETTINGS_STORAGE_KEY = 'stashbox_radio_dev_ads_settings_v1';
  const MIN_FORCE_GAP_MS = 1200;
  const MIN_PROBE_GAP_MS = 3500;
  let lastForcedAt = 0;
  let lastProbeAt = 0;
  let probeInFlight = null;
  let guaranteedRefreshTimer = 0;

  function forceAdFit(target = document) {
    const videos = target instanceof HTMLVideoElement
      ? [target]
      : [...(target?.querySelectorAll?.('.v2-ad-break-player') || [])];
    videos.forEach(video => {
      if (!(video instanceof HTMLVideoElement) || !video.classList.contains('v2-ad-break-player')) return;
      // Size the actual video box by its intrinsic ratio. This makes FIT physical,
      // rather than relying on object-fit inside a viewport-sized video element.
      video.style.setProperty('width', 'auto', 'important');
      video.style.setProperty('height', 'auto', 'important');
      video.style.setProperty('max-width', '100%', 'important');
      video.style.setProperty('max-height', '100%', 'important');
      video.style.setProperty('object-fit', 'contain', 'important');
      video.style.setProperty('object-position', 'center center', 'important');
      video.dataset.v2AdForcedFit = 'true';
    });
  }

  function forceRefresh({ guaranteed = false } = {}) {
    const now = Date.now();
    const remaining = MIN_FORCE_GAP_MS - (now - lastForcedAt);
    if (remaining > 0) {
      if (guaranteed) {
        if (guaranteedRefreshTimer) window.clearTimeout(guaranteedRefreshTimer);
        guaranteedRefreshTimer = window.setTimeout(() => {
          guaranteedRefreshTimer = 0;
          forceRefresh();
        }, remaining + 30);
      }
      return;
    }
    const ads = window.StashboxV2Ads;
    if (!ads?.refresh) return;
    lastForcedAt = now;
    Promise.resolve(ads.refresh()).then(() => forceAdFit()).catch(() => {});
  }

  function normalizeEnabled(value) {
    if (value === true || value === 1) return true;
    return ['true', '1', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
  }

  function normalizeSettings(data) {
    const raw = typeof data?.body === 'string' ? (() => {
      try { return JSON.parse(data.body); } catch (_) { return {}; }
    })() : data;
    const source = raw?.settings || raw || {};
    return {
      enabled: normalizeEnabled(source.ads_enabled),
      breakMethod: source.break_method === 'seconds' ? 'seconds' : 'count',
      breakInterval: Number(source.break_interval || 1),
      adsPerBreak: Number(source.ads_per_break || 1),
      targetAdSeconds: Number(source.target_ad_seconds || 30)
    };
  }

  function settingsDiffer(next, current) {
    if (!current) return true;
    return Boolean(next.enabled) !== Boolean(current.enabled)
      || next.breakMethod !== current.breakMethod
      || Number(next.breakInterval) !== Number(current.breakInterval)
      || Number(next.adsPerBreak) !== Number(current.adsPerBreak)
      || Number(next.targetAdSeconds) !== Number(current.targetAdSeconds);
  }

  async function probeCmsSettings(force = false) {
    const now = Date.now();
    if (!force && now - lastProbeAt < MIN_PROBE_GAP_MS) return;
    if (probeInFlight) return probeInFlight;
    lastProbeAt = now;
    probeInFlight = fetch(PUBLIC_SETTINGS_URL, { cache: 'no-store', credentials: 'omit' })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = normalizeSettings(await response.json());
        const current = window.StashboxV2Ads?.state?.();
        if (settingsDiffer(next, current)) forceRefresh({ guaranteed: true });
      })
      .catch(() => {})
      .finally(() => { probeInFlight = null; });
    return probeInFlight;
  }

  // The Ads CMS lives on the same origin. Any saved settings change in another
  // tab is an immediate signal to re-read the authoritative API state. A rapid
  // OFF -> ON sequence cannot be lost to the refresh throttle.
  window.addEventListener('storage', event => {
    if (event.key === SETTINGS_STORAGE_KEY) {
      probeCmsSettings(true);
      forceRefresh({ guaranteed: true });
    }
  });

  window.addEventListener('focus', () => {
    probeCmsSettings(true);
    forceRefresh({ guaranteed: true });
    forceAdFit();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      probeCmsSettings(true);
      forceRefresh({ guaranteed: true });
      forceAdFit();
    }
  });

  // Probe once at each player-audio start. This is one lightweight settings GET
  // per track transition, not continuous polling, and keeps break timing/counts
  // aligned with the CMS for long-running listener sessions.
  ['loadstart', 'play'].forEach(type => {
    document.addEventListener(type, event => {
      const audio = event.target;
      if (!(audio instanceof HTMLAudioElement) || !audio.closest('#v2App [data-player]')) return;
      probeCmsSettings(false);
    }, true);
  });

  // Force FIT directly on every ad video lifecycle event. This wins over any
  // generic V2 video FULL/cover rule regardless of stylesheet order.
  ['loadedmetadata', 'canplay', 'play', 'playing'].forEach(type => {
    document.addEventListener(type, event => {
      if (event.target instanceof HTMLVideoElement && event.target.classList.contains('v2-ad-break-player')) {
        forceAdFit(event.target);
      }
    }, true);
  });

  forceAdFit();
  window.setTimeout(() => { probeCmsSettings(true); forceRefresh({ guaranteed: true }); forceAdFit(); }, 400);
  window.setTimeout(() => { probeCmsSettings(true); forceRefresh({ guaranteed: true }); forceAdFit(); }, 1400);

  window.StashboxV2AdsLiveRefresh = Object.freeze({
    refresh: () => forceRefresh({ guaranteed: true }),
    probe: () => probeCmsSettings(true),
    forceFit: forceAdFit
  });
})();