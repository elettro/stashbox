(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (window.StashboxV2AdsCadenceGuard) return;

  const refreshedGeneration = new WeakMap();
  const rescueAttempts = new WeakMap();

  const isPlayerAudio = audio => audio instanceof HTMLAudioElement && Boolean(audio.closest('#v2App [data-player]'));
  const adsRuntime = () => window.StashboxV2Ads;
  const generationKey = audio => `${audio.currentSrc || audio.src || ''}|${Number(audio.duration || 0).toFixed(2)}`;

  function refreshBeforeBoundary(audio) {
    if (!isPlayerAudio(audio)) return;
    const duration = Number(audio.duration || 0);
    const current = Number(audio.currentTime || 0);
    if (!Number.isFinite(duration) || duration <= 0 || duration - current > 6) return;

    const key = generationKey(audio);
    if (refreshedGeneration.get(audio) === key) return;
    refreshedGeneration.set(audio, key);

    // Re-read the authoritative Ads CMS before the natural completion boundary.
    // This keeps "after every song/video" tied to the CMS instead of stale page state.
    try { adsRuntime()?.refresh?.(); } catch (_) {}
  }

  function rescueOwedBreak(audio) {
    if (!isPlayerAudio(audio)) return;
    const ads = adsRuntime();
    const snapshot = ads?.state?.();
    if (!snapshot?.enabled || !snapshot.breakPending || snapshot.adPlaying) return;

    const key = `${audio.currentSrc || audio.src || ''}|${Math.floor(Number(audio.currentTime || 0))}`;
    const previous = rescueAttempts.get(audio);
    if (previous?.key === key && previous.count >= 2) return;
    const count = previous?.key === key ? previous.count + 1 : 1;
    rescueAttempts.set(audio, { key, count });

    // If a reused <audio> element emitted its first play signal while still in
    // the old ended generation, pause and restart it once. The existing Ads
    // runtime then sees a clean new-generation play event and claims the owed break.
    try { audio.pause(); } catch (_) {}
    window.setTimeout(() => {
      const current = adsRuntime()?.state?.();
      if (!current?.enabled || !current.breakPending || current.adPlaying || !audio.isConnected) return;
      try { audio.play().catch(() => {}); } catch (_) {}
    }, count === 1 ? 25 : 90);
  }

  document.addEventListener('timeupdate', event => refreshBeforeBoundary(event.target), true);

  ['play', 'playing'].forEach(type => {
    document.addEventListener(type, event => {
      const audio = event.target;
      if (!isPlayerAudio(audio)) return;
      window.setTimeout(() => rescueOwedBreak(audio), 0);
    }, true);
  });

  window.StashboxV2AdsCadenceGuard = Object.freeze({
    refresh: () => adsRuntime()?.refresh?.(),
    state: () => adsRuntime()?.state?.()
  });
})();
