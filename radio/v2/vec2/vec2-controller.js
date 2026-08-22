(() => {
  'use strict';

  if (window.StashboxVec2) return;

  const STATES = Object.freeze({
    IDLE: 'IDLE',
    ARTWORK_INTRO: 'ARTWORK_INTRO',
    PRELOADING: 'PRELOADING',
    PLAYING_IMAGE: 'PLAYING_IMAGE',
    PLAYING_VIDEO: 'PLAYING_VIDEO',
    TRANSITIONING: 'TRANSITIONING',
    FALLBACK: 'FALLBACK',
    STOPPED: 'STOPPED'
  });

  const session = {
    id: 0,
    songKey: '',
    state: STATES.IDLE,
    stage: null,
    artwork: null,
    slots: [],
    currentSlot: -1,
    nextSlot: 0,
    assets: [],
    played: new Set(),
    failed: new Set(),
    currentAsset: null,
    nextAsset: null,
    introTimer: 0,
    advanceTimer: 0,
    startedAt: 0,
    artworkIntroMs: 0,
    diagnostics: []
  };

  const clean = value => String(value ?? '').trim();
  const canonical = value => {
    const raw = clean(value);
    if (!raw) return '';
    try {
      const url = new URL(raw, location.href);
      url.hash = '';
      return url.href;
    } catch (_) {
      return raw;
    }
  };

  function log(type, detail = {}) {
    const entry = {
      at: Date.now(),
      sessionId: session.id,
      songKey: session.songKey,
      state: session.state,
      type,
      ...detail
    };
    session.diagnostics.push(entry);
    if (session.diagnostics.length > 100) session.diagnostics.shift();
    window.dispatchEvent(new CustomEvent('stashbox:vec2-diagnostic', { detail: entry }));
  }

  function setState(next, reason = '') {
    if (!Object.values(STATES).includes(next)) return;
    session.state = next;
    if (session.stage) session.stage.dataset.state = next;
    log('state', { next, reason });
  }

  function clearTimers() {
    clearTimeout(session.introTimer);
    clearTimeout(session.advanceTimer);
    session.introTimer = 0;
    session.advanceTimer = 0;
  }

  function stopMedia(slot) {
    if (!slot) return;
    slot.querySelectorAll('video').forEach(video => {
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');
      try { video.load(); } catch (_) {}
    });
    slot.replaceChildren();
    slot.classList.remove('is-current', 'is-ready', 'is-promoted');
    delete slot.dataset.assetKey;
  }

  function resetSlots() {
    session.slots.forEach(stopMedia);
    session.currentSlot = -1;
    session.nextSlot = 0;
    session.currentAsset = null;
    session.nextAsset = null;
  }

  function cancelSession(reason = 'cancelled') {
    session.id += 1;
    clearTimers();
    resetSlots();
    session.assets = [];
    session.played = new Set();
    session.failed = new Set();
    session.songKey = '';
    session.startedAt = 0;
    session.artworkIntroMs = 0;
    setState(STATES.STOPPED, reason);
  }

  function ensureStage(host) {
    if (!host) throw new Error('VEC 2.0 requires a stage host');
    let stage = host.querySelector(':scope > .vec2-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'vec2-stage';
      stage.hidden = true;
      const artwork = document.createElement('div');
      artwork.className = 'vec2-artwork';
      const a = document.createElement('div');
      a.className = 'vec2-layer';
      a.dataset.slot = 'a';
      const b = document.createElement('div');
      b.className = 'vec2-layer';
      b.dataset.slot = 'b';
      stage.append(artwork, a, b);
      host.prepend(stage);
    }
    session.stage = stage;
    session.artwork = stage.querySelector('.vec2-artwork');
    session.slots = [...stage.querySelectorAll('.vec2-layer')];
    return stage;
  }

  function normalizeAsset(asset, index) {
    const url = canonical(asset?.url || asset?.public_url || asset?.asset_url || asset?.src || asset?.video_url || asset?.image_url);
    if (!url) return null;
    const declared = clean(asset?.type || asset?.asset_type || asset?.media_type || asset?.content_type).toLowerCase();
    const video = declared.includes('video') || declared.includes('clip') || /\.(mp4|webm|m4v|mov)(?:$|[?#])/i.test(url);
    return {
      id: clean(asset?.id || asset?.asset_id || asset?.key || `${index}:${url}`),
      url,
      type: video ? 'video' : 'image',
      durationMs: Math.max(1000, Number(asset?.duration_ms || asset?.durationMs || asset?.display_ms || asset?.displayMs || 8000)),
      folderId: clean(asset?.folder_id || asset?.folderId || asset?.source_folder_id || asset?.sourceFolderId)
    };
  }

  function assetKey(asset) {
    return asset ? `${asset.type}:${asset.id || asset.url}` : '';
  }

  function pickNextAsset() {
    const usable = session.assets.filter(asset => !session.failed.has(assetKey(asset)));
    if (!usable.length) return null;

    let candidates = usable.filter(asset => !session.played.has(assetKey(asset)));
    if (!candidates.length) {
      session.played.clear();
      candidates = [...usable];
      log('pool-reset', { size: usable.length });
    }

    const currentFolder = session.currentAsset?.folderId || '';
    const differentFolder = currentFolder ? candidates.filter(asset => !asset.folderId || asset.folderId !== currentFolder) : [];
    if (differentFolder.length) candidates = differentFolder;

    return candidates[0] || null;
  }

  function makeImage(asset, ownedSessionId) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.alt = '';
      image.onload = () => ownedSessionId === session.id ? resolve(image) : reject(new Error('stale-session'));
      image.onerror = () => reject(new Error('image-load-failed'));
      image.src = asset.url;
    });
  }

  function makeVideo(asset, ownedSessionId) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.playsInline = true;
      video.preload = 'auto';
      video.disablePictureInPicture = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      const ready = () => {
        cleanup();
        if (ownedSessionId !== session.id) return reject(new Error('stale-session'));
        resolve(video);
      };
      const fail = () => {
        cleanup();
        reject(new Error('video-load-failed'));
      };
      const cleanup = () => {
        video.removeEventListener('canplay', ready);
        video.removeEventListener('loadeddata', ready);
        video.removeEventListener('error', fail);
      };
      video.addEventListener('canplay', ready, { once: true });
      video.addEventListener('loadeddata', ready, { once: true });
      video.addEventListener('error', fail, { once: true });
      video.src = asset.url;
      try { video.load(); } catch (_) {}
    });
  }

  async function prepare(asset, slotIndex, ownedSessionId) {
    const slot = session.slots[slotIndex];
    if (!slot || !asset) throw new Error('missing-slot-or-asset');
    stopMedia(slot);
    slot.dataset.assetKey = assetKey(asset);
    if (session.state !== STATES.ARTWORK_INTRO) {
      setState(session.currentAsset ? STATES.TRANSITIONING : STATES.PRELOADING, `prepare:${asset.type}`);
    } else {
      log('intro-preload-start', { asset: assetKey(asset), slot: slotIndex });
    }
    const node = asset.type === 'video'
      ? await makeVideo(asset, ownedSessionId)
      : await makeImage(asset, ownedSessionId);
    if (ownedSessionId !== session.id) throw new Error('stale-session');
    slot.replaceChildren(node);
    slot.classList.add('is-ready');
    log('asset-ready', { asset: assetKey(asset), slot: slotIndex, readyState: node.readyState ?? null });
    return { slot, node };
  }

  async function promote(asset, slotIndex, node, ownedSessionId) {
    if (ownedSessionId !== session.id) return;
    const slot = session.slots[slotIndex];
    const previousIndex = session.currentSlot;
    const previous = previousIndex >= 0 ? session.slots[previousIndex] : null;

    if (asset.type === 'video') {
      try {
        const playResult = node.play();
        if (playResult?.then) await playResult;
      } catch (error) {
        throw new Error(`video-play-failed:${error?.name || error?.message || 'unknown'}`);
      }
    }

    if (ownedSessionId !== session.id) return;
    slot.classList.add('is-current', 'is-promoted');
    if (previous && previous !== slot) {
      previous.classList.remove('is-current', 'is-promoted');
      window.setTimeout(() => {
        if (ownedSessionId === session.id && session.currentSlot !== previousIndex) stopMedia(previous);
      }, 180);
    }

    session.currentSlot = slotIndex;
    session.nextSlot = slotIndex === 0 ? 1 : 0;
    session.currentAsset = asset;
    session.nextAsset = null;
    session.played.add(assetKey(asset));
    setState(asset.type === 'video' ? STATES.PLAYING_VIDEO : STATES.PLAYING_IMAGE, `promote:${assetKey(asset)}`);
    log('asset-playing', { asset: assetKey(asset), slot: slotIndex });

    scheduleAdvance(asset, node, ownedSessionId);
    preloadFollowing(ownedSessionId);
  }

  function scheduleAdvance(asset, node, ownedSessionId) {
    clearTimeout(session.advanceTimer);
    if (asset.type === 'video') {
      node.addEventListener('ended', () => {
        if (ownedSessionId === session.id && node === session.slots[session.currentSlot]?.firstElementChild) advance(ownedSessionId, 'video-ended');
      }, { once: true });
      return;
    }
    session.advanceTimer = window.setTimeout(() => advance(ownedSessionId, 'image-duration'), asset.durationMs);
  }

  async function preloadFollowing(ownedSessionId) {
    if (ownedSessionId !== session.id || session.nextAsset) return;
    const asset = pickNextAsset();
    if (!asset || assetKey(asset) === assetKey(session.currentAsset)) return;
    session.nextAsset = asset;
    try {
      await prepare(asset, session.nextSlot, ownedSessionId);
    } catch (error) {
      if (ownedSessionId !== session.id) return;
      session.failed.add(assetKey(asset));
      session.nextAsset = null;
      log('asset-failed', { asset: assetKey(asset), error: error?.message || String(error) });
      preloadFollowing(ownedSessionId);
    }
  }

  async function advance(ownedSessionId, reason = 'advance') {
    if (ownedSessionId !== session.id) return;
    let asset = session.nextAsset;
    let slotIndex = session.nextSlot;
    let node = session.slots[slotIndex]?.firstElementChild || null;

    if (!asset || !node || !session.slots[slotIndex]?.classList.contains('is-ready')) {
      asset = pickNextAsset();
      if (!asset) {
        setState(STATES.FALLBACK, 'no-playable-assets');
        return;
      }
      session.nextAsset = asset;
      try {
        const prepared = await prepare(asset, slotIndex, ownedSessionId);
        node = prepared.node;
      } catch (error) {
        if (ownedSessionId !== session.id) return;
        session.failed.add(assetKey(asset));
        session.nextAsset = null;
        log('asset-failed', { asset: assetKey(asset), reason, error: error?.message || String(error) });
        return advance(ownedSessionId, 'skip-failed');
      }
    }

    try {
      await promote(asset, slotIndex, node, ownedSessionId);
    } catch (error) {
      if (ownedSessionId !== session.id) return;
      session.failed.add(assetKey(asset));
      stopMedia(session.slots[slotIndex]);
      session.nextAsset = null;
      log('asset-failed', { asset: assetKey(asset), reason, error: error?.message || String(error) });
      advance(ownedSessionId, 'skip-play-failed');
    }
  }

  async function begin(config) {
    const host = config?.host;
    ensureStage(host);
    clearTimers();
    resetSlots();

    session.id += 1;
    const ownedSessionId = session.id;
    session.songKey = clean(config?.songKey);
    session.assets = (Array.isArray(config?.assets) ? config.assets : []).map(normalizeAsset).filter(Boolean);
    session.played = new Set();
    session.failed = new Set();
    session.startedAt = performance.now();
    session.artworkIntroMs = Math.max(0, Number(config?.artworkIntroMs ?? Number(config?.artworkIntroSeconds || 0) * 1000));
    session.stage.hidden = false;
    session.artwork.style.backgroundImage = config?.artworkUrl ? `url("${canonical(config.artworkUrl).replace(/"/g, '\\"')}")` : 'none';
    setState(STATES.ARTWORK_INTRO, 'song-start');
    log('session-start', { assetCount: session.assets.length, artworkIntroMs: session.artworkIntroMs });

    const first = pickNextAsset();
    if (first) {
      session.nextAsset = first;
      prepare(first, session.nextSlot, ownedSessionId).catch(error => {
        if (ownedSessionId !== session.id) return;
        session.failed.add(assetKey(first));
        session.nextAsset = null;
        log('asset-failed', { asset: assetKey(first), error: error?.message || String(error) });
      });
    }

    session.introTimer = window.setTimeout(() => {
      if (ownedSessionId === session.id) advance(ownedSessionId, 'artwork-intro-complete');
    }, session.artworkIntroMs);

    return ownedSessionId;
  }

  function hide() {
    cancelSession('hide');
    if (session.stage) session.stage.hidden = true;
  }

  window.StashboxVec2 = Object.freeze({
    STATES,
    begin,
    hide,
    stop: () => cancelSession('manual-stop'),
    state: () => ({
      sessionId: session.id,
      songKey: session.songKey,
      state: session.state,
      assetCount: session.assets.length,
      playedCount: session.played.size,
      failedCount: session.failed.size,
      currentAsset: session.currentAsset,
      nextAsset: session.nextAsset,
      artworkIntroMs: session.artworkIntroMs
    }),
    diagnostics: () => [...session.diagnostics]
  });
})();
