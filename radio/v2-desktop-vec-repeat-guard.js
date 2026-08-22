(() => {
  'use strict';

  if (!location.pathname.includes('/radio/') || location.pathname.includes('/radio/artist/')) return;
  if (window.StashboxDesktopVecRepeatGuard) return;

  // Read-only diagnostic. Repeats are prevented before playback by the shuffle
  // memory and desktop recovery queue. This script never pauses or skips media.
  const state = {
    songKey: '',
    observed: 0,
    repeatsObserved: 0,
    lastAsset: '',
    lastDecision: 'monitor-only'
  };

  const clean = value => String(value ?? '').trim();
  const lower = value => clean(value).toLowerCase();

  function assetUrl(asset) {
    return clean(asset?.url || asset?.public_url || asset?.src || asset?.asset_url || asset?.video_url || asset?.clip_url || asset?.media_url || asset?.source_url);
  }

  function assetIsVideo(asset) {
    const type = lower(asset?.type || asset?.asset_type || asset?.media_type || asset?.content_type || asset?.mime_type);
    return type === 'clip' || type === 'video' || type.includes('clip') || type.includes('video') || /\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(assetUrl(asset));
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    const songKey = clean(event?.detail?.songKey);
    const asset = event?.detail?.asset;
    if (!songKey || !asset || !assetIsVideo(asset)) return;

    const memory = window.StashboxVecShuffleMemory;
    const repeated = Boolean(memory?.wasRecent?.(songKey, asset, 12));
    state.songKey = songKey;
    state.observed += 1;
    state.repeatsObserved += repeated ? 1 : 0;
    state.lastAsset = assetUrl(asset);
    state.lastDecision = repeated ? 'repeat-observed-no-intervention' : 'fresh-observed';

    const player = [...document.querySelectorAll('#v2App [data-player]')].find(node => {
      if (!node || node.hidden) return false;
      const style = getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    if (player) {
      player.dataset.vecRepeatGuardDecision = 'monitor-only';
      player.dataset.vecRepeatGuardReason = state.lastDecision;
      player.dataset.vecRepeatGuardObserved = String(state.observed);
      player.dataset.vecRepeatGuardRepeatsObserved = String(state.repeatsObserved);
    }
  });

  window.StashboxDesktopVecRepeatGuard = Object.freeze({
    state: () => ({ ...state }),
    reset: () => {
      state.songKey = '';
      state.observed = 0;
      state.repeatsObserved = 0;
      state.lastAsset = '';
      state.lastDecision = 'monitor-only';
    }
  });
})();