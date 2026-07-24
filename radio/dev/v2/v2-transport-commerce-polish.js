(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  function player() {
    return app.querySelector('[data-player]');
  }

  function audioElement(currentPlayer = player()) {
    return currentPlayer?.querySelector('[data-audio]') || null;
  }

  function vecVideos(currentPlayer = player()) {
    return [...(currentPlayer?.querySelectorAll('[data-mobile-vec-stage] video') || [])];
  }

  function activeVecVideo(currentPlayer = player()) {
    const videos = vecVideos(currentPlayer);
    return videos.reverse().find(video => video.classList.contains('is-active')) || videos.at(-1) || null;
  }

  function pauseVec(currentPlayer = player()) {
    if (!currentPlayer) return;
    currentPlayer.dataset.vecTransportPaused = 'true';
    vecVideos(currentPlayer).forEach(video => {
      if (video.paused) return;
      try { video.pause(); } catch (_) {}
    });
  }

  function resumeVec(currentPlayer = player()) {
    const audio = audioElement(currentPlayer);
    if (!currentPlayer || !audio || audio.paused || audio.ended) return;
    currentPlayer.dataset.vecTransportPaused = 'false';
    const video = activeVecVideo(currentPlayer);
    if (!video || video.ended || !video.isConnected) return;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.play().catch(() => {});
  }

  function bindAudio(currentPlayer = player()) {
    const audio = audioElement(currentPlayer);
    if (!audio || audio.dataset.masterVecTransportBound === 'true') return;
    audio.dataset.masterVecTransportBound = 'true';

    audio.addEventListener('pause', () => pauseVec(currentPlayer));
    audio.addEventListener('ended', () => pauseVec(currentPlayer));
    audio.addEventListener('emptied', () => pauseVec(currentPlayer));
    audio.addEventListener('play', () => window.setTimeout(() => resumeVec(currentPlayer), 80));

    if (audio.paused) pauseVec(currentPlayer);
  }

  function enforceNewVideo(video) {
    const currentPlayer = video.closest('[data-player]');
    const audio = audioElement(currentPlayer);
    if (!audio) return;

    video.addEventListener('play', () => {
      if (audio.paused || audio.ended) {
        try { video.pause(); } catch (_) {}
      }
    });

    if (audio.paused || audio.ended) {
      try { video.pause(); } catch (_) {}
    }
  }

  function updateCommerceLayout(root = app) {
    root.querySelectorAll('[data-vec-clip-commerce]').forEach(tray => {
      const count = tray.querySelectorAll('.v2-vec-clip-product').length;
      tray.classList.toggle('is-single-product', count === 1);
      tray.classList.toggle('is-multiple-products', count > 1);
    });
  }

  const observer = new MutationObserver(mutations => {
    bindAudio();
    for (const mutation of mutations) {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches('[data-mobile-vec-stage] video')) enforceNewVideo(node);
        node.querySelectorAll?.('[data-mobile-vec-stage] video').forEach(enforceNewVideo);
      });
    }
    updateCommerceLayout();
  });

  observer.observe(app, { childList: true, subtree: true });

  document.addEventListener('play', event => {
    const video = event.target;
    if (!(video instanceof HTMLVideoElement) || !video.closest('[data-mobile-vec-stage]')) return;
    const currentPlayer = video.closest('[data-player]');
    const audio = audioElement(currentPlayer);
    if (audio && (audio.paused || audio.ended)) {
      try { video.pause(); } catch (_) {}
    }
  }, true);

  window.setInterval(() => {
    const currentPlayer = player();
    const audio = audioElement(currentPlayer);
    if (!currentPlayer || !audio) return;
    if (audio.paused || audio.ended) pauseVec(currentPlayer);
  }, 250);

  bindAudio();
  vecVideos().forEach(enforceNewVideo);
  updateCommerceLayout();
})();
