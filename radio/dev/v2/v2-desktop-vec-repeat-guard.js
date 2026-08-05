(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/radio/dev/v2/artist/')) return;
  if (window.StashboxDesktopVecRepeatGuard) return;

  const DESKTOP = window.matchMedia('(min-width: 900px)');
  const state = {
    songKey: '',
    seenThisSession: new Set(),
    skipped: 0,
    accepted: 0,
    lastDecision: ''
  };

  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();

  function canonicalUrl(value) {
    const source = clean(value)
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/\?dl=[01]/, '');
    if (!source) return '';
    try {
      const url = new URL(source, location.href);
      url.hash = '';
      ['X-Amz-Algorithm', 'X-Amz-Credential', 'X-Amz-Date', 'X-Amz-Expires', 'X-Amz-SignedHeaders', 'X-Amz-Signature'].forEach(key => url.searchParams.delete(key));
      return `${url.origin}${url.pathname}${url.search}`.toLowerCase();
    } catch (_) {
      return source.toLowerCase();
    }
  }

  function assetUrl(asset) {
    return clean(asset?.url || asset?.public_url || asset?.src || asset?.asset_url || asset?.video_url || asset?.clip_url || asset?.media_url || asset?.source_url);
  }

  function assetIsVideo(asset) {
    const type = lower(asset?.type || asset?.asset_type || asset?.media_type || asset?.content_type || asset?.mime_type);
    return type === 'clip' || type === 'video' || type.includes('clip') || type.includes('video') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(assetUrl(asset));
  }

  function folderSource(asset) {
    const source = lower(asset?.source || asset?.folderId || asset?.folder_id || '');
    return source.startsWith('folder:') || source.includes('folder');
  }

  function activePlayer() {
    const audio = [...document.querySelectorAll('#v2App audio')].find(node => !node.paused && !node.ended);
    const byAudio = audio?.closest?.('[data-player]');
    if (byAudio) return byAudio;
    return [...document.querySelectorAll('#v2App [data-player]')].find(node => {
      if (!node || node.hidden) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
  }

  function reset(songKey) {
    state.songKey = songKey;
    state.seenThisSession = new Set();
    state.skipped = 0;
    state.accepted = 0;
    state.lastDecision = 'song-change';
  }

  function matchingVideo(asset) {
    const player = activePlayer();
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    if (!stage) return null;
    const target = canonicalUrl(assetUrl(asset));
    const videos = [...stage.querySelectorAll('video.v2-mobile-vec-media')]
      .filter(video => video.dataset.vecShuffleSkipped !== 'true');
    return videos.find(video => canonicalUrl(video.currentSrc || video.src) === target)
      || videos.at(-1)
      || null;
  }

  function recordDecision(decision, asset, reason = '') {
    state.lastDecision = `${decision}:${reason}`;
    const player = activePlayer();
    if (!player) return;
    player.dataset.vecRepeatGuardDecision = decision;
    player.dataset.vecRepeatGuardReason = reason;
    player.dataset.vecRepeatGuardSkipped = String(state.skipped);
    player.dataset.vecRepeatGuardAccepted = String(state.accepted);
    player.dataset.vecRepeatGuardAsset = assetUrl(asset);
  }

  function poolSize() {
    const value = Number(window.StashboxMainVecVideoWatchdog?.clipCount?.() || 0);
    return Number.isFinite(value) ? value : 0;
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    if (!DESKTOP.matches) return;
    const songKey = clean(event?.detail?.songKey);
    const asset = event?.detail?.asset;
    if (!songKey || !asset || !assetIsVideo(asset) || !folderSource(asset)) return;
    if (songKey !== state.songKey) reset(songKey);

    const memory = window.StashboxVecShuffleMemory;
    const key = memory?.clipKey?.(asset) || canonicalUrl(assetUrl(asset));
    if (!key) return;

    const count = poolSize();
    const recentWindow = count > 0 ? Math.max(8, Math.min(40, Math.ceil(count * 0.35))) : 16;
    const repeatedFromHistory = Boolean(memory?.wasRecent?.(songKey, asset, recentWindow));
    const repeatedThisSession = state.seenThisSession.has(key);
    const repeated = repeatedFromHistory || repeatedThisSession;
    const maximumSkips = count > 0 ? Math.min(12, Math.max(3, Math.floor(count / 5))) : 6;

    if (!repeated || count === 1 || state.skipped >= maximumSkips) {
      state.seenThisSession.add(key);
      state.accepted += 1;
      recordDecision('accepted', asset, repeated ? 'skip-limit-or-single-clip' : 'fresh-clip');
      return;
    }

    window.setTimeout(() => {
      const video = matchingVideo(asset);
      if (!video || video.dataset.vecShuffleSkipped === 'true') return;
      video.dataset.vecShuffleSkipped = 'true';
      video.style.setProperty('opacity', '0', 'important');
      try { video.pause(); } catch (_) {}
      state.skipped += 1;
      recordDecision('skipped', asset, repeatedThisSession ? 'same-session-repeat' : 'recent-history-repeat');
      video.dispatchEvent(new Event('ended'));
    }, 0);
  });

  if (typeof DESKTOP.addEventListener === 'function') {
    DESKTOP.addEventListener('change', () => {
      if (!DESKTOP.matches) reset('');
    });
  }

  window.StashboxDesktopVecRepeatGuard = Object.freeze({
    state: () => ({
      songKey: state.songKey,
      skipped: state.skipped,
      accepted: state.accepted,
      seenThisSession: state.seenThisSession.size,
      lastDecision: state.lastDecision,
      poolSize: poolSize()
    }),
    reset: () => reset(state.songKey)
  });
})();