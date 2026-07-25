(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  let player = null;
  let guard = null;
  let titleObserver = null;
  let playerObserver = null;
  let stageObserver = null;
  let releaseTimer = 0;
  let installTimer = 0;

  const clean = value => String(value ?? '').trim();

  function backgroundUrl(element) {
    const inline = clean(element?.style?.backgroundImage);
    const computed = clean(element ? getComputedStyle(element).backgroundImage : '');
    const value = inline && inline !== 'none' ? inline : computed;
    const match = value.match(/url\((?:"|')?(.*?)(?:"|')?\)/i);
    return clean(match?.[1]);
  }

  function artworkUrl() {
    const backdrop = player?.querySelector('[data-backdrop]');
    const avatar = player?.querySelector('[data-avatar] img');
    return backgroundUrl(backdrop) || clean(avatar?.currentSrc || avatar?.src);
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

  function mediaReady(media) {
    if (!media?.isConnected) return false;
    if (media.tagName === 'IMG') return media.complete && media.naturalWidth > 0;
    if (media.tagName === 'VIDEO') {
      return media.classList.contains('is-active') && media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    }
    return false;
  }

  function inspectStage() {
    const stage = player?.querySelector('[data-mobile-vec-stage]');
    if (!stage) return;
    const active = [...stage.querySelectorAll('.v2-mobile-vec-media.is-active')].at(-1);
    if (mediaReady(active)) releaseArtwork(active.tagName === 'VIDEO' ? 'video-ready' : 'image-ready');
  }

  function bindMedia(media) {
    if (!media || media.dataset.transitionGuardBound === 'true') return;
    media.dataset.transitionGuardBound = 'true';
    if (media.tagName === 'VIDEO') {
      ['loadeddata', 'canplay', 'playing'].forEach(eventName => {
        media.addEventListener(eventName, () => {
          if (media.classList.contains('is-active') || eventName === 'playing') releaseArtwork('video-ready');
        }, { passive: true });
      });
    } else if (media.tagName === 'IMG') {
      media.addEventListener('load', () => {
        if (media.classList.contains('is-active')) releaseArtwork('image-ready');
      }, { passive: true });
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
      attributeFilter: ['class']
    });
    inspectStage();
  }

  function onSongChange() {
    window.requestAnimationFrame(() => {
      holdArtwork();
      observeStage();
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

  window.addEventListener('stashbox:vec-asset-change', () => {
    observeStage();
    window.requestAnimationFrame(inspectStage);
  });

  document.addEventListener('click', event => {
    if (event.target.closest('#v2App [data-song], #v2App [data-next], #v2App [data-prev]')) {
      window.setTimeout(onSongChange, 0);
    }
  }, true);

  installTimer = window.setInterval(() => {
    if (install()) window.clearInterval(installTimer);
  }, 50);
})();