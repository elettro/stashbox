(() => {
  'use strict';

  if (!location.pathname.includes('/radio/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopVideoBlackoutGuard20260815) return;

  const app = document.getElementById('v2App');
  if (!app) return;

  let lastRecovery = 0;
  let lastVideoSeen = 0;

  function visiblePlayer() {
    return [...app.querySelectorAll('[data-player]')].find(player => {
      if (!player || player.hidden) return false;
      const style = getComputedStyle(player);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }) || null;
  }

  function audioFor(player) {
    return player?.querySelector('[data-audio]') || [...app.querySelectorAll('audio')].find(audio => !audio.paused && !audio.ended) || null;
  }

  function videoCandidates(stage) {
    return [...(stage?.querySelectorAll('video') || [])].filter(video => video.isConnected);
  }

  function bestVideo(stage) {
    const videos = videoCandidates(stage);
    return videos.find(video => !video.paused && !video.ended && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
      || videos.find(video => video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
      || videos.find(video => Boolean(video.currentSrc || video.src))
      || null;
  }

  function showVideo(player, stage, video) {
    if (!player || !stage || !video) return false;
    const ready = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA || video.videoWidth > 0 || video.videoHeight > 0;
    if (!ready) return false;

    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');

    player.classList.add('is-vec-active', 'is-mobile-vec-active', 'responsive-artwork-ready');
    stage.classList.add('responsive-artwork-surface-ready');
    stage.style.setProperty('background', 'transparent', 'important');
    stage.style.setProperty('background-color', 'transparent', 'important');
    stage.style.setProperty('opacity', '1', 'important');
    stage.style.setProperty('visibility', 'visible', 'important');
    stage.style.setProperty('z-index', '-1', 'important');

    video.style.setProperty('display', 'block', 'important');
    video.style.setProperty('visibility', 'visible', 'important');
    video.style.setProperty('opacity', '1', 'important');
    video.style.setProperty('z-index', '1', 'important');
    video.style.setProperty('width', '100%', 'important');
    video.style.setProperty('height', '100%', 'important');
    video.style.setProperty('object-fit', 'contain', 'important');
    video.style.setProperty('object-position', 'center center', 'important');

    const backdrop = player.querySelector('[data-player-backdrop], [data-backdrop]');
    if (backdrop) backdrop.style.setProperty('opacity', '0', 'important');

    const audio = audioFor(player);
    if (audio && !audio.paused && !audio.ended && video.paused && !video.ended) {
      video.play().catch(() => {});
    }

    player.dataset.desktopVideoBlackoutGuard = 'video-visible';
    lastVideoSeen = performance.now();
    return true;
  }

  function showArtworkFallback(player, stage) {
    if (!player) return;
    if (stage) {
      stage.style.setProperty('background', 'transparent', 'important');
      stage.style.setProperty('background-color', 'transparent', 'important');
      stage.style.setProperty('opacity', '0', 'important');
      stage.style.setProperty('visibility', 'hidden', 'important');
      stage.style.setProperty('z-index', '-2', 'important');
    }
    const backdrop = player.querySelector('[data-player-backdrop], [data-backdrop]');
    if (backdrop) backdrop.style.setProperty('opacity', '1', 'important');
    player.dataset.desktopVideoBlackoutGuard = 'artwork-fallback';
  }

  function recover(player) {
    const now = performance.now();
    if (now - lastRecovery < 1200) return;
    lastRecovery = now;
    try { window.StashboxDesktopDirectVideoRescue20260815?.refresh?.(); } catch (_) {}
    try { window.StashboxMainVecVideoWatchdog?.refresh?.(); } catch (_) {}
    try { window.StashboxDesktopVideoForce20260815?.refresh?.(); } catch (_) {}
    player.dataset.desktopVideoBlackoutGuardRecovery = String(Date.now());
  }

  function tick() {
    const player = visiblePlayer();
    if (!player) return;
    const audio = audioFor(player);
    const stage = player.querySelector('[data-mobile-vec-stage]');
    if (!audio || audio.paused || audio.ended) return;

    const video = bestVideo(stage);
    if (video && showVideo(player, stage, video)) return;

    recover(player);

    const current = Number(audio.currentTime || 0);
    const quietFor = performance.now() - lastVideoSeen;
    if (current > 1.25 && quietFor > 900) showArtworkFallback(player, stage);
  }

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) {
      setTimeout(tick, 50);
      setTimeout(tick, 300);
      setTimeout(tick, 900);
      setTimeout(tick, 1800);
    }
  }, true);

  const observer = new MutationObserver(() => requestAnimationFrame(tick));
  observer.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'src', 'hidden'] });
  const timer = setInterval(tick, 200);
  tick();

  window.StashboxDesktopVideoBlackoutGuard20260815 = Object.freeze({
    refresh: tick,
    stop: () => { clearInterval(timer); observer.disconnect(); }
  });
})();