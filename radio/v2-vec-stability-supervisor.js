(() => {
  'use strict';

  if (window.StashboxVecStabilitySupervisor) return;

  const CHECK_MS = 400;
  const VIDEO_EXPECTED_AFTER_SECONDS = 6.25;
  const STALL_SECONDS = 3.25;
  const MAX_INTERVENTIONS = 3;
  const INTERVENTION_WINDOW_MS = 20000;
  const COOLDOWN_MS = 8000;

  const state = {
    mode: '',
    root: null,
    stage: null,
    audio: null,
    identity: '',
    lastAudioTime: 0,
    lastAudioAdvanceAt: 0,
    lastVideoTime: 0,
    lastVideoAdvanceAt: 0,
    lastRefreshAt: 0,
    interventions: [],
    cooldownUntil: 0,
    timer: 0,
    observer: null,
    state: 'idle',
    reason: ''
  };

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

  function visible(node) {
    if (!node || node.hidden || !node.isConnected) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function detectMode() {
    return location.pathname.includes('/radio/artist/') ? 'artist' : 'main';
  }

  function findRoot(mode = detectMode()) {
    if (mode === 'artist') {
      return [...document.querySelectorAll('.artist-realm-player')].find(visible) || null;
    }
    return [...document.querySelectorAll('#v2App [data-player]')].find(visible) || null;
  }

  function findStage(root, mode) {
    return mode === 'artist'
      ? root?.querySelector('[data-realm-stage]') || null
      : root?.querySelector('[data-mobile-vec-stage]') || null;
  }

  function findAudio(root) {
    const local = root?.querySelector('audio,[data-audio]');
    if (local) return local;
    return [...document.querySelectorAll('audio')].find(audio => !audio.paused && !audio.ended) || null;
  }

  function identity(root, mode) {
    const title = mode === 'artist'
      ? root?.querySelector('[data-realm-title]')?.textContent
      : root?.querySelector('[data-ptitle]')?.textContent;
    const artist = mode === 'artist'
      ? root?.querySelector('[data-realm-artist]')?.textContent
      : root?.querySelector('[data-partist]')?.textContent;
    const key = clean(root?.dataset?.songKey || root?.dataset?.currentSongKey || root?.dataset?.song);
    const source = clean(findAudio(root)?.currentSrc || findAudio(root)?.src);
    return [normalize(key), normalize(artist), normalize(title), source].join('|');
  }

  function watchdog(mode) {
    return mode === 'artist'
      ? window.StashboxArtistVecVideoWatchdog
      : window.StashboxMainVecVideoWatchdog;
  }

  function videos(stage) {
    return [...(stage?.querySelectorAll('video') || [])].filter(video => video.isConnected);
  }

  function videoVisible(video) {
    if (!visible(video)) return false;
    const style = getComputedStyle(video);
    return Number(style.opacity || 0) > 0.04;
  }

  function activeVideo(stage) {
    return videos(stage).find(video => (
      videoVisible(video) &&
      !video.paused &&
      !video.ended &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    )) || null;
  }

  function bestVideo(stage) {
    return videos(stage)
      .filter(video => !video.ended && video.readyState >= HTMLMediaElement.HAVE_METADATA)
      .sort((a, b) => {
        const score = video =>
          (videoVisible(video) ? 8 : 0) +
          (!video.paused ? 4 : 0) +
          (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? 2 : 0) +
          (video.dataset.mainVecWatchdog || video.dataset.artistVecWatchdog ? 1 : 0);
        return score(b) - score(a);
      })[0] || null;
  }

  function cleanupDuplicateRescueVideos(stage) {
    const rescue = videos(stage).filter(video => (
      video.matches('.v2-main-watchdog-video,.artist-realm-watchdog-video') ||
      video.dataset.mainVecWatchdog === 'true' ||
      video.dataset.artistVecWatchdog === 'true'
    ));
    if (rescue.length <= 1) return;
    const keep = rescue.find(video => !video.paused && !video.ended) || rescue.at(-1);
    rescue.forEach(video => {
      if (video === keep) return;
      try { video.pause(); } catch (_) {}
      video.removeAttribute('src');
      try { video.load(); } catch (_) {}
      video.remove();
    });
  }

  function setStatus(value, reason = '') {
    state.state = value;
    state.reason = reason;
    if (!state.root) return;
    state.root.dataset.vecSupervisorState = value;
    state.root.dataset.vecSupervisorReason = reason;
    state.root.dataset.vecSupervisorInterventions = String(state.interventions.length);
    state.root.dataset.vecSupervisorCooldownUntil = state.cooldownUntil ? String(state.cooldownUntil) : '';
  }

  function resetForIdentity(nextIdentity) {
    state.identity = nextIdentity;
    state.lastAudioTime = 0;
    state.lastAudioAdvanceAt = performance.now();
    state.lastVideoTime = 0;
    state.lastVideoAdvanceAt = performance.now();
    state.lastRefreshAt = 0;
    state.interventions = [];
    state.cooldownUntil = 0;
    setStatus('armed', 'song-change');
  }

  function pruneInterventions(now = Date.now()) {
    state.interventions = state.interventions.filter(time => now - time <= INTERVENTION_WINDOW_MS);
  }

  function recordIntervention(reason) {
    const now = Date.now();
    pruneInterventions(now);
    state.interventions.push(now);
    if (state.interventions.length >= MAX_INTERVENTIONS) {
      state.cooldownUntil = now + COOLDOWN_MS;
      setStatus('cooldown', reason);
      return false;
    }
    setStatus('recovering', reason);
    return true;
  }

  function refreshWatchdog(reason) {
    const now = Date.now();
    if (now < state.cooldownUntil || now - state.lastRefreshAt < 1400) return;
    if (!recordIntervention(reason)) return;
    state.lastRefreshAt = now;
    const controller = watchdog(state.mode);
    try {
      controller?.refresh?.();
    } catch (error) {
      console.warn('[VEC stability supervisor] Refresh failed.', error?.message || error);
    }
  }

  function attemptVideoResume(video, reason) {
    if (!video || !state.audio || state.audio.paused || state.audio.ended) return;
    if (!recordIntervention(reason)) return;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.style.setProperty('object-fit', 'contain', 'important');
    video.style.setProperty('object-position', 'center center', 'important');
    video.style.setProperty('visibility', 'visible', 'important');
    video.style.setProperty('opacity', '1', 'important');
    try {
      const request = video.play();
      request?.catch?.(() => refreshWatchdog('video-play-rejected'));
    } catch (_) {
      refreshWatchdog('video-play-threw');
    }
  }

  function updateClock(media, timeKey, advanceKey, now) {
    const current = Number(media?.currentTime || 0);
    if (current > state[timeKey] + 0.08) {
      state[timeKey] = current;
      state[advanceKey] = now;
      return true;
    }
    return false;
  }

  function bindStage(stage) {
    if (state.stage === stage && state.observer) return;
    state.observer?.disconnect();
    state.stage = stage;
    state.observer = new MutationObserver(() => {
      cleanupDuplicateRescueVideos(stage);
      const current = activeVideo(stage);
      if (current) setStatus('video-playing', 'mutation');
    });
    state.observer.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'src'] });
  }

  function tick() {
    const mode = detectMode();
    const root = findRoot(mode);
    const stage = findStage(root, mode);
    if (!root || !stage) {
      state.root = root;
      state.stage = stage;
      setStatus('waiting-for-player', 'player-or-stage-missing');
      return;
    }

    state.mode = mode;
    state.root = root;
    bindStage(stage);
    cleanupDuplicateRescueVideos(stage);

    const nextIdentity = identity(root, mode);
    if (nextIdentity && nextIdentity !== state.identity) resetForIdentity(nextIdentity);

    const audio = findAudio(root);
    state.audio = audio;
    if (!audio || audio.paused || audio.ended) {
      setStatus('waiting-for-audio', 'audio-not-playing');
      return;
    }

    const now = performance.now();
    updateClock(audio, 'lastAudioTime', 'lastAudioAdvanceAt', now);
    if (now - state.lastAudioAdvanceAt > STALL_SECONDS * 1000) {
      setStatus('audio-stalled', 'audio-time-not-advancing');
      return;
    }

    const currentVideo = activeVideo(stage);
    if (currentVideo) {
      updateClock(currentVideo, 'lastVideoTime', 'lastVideoAdvanceAt', now);
      currentVideo.style.setProperty('object-fit', 'contain', 'important');
      currentVideo.style.setProperty('object-position', 'center center', 'important');
      if (now - state.lastVideoAdvanceAt > STALL_SECONDS * 1000) {
        attemptVideoResume(currentVideo, 'video-time-not-advancing');
      } else {
        pruneInterventions();
        setStatus('video-playing', 'healthy');
      }
      return;
    }

    const candidate = bestVideo(stage);
    if (candidate && Number(audio.currentTime || 0) >= VIDEO_EXPECTED_AFTER_SECONDS) {
      attemptVideoResume(candidate, 'video-present-but-paused');
      return;
    }

    if (Number(audio.currentTime || 0) >= VIDEO_EXPECTED_AFTER_SECONDS) {
      refreshWatchdog('video-missing-after-intro');
      return;
    }

    setStatus('artwork-intro', 'within-intro-window');
  }

  state.timer = window.setInterval(tick, CHECK_MS);
  ['play', 'playing', 'loadeddata', 'canplay', 'stalled', 'waiting', 'error'].forEach(eventName => {
    document.addEventListener(eventName, event => {
      if (event.target instanceof HTMLAudioElement || event.target instanceof HTMLVideoElement) tick();
    }, true);
  });
  window.addEventListener('focus', tick);
  window.addEventListener('online', tick);
  window.addEventListener('resize', tick, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });

  tick();

  window.StashboxVecStabilitySupervisor = Object.freeze({
    refresh: () => {
      state.identity = '';
      tick();
    },
    state: () => ({
      mode: state.mode,
      identity: state.identity,
      status: state.state,
      reason: state.reason,
      interventionCount: state.interventions.length,
      cooldownUntil: state.cooldownUntil
    }),
    stop: () => {
      window.clearInterval(state.timer);
      state.observer?.disconnect();
    }
  });
})();