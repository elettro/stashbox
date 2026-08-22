(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const MOBILE = window.matchMedia('(max-width: 699px)');
  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  let resumeTimer = 0;

  function loggedIn() {
    try {
      const tokens = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
      return Boolean(tokens.accessToken);
    } catch (_) {
      return false;
    }
  }

  function activePlayer() {
    const player = app.querySelector('[data-player]');
    if (!player || player.hidden || !player.classList.contains('is-logged-in-player')) return null;
    return player;
  }

  function songAudio(player) {
    return player?.querySelector('[data-audio]') || null;
  }

  function activeVecVideo(player) {
    const videos = [...(player?.querySelectorAll('[data-mobile-vec-stage] video.v2-mobile-vec-media') || [])];
    return videos.reverse().find(video => video.classList.contains('is-active')) || videos.at(-1) || null;
  }

  function pauseVec(player) {
    window.clearTimeout(resumeTimer);
    resumeTimer = 0;
    const video = activeVecVideo(player);
    if (!video || video.paused) return video;
    try { video.pause(); } catch (_) {}
    return video;
  }

  function resumeVecAfterAudio(player, audio, video) {
    if (!video || video.ended || !video.isConnected) return;
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => {
      resumeTimer = 0;
      if (!player.isConnected || player.hidden || audio.paused || audio.ended) return;
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.play().catch(() => {});
    }, 180);
  }

  async function togglePrimaryMedia(player) {
    const audio = songAudio(player);
    if (!audio) return;

    const video = pauseVec(player);
    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
      resumeVecAfterAudio(player, audio, video);
    } catch (error) {
      pauseVec(player);
      console.warn('[V2 mobile media sync] Song resume failed', error?.message || error);
    }
  }

  document.addEventListener('click', event => {
    if (!MOBILE.matches || !loggedIn()) return;
    const button = event.target.closest('#v2App .v2-player.is-logged-in-player [data-play]');
    if (!button) return;
    const player = activePlayer();
    if (!player || !player.contains(button)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    togglePrimaryMedia(player).catch(() => {});
  }, true);

  function bindAudio() {
    const player = activePlayer() || app.querySelector('[data-player]');
    const audio = songAudio(player);
    if (!audio || audio.dataset.vecAudioSyncBound === 'true') return;
    audio.dataset.vecAudioSyncBound = 'true';

    audio.addEventListener('pause', () => pauseVec(player));
    audio.addEventListener('ended', () => pauseVec(player));
    audio.addEventListener('emptied', () => pauseVec(player));
  }

  new MutationObserver(bindAudio).observe(app, { childList: true, subtree: true });
  bindAudio();
})();
