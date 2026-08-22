(() => {
  'use strict';

  if (!location.pathname.includes('/radio/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopVideoForce20260815) return;

  const app = document.getElementById('v2App');
  if (!app) return;

  const querySong = new URLSearchParams(location.search).get('song') || '';

  function activePlayer() {
    const playingAudio = [...app.querySelectorAll('audio, audio[data-audio]')]
      .find(audio => !audio.paused && !audio.ended);
    const fromAudio = playingAudio?.closest?.('[data-player]');
    if (fromAudio && !fromAudio.hidden && getComputedStyle(fromAudio).display !== 'none') return fromAudio;
    return [...app.querySelectorAll('[data-player]')].find(player => !player.hidden && getComputedStyle(player).display !== 'none') || null;
  }

  function forceSongIdentity(player) {
    if (!player || !querySong) return;
    if (player.dataset.songKey !== querySong) player.dataset.songKey = querySong;
    if (player.dataset.currentSongKey !== querySong) player.dataset.currentSongKey = querySong;
  }

  function forceVideoSurface(player) {
    if (!player) return;
    const stage = player.querySelector('[data-mobile-vec-stage]');
    if (!stage) return;
    const video = stage.querySelector('video[data-desktop-vec-emergency="true"], video[data-main-vec-watchdog="true"], video.v2-mobile-vec-media.is-active');
    if (!video) return;

    const playing = !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
    if (!playing) return;

    player.classList.add('is-vec-active', 'is-mobile-vec-active');
    player.dataset.desktopVideoForce = 'playing';
    stage.classList.add('responsive-artwork-surface-ready');
    player.classList.add('responsive-artwork-ready');
    stage.style.setProperty('opacity', '1', 'important');
    stage.style.setProperty('visibility', 'visible', 'important');
    stage.style.setProperty('z-index', '0', 'important');
    stage.style.setProperty('background-image', 'none', 'important');
    video.style.setProperty('opacity', '1', 'important');
    video.style.setProperty('visibility', 'visible', 'important');
    video.style.setProperty('display', 'block', 'important');
    video.style.setProperty('z-index', '40', 'important');
    video.style.setProperty('object-fit', 'contain', 'important');
    video.style.setProperty('object-position', 'center center', 'important');

    const backdrop = player.querySelector('[data-backdrop]');
    if (backdrop) backdrop.style.setProperty('opacity', '0', 'important');
  }

  function refreshRecovery(player) {
    if (!player) return;
    if (querySong) forceSongIdentity(player);
    window.StashboxMainVecVideoWatchdog?.refresh?.();
  }

  let lastRefresh = 0;
  function tick() {
    const player = activePlayer();
    if (!player) return;
    forceSongIdentity(player);
    forceVideoSurface(player);

    const audio = player.querySelector('[data-audio]') || [...app.querySelectorAll('audio')].find(a => !a.paused && !a.ended);
    if (audio && !audio.paused && Number(audio.currentTime || 0) > 2) {
      const stage = player.querySelector('[data-mobile-vec-stage]');
      const hasPlayingVideo = [...(stage?.querySelectorAll('video') || [])].some(video => !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
      if (!hasPlayingVideo && performance.now() - lastRefresh > 2500) {
        lastRefresh = performance.now();
        refreshRecovery(player);
      }
    }
  }

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) {
      const player = event.target.closest('[data-player]') || activePlayer();
      forceSongIdentity(player);
      setTimeout(() => refreshRecovery(player), 100);
      setTimeout(tick, 400);
      setTimeout(tick, 1200);
    }
  }, true);

  const observer = new MutationObserver(tick);
  observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  setInterval(tick, 250);
  tick();

  window.StashboxDesktopVideoForce20260815 = Object.freeze({ refresh: tick, song: querySong });
})();