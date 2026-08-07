(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(max-width: 899px)').matches) return;
  if (window.StashboxMobileVecFlickerGuard) return;

  const app = document.getElementById('v2App');
  if (!app) return;

  const state = {
    player: null,
    stage: null,
    songKey: '',
    artworkUrl: '',
    frame: 0,
    timer: 0,
  };

  function visible(node) {
    if (!node || !node.isConnected || node.hidden) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function activePlayer() {
    const audio = [...app.querySelectorAll('audio')].find(item => !item.paused && !item.ended);
    const audioPlayer = audio?.closest?.('[data-player]');
    if (visible(audioPlayer)) return audioPlayer;
    return [...app.querySelectorAll('[data-player]')].find(visible) || null;
  }

  function cleanUrl(value) {
    return String(value || '')
      .trim()
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace(/\?dl=[01]/, '');
  }

  function backgroundUrl(stage) {
    const value = stage?.style?.backgroundImage || getComputedStyle(stage || document.body).backgroundImage || '';
    const match = value.match(/^url\(["']?(.*?)["']?\)$/i);
    return cleanUrl(match?.[1] || '');
  }

  function artworkCandidate(stage) {
    const image = [...(stage?.querySelectorAll('img.v2-mobile-vec-media, img') || [])]
      .find(item => cleanUrl(item.currentSrc || item.src));
    return cleanUrl(image?.currentSrc || image?.src || backgroundUrl(stage));
  }

  function songIdentity(player) {
    return String(
      player?.dataset?.mobileVecMotionSongKey ||
      player?.dataset?.songKey ||
      player?.dataset?.currentSongKey ||
      player?.querySelector('[data-ptitle]')?.textContent ||
      ''
    ).trim();
  }

  function installCss() {
    if (document.getElementById('v2-mobile-vec-flicker-guard-css')) return;
    const style = document.createElement('style');
    style.id = 'v2-mobile-vec-flicker-guard-css';
    style.textContent = `
      @media (max-width: 899px) {
        #v2App [data-player].vec-presentation-stable [data-mobile-vec-stage],
        #v2App [data-player].vec-presentation-stable [data-mobile-vec-stage]::before,
        #v2App [data-player].vec-presentation-stable [data-mobile-vec-stage]::after {
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].vec-stable-artwork [data-mobile-vec-stage] img.v2-mobile-vec-media {
          visibility: visible !important;
          opacity: 1 !important;
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].vec-stable-artwork .mobile-vec-motion-video {
          visibility: hidden !important;
          opacity: 0 !important;
          transition: none !important;
        }

        #v2App [data-player].vec-stable-video [data-mobile-vec-stage] .v2-mobile-vec-media {
          visibility: hidden !important;
          opacity: 0 !important;
          transition: none !important;
          animation: none !important;
        }

        #v2App [data-player].vec-stable-video .mobile-vec-motion-video.is-moving {
          visibility: visible !important;
          opacity: 1 !important;
          transition: none !important;
          animation: none !important;
          background: #050607 !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function applyStableArtwork(stage, url) {
    const source = cleanUrl(url);
    if (!stage || !source) return;
    const encoded = source.replaceAll('"', '%22');
    const next = `url("${encoded}")`;
    if (stage.style.backgroundImage !== next) stage.style.backgroundImage = next;
    if (stage.style.backgroundPosition !== 'center center') stage.style.backgroundPosition = 'center center';
    if (stage.style.backgroundRepeat !== 'no-repeat') stage.style.backgroundRepeat = 'no-repeat';
    if (stage.style.backgroundSize !== 'cover') stage.style.backgroundSize = 'cover';
    if (stage.style.backgroundColor !== 'rgb(5, 6, 7)') stage.style.backgroundColor = '#050607';
  }

  function stabilize() {
    const player = activePlayer();
    const stage = player?.querySelector('[data-mobile-vec-stage]') || null;
    if (!player || !stage) return;

    state.player = player;
    state.stage = stage;
    player.classList.add('vec-presentation-stable');

    const key = songIdentity(player);
    if (key && key !== state.songKey) {
      state.songKey = key;
      state.artworkUrl = '';
    }

    const customVideo = stage.querySelector('.mobile-vec-motion-video');
    const moving = Boolean(
      customVideo &&
      customVideo.classList.contains('is-moving') &&
      !customVideo.paused &&
      !customVideo.ended &&
      Number(customVideo.currentTime || 0) > 0.04
    );

    if (moving) {
      player.classList.add('vec-stable-video');
      player.classList.remove('vec-stable-artwork');
      return;
    }

    player.classList.add('vec-stable-artwork');
    player.classList.remove('vec-stable-video');

    const candidate = artworkCandidate(stage);
    if (!state.artworkUrl && candidate) state.artworkUrl = candidate;
    if (state.artworkUrl) applyStableArtwork(stage, state.artworkUrl);
  }

  function schedule() {
    cancelAnimationFrame(state.frame);
    state.frame = requestAnimationFrame(stabilize);
  }

  const observer = new MutationObserver(schedule);
  observer.observe(app, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'src', 'data-song-key', 'data-mobile-vec-motion-song-key'],
  });

  document.addEventListener('play', schedule, true);
  document.addEventListener('pause', schedule, true);
  window.addEventListener('stashbox:vec-asset-change', schedule, true);
  window.addEventListener('stashbox:player-view-mode-change', schedule, true);
  window.addEventListener('orientationchange', () => setTimeout(schedule, 120), { passive: true });

  installCss();
  state.timer = window.setInterval(stabilize, 250);
  stabilize();

  window.StashboxMobileVecFlickerGuard = Object.freeze({
    refresh: schedule,
    state: () => ({
      songKey: state.songKey,
      artworkUrl: state.artworkUrl,
      mode: state.player?.classList.contains('vec-stable-video') ? 'video' : 'artwork',
    }),
    stop: () => {
      clearInterval(state.timer);
      observer.disconnect();
      state.player?.classList.remove('vec-presentation-stable', 'vec-stable-artwork', 'vec-stable-video');
    },
  });
})();