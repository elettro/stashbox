(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app || window.StashboxV2MediaTransitionGuard) return;

  const DESKTOP_MIN_WIDTH = 900;
  const MIN_HORIZONTAL_RATIO = 1.5;
  const RATIO_CHECK_TIMEOUT_MS = 4200;

  let player = null;
  let guard = null;
  let titleObserver = null;
  let playerObserver = null;
  let stageObserver = null;
  let releaseTimer = 0;
  let installTimer = 0;
  let resizeTimer = 0;
  let currentSongToken = '';
  const assetMetadataByUrl = new Map();

  const clean = value => String(value ?? '').trim();

  function canonicalUrl(value) {
    const source = clean(value);
    if (!source) return '';
    try {
      const url = new URL(source, window.location.href);
      url.hash = '';
      return url.href;
    } catch (_) {
      return source.split('#')[0];
    }
  }

  function backgroundUrl(element) {
    const inline = clean(element?.style?.backgroundImage);
    const computed = clean(element ? getComputedStyle(element).backgroundImage : '');
    const value = inline && inline !== 'none' ? inline : computed;
    const match = value.match(/url\((?:"|')?(.*?)(?:"|')?\)/i);
    return clean(match?.[1]);
  }

  function artworkUrl() {
    const backdrop = player?.querySelector('[data-backdrop]');
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    const avatar = player?.querySelector('[data-avatar] img');
    return backgroundUrl(stage) || backgroundUrl(backdrop) || clean(avatar?.currentSrc || avatar?.src);
  }

  function ensureGuard() {
    if (!player) return null;
    if (guard?.isConnected) return guard;
    guard = player.querySelector('[data-media-transition-art]');
    if (!guard) {
      guard = document.createElement('div');
      guard.className = 'v2-media-transition-art';
      guard.dataset.mediaTransitionArt = 'true';
      guard.setAttribute('aria-hidden', 'true');
      const shade = player.querySelector('.v2-player-shade');
      if (shade) player.insertBefore(guard, shade.nextSibling);
      else player.prepend(guard);
    }
    return guard;
  }

  function holdArtwork() {
    if (!player || player.hidden) return;
    const url = artworkUrl();
    const element = ensureGuard();
    if (!element || !url) return;
    clearTimeout(releaseTimer);
    element.style.backgroundImage = `url("${url.replaceAll('"', '%22')}")`;
    element.classList.remove('is-releasing');
    element.classList.add('is-holding');
    player.dataset.mediaTransitionState = 'holding-artwork';
  }

  function releaseArtwork(reason = 'media-ready') {
    if (!guard?.isConnected || !guard.classList.contains('is-holding')) return;
    clearTimeout(releaseTimer);
    guard.classList.add('is-releasing');
    guard.classList.remove('is-holding');
    player.dataset.mediaTransitionState = reason;
    releaseTimer = window.setTimeout(() => {
      guard?.classList.remove('is-releasing');
    }, 420);
  }

  function stageSurface() {
    return player?.querySelector('[data-mobile-vec-stage]') || player;
  }

  function desktopWideSurface() {
    const surface = stageSurface();
    const rect = surface?.getBoundingClientRect?.();
    const width = Math.max(1, rect?.width || window.innerWidth || 1);
    const height = Math.max(1, rect?.height || window.innerHeight || 1);
    return width >= DESKTOP_MIN_WIDTH && width / height >= 1.25;
  }

  function mediaDimensions(media) {
    if (media?.tagName === 'VIDEO') {
      return { width: Number(media.videoWidth) || 0, height: Number(media.videoHeight) || 0 };
    }
    if (media?.tagName === 'IMG') {
      return { width: Number(media.naturalWidth) || 0, height: Number(media.naturalHeight) || 0 };
    }
    return { width: 0, height: 0 };
  }

  function mediaUrl(media) {
    return canonicalUrl(media?.currentSrc || media?.src || media?.getAttribute?.('src'));
  }

  function isOfficialArtworkMedia(media) {
    if (!media || media.tagName !== 'IMG') return false;
    if (
      media.dataset.responsiveOfficialArtwork === 'true' ||
      media.dataset.vecAssetSource === 'official-artwork' ||
      media.dataset.officialArtworkGate
    ) {
      return true;
    }

    const source = mediaUrl(media);
    const knownArtwork = canonicalUrl(artworkUrl());
    return Boolean(source && knownArtwork && source === knownArtwork);
  }

  function clearDesktopRatioStyles(media) {
    if (!media || !media.dataset.desktopRatioState) return;
    media.style.removeProperty('visibility');
    media.style.removeProperty('pointer-events');
    media.style.removeProperty('opacity');
  }

  function revealRatioApprovedMedia(media, ratio) {
    if (!media?.isConnected) return;
    clearDesktopRatioStyles(media);
    media.dataset.desktopRatioState = 'approved';
    media.dataset.desktopAspectRatio = ratio.toFixed(4);
  }

  function hideRatioMedia(media, state) {
    if (!media) return;
    media.dataset.desktopRatioState = state;
    media.style.setProperty('opacity', '0', 'important');
    media.style.setProperty('visibility', 'hidden', 'important');
    media.style.setProperty('pointer-events', 'none', 'important');
  }

  function skipRejectedMedia(media, ratio, reason) {
    if (!media?.isConnected || media.dataset.desktopRatioSkipSent === 'true') return;
    media.dataset.desktopRatioSkipSent = 'true';
    media.dataset.desktopAspectRatio = ratio > 0 ? ratio.toFixed(4) : '';
    hideRatioMedia(media, 'rejected');
    holdArtwork();

    if (media.tagName === 'VIDEO') {
      try { media.pause(); } catch (_) {}
    }

    console.warn('[V2 desktop VEC ratio] Skipping non-horizontal media.', {
      tag: media.tagName,
      ratio: ratio || null,
      reason,
      src: mediaUrl(media)
    });

    window.setTimeout(() => {
      if (!media.isConnected) return;
      const eventName = media.tagName === 'VIDEO' ? 'ended' : 'error';
      media.dispatchEvent(new Event(eventName));
    }, 0);
  }

  function inspectMediaRatio(media, reason = 'inspect') {
    if (!media?.isConnected) return false;

    if (!desktopWideSurface()) {
      clearDesktopRatioStyles(media);
      delete media.dataset.desktopRatioState;
      delete media.dataset.desktopAspectRatio;
      return true;
    }

    if (isOfficialArtworkMedia(media)) {
      clearDesktopRatioStyles(media);
      media.dataset.desktopRatioState = 'approved';
      media.dataset.desktopAspectRatio = '';
      return true;
    }

    const { width, height } = mediaDimensions(media);
    if (!width || !height) {
      hideRatioMedia(media, 'pending');
      return false;
    }

    const ratio = width / height;
    if (ratio >= MIN_HORIZONTAL_RATIO) {
      revealRatioApprovedMedia(media, ratio);
      return true;
    }

    skipRejectedMedia(media, ratio, reason);
    return false;
  }

  function scheduleRatioTimeout(media) {
    window.clearTimeout(Number(media.dataset.desktopRatioTimer) || 0);
    const timer = window.setTimeout(() => {
      if (!media.isConnected || media.dataset.desktopRatioState === 'approved') return;
      const { width, height } = mediaDimensions(media);
      const ratio = width && height ? width / height : 0;
      if (ratio >= MIN_HORIZONTAL_RATIO) {
        revealRatioApprovedMedia(media, ratio);
        return;
      }
      skipRejectedMedia(media, ratio, ratio ? 'timeout-non-horizontal' : 'timeout-no-dimensions');
    }, RATIO_CHECK_TIMEOUT_MS);
    media.dataset.desktopRatioTimer = String(timer);
  }

  function mediaReady(media) {
    if (!media?.isConnected) return false;
    if (desktopWideSurface() && media.dataset.desktopRatioState !== 'approved' && !isOfficialArtworkMedia(media)) {
      return false;
    }
    if (media.tagName === 'IMG') return media.complete && media.naturalWidth > 0;
    if (media.tagName === 'VIDEO') {
      return media.classList.contains('is-active') && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    }
    return false;
  }

  function inspectStage() {
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    if (!stage) return;
    const media = [...stage.querySelectorAll('.v2-mobile-vec-media')];
    media.forEach(item => inspectMediaRatio(item, 'stage-inspection'));
    const active = [...stage.querySelectorAll('.v2-mobile-vec-media.is-active')].at(-1);
    if (mediaReady(active)) releaseArtwork(active.tagName === 'VIDEO' ? 'video-ready' : 'image-ready');
  }

  function bindMedia(media) {
    if (!media || media.dataset.transitionGuardBound === 'true') return;
    media.dataset.transitionGuardBound = 'true';

    if (desktopWideSurface() && !isOfficialArtworkMedia(media)) {
      hideRatioMedia(media, 'pending');
      scheduleRatioTimeout(media);
    }

    if (media.tagName === 'VIDEO') {
      ['loadedmetadata', 'loadeddata', 'canplay', 'playing'].forEach(eventName => {
        media.addEventListener(eventName, () => {
          const approved = inspectMediaRatio(media, eventName);
          if (approved && (media.classList.contains('is-active') || eventName === 'playing')) {
            releaseArtwork('video-ready');
          }
        }, { passive: true });
      });
    } else if (media.tagName === 'IMG') {
      media.addEventListener('load', () => {
        const approved = inspectMediaRatio(media, 'image-load');
        if (approved && media.classList.contains('is-active')) releaseArtwork('image-ready');
      }, { passive: true });
      if (media.complete) inspectMediaRatio(media, 'image-complete');
    }
  }

  function observeStage() {
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    if (!stage || stage.dataset.transitionGuardObserved === 'true') return;
    stage.dataset.transitionGuardObserved = 'true';
    stage.querySelectorAll('.v2-mobile-vec-media').forEach(bindMedia);
    stageObserver?.disconnect();
    stageObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node instanceof HTMLElement && node.matches?.('.v2-mobile-vec-media')) bindMedia(node);
        });
      });
      inspectStage();
    });
    stageObserver.observe(stage, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'src']
    });
    inspectStage();
  }

  function onSongChange() {
    const title = clean(player?.querySelector('[data-ptitle]')?.textContent).toLowerCase();
    if (title !== currentSongToken) {
      currentSongToken = title;
      assetMetadataByUrl.clear();
    }
    window.requestAnimationFrame(() => {
      holdArtwork();
      observeStage();
      inspectStage();
    });
  }

  function install() {
    const current = app.querySelector('[data-player]');
    if (!current) return false;
    if (current === player) return true;
    player = current;
    ensureGuard();

    const title = player.querySelector('[data-ptitle]');
    titleObserver?.disconnect();
    if (title) {
      titleObserver = new MutationObserver(onSongChange);
      titleObserver.observe(title, { childList: true, characterData: true, subtree: true });
    }

    playerObserver?.disconnect();
    playerObserver = new MutationObserver(() => {
      if (player.hidden) {
        clearTimeout(releaseTimer);
        guard?.classList.remove('is-holding', 'is-releasing');
        return;
      }
      onSongChange();
    });
    playerObserver.observe(player, { attributes: true, attributeFilter: ['hidden'] });

    observeStage();
    if (!player.hidden) onSongChange();
    return true;
  }

  window.addEventListener('stashbox:vec-asset-change', event => {
    const detail = event?.detail || {};
    const asset = detail.asset || {};
    const source = clean(asset.source).toLowerCase();
    const url = canonicalUrl(asset.url);
    if (url) assetMetadataByUrl.set(url, { source, songKey: clean(detail.songKey), type: clean(asset.type) });

    const stage = player?.querySelector('[data-mobile-vec-stage]');
    const media = [...(stage?.querySelectorAll('.v2-mobile-vec-media') || [])].at(-1);
    if (media) {
      const mediaSource = assetMetadataByUrl.get(mediaUrl(media));
      if (mediaSource?.source) media.dataset.vecAssetSource = mediaSource.source;
      bindMedia(media);
      inspectMediaRatio(media, 'asset-change');
    }

    observeStage();
    window.requestAnimationFrame(inspectStage);
  });

  document.addEventListener('click', event => {
    if (event.target.closest('#v2App [data-song], #v2App [data-next], #v2App [data-prev]')) {
      window.setTimeout(onSongChange, 0);
    }
  }, true);

  window.addEventListener('resize', () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const stage = player?.querySelector('[data-mobile-vec-stage]');
      stage?.querySelectorAll('.v2-mobile-vec-media').forEach(media => {
        media.dataset.desktopRatioSkipSent = '';
        inspectMediaRatio(media, 'resize');
      });
      inspectStage();
    }, 140);
  }, { passive: true });

  installTimer = window.setInterval(() => {
    if (install()) window.clearInterval(installTimer);
  }, 50);

  window.StashboxV2MediaTransitionGuard = Object.freeze({
    refresh: inspectStage,
    isDesktopWideSurface: desktopWideSurface,
    minHorizontalRatio: MIN_HORIZONTAL_RATIO
  });
})();