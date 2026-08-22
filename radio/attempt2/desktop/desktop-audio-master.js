(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches || window.StashboxDesktopAudioMaster) return;

  const inPlayer = audio => audio instanceof HTMLAudioElement && Boolean(audio.closest('#v2App [data-player]'));
  const activeVideo = audio => audio?.closest('#v2App [data-player]')?.querySelector('.desktop-vec2-layer.is-current video') || null;

  function syncRate(audio, video = activeVideo(audio)) {
    if (!audio || !video) return;
    const rate = Number(audio.playbackRate || 1);
    if (Number.isFinite(rate) && rate > 0 && video.playbackRate !== rate) video.playbackRate = rate;
  }

  function freeze(audio, reason) {
    if (!inPlayer(audio)) return;
    const video = activeVideo(audio);
    if (video && !video.paused) {
      try { video.pause(); } catch (_) {}
    }
    window.dispatchEvent(new CustomEvent('stashbox:desktop-audio-master', {
      detail: { type: 'freeze', reason, audioTime: Number(audio.currentTime || 0) }
    }));
  }

  function resume(audio, reason) {
    if (!inPlayer(audio) || audio.paused || audio.ended || audio.seeking || audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return;
    const video = activeVideo(audio);
    if (!video || video.ended) return;
    syncRate(audio, video);
    video.play().catch(() => {});
    window.dispatchEvent(new CustomEvent('stashbox:desktop-audio-master', {
      detail: { type: 'resume', reason, audioTime: Number(audio.currentTime || 0) }
    }));
  }

  document.addEventListener('waiting', event => {
    if (inPlayer(event.target)) freeze(event.target, 'audio-waiting');
  }, true);

  document.addEventListener('seeking', event => {
    if (inPlayer(event.target)) freeze(event.target, 'audio-seeking');
  }, true);

  document.addEventListener('stalled', event => {
    if (inPlayer(event.target) && event.target.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) freeze(event.target, 'audio-stalled');
  }, true);

  document.addEventListener('playing', event => {
    if (inPlayer(event.target)) resume(event.target, 'audio-playing');
  }, true);

  document.addEventListener('canplay', event => {
    if (inPlayer(event.target)) resume(event.target, 'audio-canplay');
  }, true);

  document.addEventListener('seeked', event => {
    if (inPlayer(event.target)) resume(event.target, 'audio-seeked');
  }, true);

  document.addEventListener('ratechange', event => {
    if (!inPlayer(event.target)) return;
    syncRate(event.target);
  }, true);

  window.StashboxDesktopAudioMaster = Object.freeze({
    freeze: reason => {
      const audio = document.querySelector('#v2App [data-player]:not([hidden]) audio');
      if (audio) freeze(audio, reason || 'manual');
    },
    resume: reason => {
      const audio = document.querySelector('#v2App [data-player]:not([hidden]) audio');
      if (audio) resume(audio, reason || 'manual');
    },
    state: () => {
      const audio = document.querySelector('#v2App [data-player]:not([hidden]) audio');
      const video = activeVideo(audio);
      return {
        audioTime: Number(audio?.currentTime || 0),
        audioPaused: Boolean(audio?.paused),
        audioSeeking: Boolean(audio?.seeking),
        audioReadyState: Number(audio?.readyState || 0),
        audioPlaybackRate: Number(audio?.playbackRate || 1),
        videoTime: Number(video?.currentTime || 0),
        videoPaused: Boolean(video?.paused),
        videoPlaybackRate: Number(video?.playbackRate || 1)
      };
    }
  });
})();
