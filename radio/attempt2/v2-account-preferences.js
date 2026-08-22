(() => {
  'use strict';

  const VEC_MODE_KEY = 'stashbox_v2_vec_mode';
  const SLEEP_END_KEY = 'stashbox_v2_sleep_timer_ends_at';
  let sleepHandledFor = 0;

  function applyVisualMode() {
    const mode = localStorage.getItem(VEC_MODE_KEY) === 'artwork' ? 'artwork' : 'full';
    document.documentElement.dataset.v2VisualMode = mode;
    document.body.dataset.v2VisualMode = mode;
  }

  function stopPlaybackAtTimer() {
    const endAt = Number(localStorage.getItem(SLEEP_END_KEY) || 0);
    if (!endAt || Date.now() < endAt || sleepHandledFor === endAt) return;
    sleepHandledFor = endAt;
    document.querySelectorAll('audio, video').forEach(media => {
      try { media.pause(); } catch (_) {}
    });
    document.querySelectorAll('[data-player-close], .v2-player-close').forEach(button => {
      if (button.offsetParent) {
        try { button.click(); } catch (_) {}
      }
    });
    localStorage.removeItem(SLEEP_END_KEY);
    window.dispatchEvent(new CustomEvent('stashbox:sleep-timer-complete'));
  }

  function openRequestedNotifications() {
    let requested = false;
    try {
      requested = sessionStorage.getItem('stashbox_v2_open_notifications') === '1';
      if (requested) sessionStorage.removeItem('stashbox_v2_open_notifications');
    } catch (_) {}
    requested = requested || new URLSearchParams(location.search).get('open_notifications') === '1';
    if (!requested) return;

    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const bell = document.querySelector('#v2App [data-notifications], #v2App .v2-header-notifications, #v2App button[aria-label*="notification" i]');
      if (bell) {
        window.clearInterval(timer);
        bell.click();
        const url = new URL(location.href);
        url.searchParams.delete('open_notifications');
        history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      } else if (attempts >= 200) {
        window.clearInterval(timer);
      }
    }, 50);
  }

  applyVisualMode();
  window.addEventListener('storage', event => {
    if (event.key === VEC_MODE_KEY) applyVisualMode();
  });
  window.setInterval(stopPlaybackAtTimer, 1000);
  stopPlaybackAtTimer();
  openRequestedNotifications();
})();
