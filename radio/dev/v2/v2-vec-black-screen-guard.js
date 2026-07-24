(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const STYLE_ID = 'v2-vec-black-screen-guard-style';
  const BOUND = 'vecBlackScreenGuardBound';
  const frameState = new WeakMap();

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .v2-mobile-vec-stage {
        background-position: center !important;
        background-repeat: no-repeat !important;
        background-size: cover !important;
      }
      .v2-mobile-vec-stage video.v2-mobile-vec-media:not(.v2-vec-frame-ready) {
        opacity: 0 !important;
      }
      .v2-mobile-vec-stage video.v2-mobile-vec-media.v2-vec-frame-ready.is-active {
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function currentPlayer() {
    return app.querySelector('[data-player]');
  }

  function audioFor(player) {
    return player?.querySelector('[data-audio]') || null;
  }

  function artworkBackground(player) {
    const backdrop = player?.querySelector('[data-backdrop]');
    const inline = backdrop?.style?.backgroundImage || '';
    if (inline && inline !== 'none') return inline;
    const computed = backdrop ? getComputedStyle(backdrop).backgroundImage : '';
    if (computed && computed !== 'none') return computed;
    const avatar = player?.querySelector('[data-avatar] img, .v2-mini-avatar img');
    return avatar?.src ? `url("${avatar.src.replaceAll('"', '%22')}")` : '';
  }

  function artworkUrl(player) {
    const background = artworkBackground(player);
    const match = background.match(/url\((['"]?)(.*?)\1\)/i);
    return match?.[2] || '';
  }

  function stageFor(player) {
    return player?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function syncStageFallback(player = currentPlayer()) {
    const stage = stageFor(player);
    if (!stage) return;
    const background = artworkBackground(player);
    if (background && background !== 'none' && stage.style.backgroundImage !== background) {
      stage.style.backgroundImage = background;
    }
    const poster = artworkUrl(player);
    if (poster) {
      stage.querySelectorAll('video.v2-mobile-vec-media').forEach(video => {
        if (!video.poster) video.poster = poster;
      });
    }
  }

  function canRunVideo(video) {
    const player = video.closest('[data-player]');
    const audio = audioFor(player);
    return Boolean(
      player &&
      !player.hidden &&
      video.isConnected &&
      video.classList.contains('is-active') &&
      audio &&
      !audio.paused &&
      !audio.ended
    );
  }

  function prepareVideo(video) {
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.playsInline = true;
    video.autoplay = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    const poster = artworkUrl(video.closest('[data-player]'));
    if (poster) video.poster = poster;
  }

  function revealVideo(video) {
    if (!video?.isConnected) return;
    video.classList.add('v2-vec-frame-ready');
  }

  function watchRenderedFrames(video) {
    const state = frameState.get(video);
    if (!state || state.revealed || !video.isConnected) return;

    if (typeof video.requestVideoFrameCallback === 'function') {
      const inspect = (_now, metadata = {}) => {
        const current = Number(metadata.mediaTime ?? video.currentTime ?? 0);
        if (state.firstFrameTime == null) state.firstFrameTime = current;
        if (current > state.firstFrameTime + 0.015 || video.currentTime > 0.04) {
          state.revealed = true;
          revealVideo(video);
          return;
        }
        if (state.frameChecks < 20 && video.isConnected && !video.paused) {
          state.frameChecks += 1;
          video.requestVideoFrameCallback(inspect);
        }
      };
      state.frameChecks += 1;
      video.requestVideoFrameCallback(inspect);
      return;
    }

    const startedAt = Number(video.currentTime || 0);
    const timer = window.setInterval(() => {
      if (!video.isConnected || state.revealed) {
        clearInterval(timer);
        return;
      }
      if (!video.paused && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime > startedAt + 0.03) {
        state.revealed = true;
        revealVideo(video);
        clearInterval(timer);
      }
    }, 80);
    state.progressTimer = timer;
  }

  function attemptPlayback(video) {
    if (!canRunVideo(video)) return;
    prepareVideo(video);
    if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
      try { video.load(); } catch (_) {}
    }
    const result = video.play();
    if (result?.catch) result.catch(() => {});
  }

  function schedulePlayback(video) {
    const state = frameState.get(video);
    if (!state) return;
    state.retryTimers.forEach(timer => clearTimeout(timer));
    state.retryTimers = [0, 120, 400, 900, 1800, 3200].map(delay => window.setTimeout(() => {
      if (!video.isConnected || frameState.get(video)?.revealed) return;
      attemptPlayback(video);
    }, delay));
  }

  function bindVideo(video) {
    if (!(video instanceof HTMLVideoElement) || video.dataset[BOUND] === 'true') return;
    video.dataset[BOUND] = 'true';
    video.classList.remove('v2-vec-frame-ready');
    frameState.set(video, {
      revealed: false,
      firstFrameTime: null,
      frameChecks: 0,
      progressTimer: 0,
      retryTimers: []
    });
    prepareVideo(video);

    video.onstalled = () => schedulePlayback(video);

    video.addEventListener('playing', () => watchRenderedFrames(video));
    video.addEventListener('timeupdate', () => {
      const state = frameState.get(video);
      if (state && !state.revealed && video.currentTime > 0.04) {
        state.revealed = true;
        revealVideo(video);
      }
    });
    video.addEventListener('loadeddata', () => schedulePlayback(video));
    video.addEventListener('canplay', () => schedulePlayback(video));
    video.addEventListener('waiting', () => {
      if (!frameState.get(video)?.revealed) schedulePlayback(video);
    });
    video.addEventListener('pause', () => {
      if (!frameState.get(video)?.revealed && canRunVideo(video)) schedulePlayback(video);
    });
    video.addEventListener('error', () => {
      video.classList.remove('v2-vec-frame-ready');
    });

    schedulePlayback(video);
  }

  function bindPlayer(player = currentPlayer()) {
    if (!player) return;
    syncStageFallback(player);
    stageFor(player)?.querySelectorAll('video.v2-mobile-vec-media').forEach(bindVideo);

    const audio = audioFor(player);
    if (audio && audio.dataset.vecBlackScreenAudioBound !== 'true') {
      audio.dataset.vecBlackScreenAudioBound = 'true';
      audio.addEventListener('play', () => {
        window.setTimeout(() => {
          syncStageFallback(player);
          stageFor(player)?.querySelectorAll('video.v2-mobile-vec-media').forEach(video => {
            bindVideo(video);
            schedulePlayback(video);
          });
        }, 80);
      });
      audio.addEventListener('playing', () => {
        stageFor(player)?.querySelectorAll('video.v2-mobile-vec-media').forEach(schedulePlayback);
      });
    }
  }

  installStyles();

  const observer = new MutationObserver(() => bindPlayer());
  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'style']
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) bindPlayer();
  });
  window.addEventListener('resize', () => bindPlayer());
  window.setInterval(() => bindPlayer(), 500);

  bindPlayer();
})();