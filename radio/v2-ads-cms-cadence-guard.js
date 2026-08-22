(() => {
  'use strict';

  if (!location.pathname.includes('/radio/') || location.pathname.includes('/artist/')) return;
  if (window.StashboxV2AdsCadenceGuard) return;

  const refreshedGeneration = new WeakMap();
  let heldNextAudio = null;
  let claimProxy = null;

  const isPlayerAudio = audio => (
    audio instanceof HTMLAudioElement &&
    !audio.dataset.v2AdsCadenceProxy &&
    Boolean(audio.closest('#v2App [data-player]'))
  );
  const adsRuntime = () => window.StashboxV2Ads;
  const generationKey = audio => `${audio.currentSrc || audio.src || ''}|${Number(audio.duration || 0).toFixed(2)}`;

  function refreshBeforeBoundary(audio) {
    if (!isPlayerAudio(audio)) return;
    const duration = Number(audio.duration || 0);
    const current = Number(audio.currentTime || 0);
    if (!Number.isFinite(duration) || duration <= 0 || duration - current > 8) return;

    const key = generationKey(audio);
    if (refreshedGeneration.get(audio) === key) return;
    refreshedGeneration.set(audio, key);

    // Pull the authoritative Ads CMS state before the completion boundary.
    // The actual break remains owned by the shared Ads runtime.
    try { adsRuntime()?.refresh?.(); } catch (_) {}
  }

  function playerAudios() {
    return [...document.querySelectorAll('#v2App [data-player] audio')]
      .filter(audio => isPlayerAudio(audio));
  }

  function currentNextAudio() {
    if (heldNextAudio?.isConnected && !heldNextAudio.ended) return heldNextAudio;
    const audios = playerAudios();
    const visible = audios.filter(audio => !audio.closest('[data-player]')?.hidden && !audio.ended);
    return visible[0] || audios.find(audio => !audio.ended) || null;
  }

  function removeClaimProxy() {
    if (!claimProxy) return;
    try { claimProxy.remove(); } catch (_) {}
    claimProxy = null;
  }

  function makeClaimProxy() {
    removeClaimProxy();
    const host = [...document.querySelectorAll('#v2App [data-player]')]
      .find(node => node && !node.hidden && node.isConnected) || document.querySelector('#v2App [data-player]');
    if (!host) return null;

    const proxy = document.createElement('audio');
    proxy.dataset.v2AdsCadenceProxy = 'true';
    proxy.hidden = true;
    proxy.setAttribute('aria-hidden', 'true');
    proxy.style.setProperty('display', 'none', 'important');

    // The Ads runtime stores the element that claims the pending break and calls
    // play() on it when the break ends. Proxy that resume call to the real next
    // song selected by V2 while the ad was playing.
    Object.defineProperty(proxy, 'play', {
      configurable: true,
      value: () => {
        const target = currentNextAudio();
        removeClaimProxy();
        heldNextAudio = null;
        if (!target?.isConnected) return Promise.resolve();
        try {
          return Promise.resolve(target.play());
        } catch (_) {
          return Promise.resolve();
        }
      }
    });

    host.appendChild(proxy);
    claimProxy = proxy;
    return proxy;
  }

  function claimPendingBreakNow() {
    const ads = adsRuntime();
    const snapshot = ads?.state?.();
    if (!snapshot?.enabled || !snapshot.breakPending || snapshot.adPlaying) return false;

    const proxy = makeClaimProxy();
    if (!proxy) return false;

    // v2-ads-cms-runtime.js listens for player-audio play events and claims a
    // pending CMS break when the event comes from a new audio generation. This
    // dedicated proxy is always a new generation, so the break begins at the
    // song boundary instead of depending on the timing of V2's next-song mount.
    proxy.dispatchEvent(new Event('play', { bubbles: true }));
    return Boolean(adsRuntime()?.state?.()?.adPlaying);
  }

  function holdBackgroundSongDuringAd(audio) {
    if (!isPlayerAudio(audio)) return;
    const snapshot = adsRuntime()?.state?.();
    if (!snapshot?.adPlaying) return;

    heldNextAudio = audio;
    try { audio.pause(); } catch (_) {}
    try {
      if (Number(audio.currentTime || 0) < 1.5) audio.currentTime = 0;
    } catch (_) {}
  }

  document.addEventListener('timeupdate', event => refreshBeforeBoundary(event.target), true);

  // Runtime's ended listener was registered earlier, so by the time this capture
  // listener runs the CMS break is already marked pending. Claim it immediately.
  document.addEventListener('ended', event => {
    const audio = event.target;
    if (!isPlayerAudio(audio)) return;
    claimPendingBreakNow();
  }, true);

  ['loadstart', 'play', 'playing'].forEach(type => {
    document.addEventListener(type, event => {
      const audio = event.target;
      if (!isPlayerAudio(audio)) return;
      holdBackgroundSongDuringAd(audio);
      if (!adsRuntime()?.state?.()?.adPlaying) claimPendingBreakNow();
    }, true);
  });

  window.addEventListener('focus', () => {
    if (!adsRuntime()?.state?.()?.adPlaying) claimPendingBreakNow();
  });

  window.StashboxV2AdsCadenceGuard = Object.freeze({
    refresh: () => adsRuntime()?.refresh?.(),
    state: () => adsRuntime()?.state?.(),
    claim: claimPendingBreakNow
  });
})();
