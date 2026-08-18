(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  // Shared by both the mobile and clean desktop V2 shells. Keep play analytics
  // ownership here so one tracker instance covers both runtimes without touching
  // the separate Share implementations.
  if (!window.StashboxV2PlayTracker && !document.querySelector('script[data-v2-play-tracker-loader]')) {
    const tracker = document.createElement('script');
    tracker.src = `/radio/dev/v2/v2-play-tracker.js?v=20260818-play10-1`;
    tracker.defer = true;
    tracker.dataset.v2PlayTrackerLoader = '1';
    document.head.appendChild(tracker);
  }

  function isTypingOrInteractive(target) {
    if (!(target instanceof Element)) return false;
    if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
    return Boolean(target.closest('input, textarea, select, button, a, [role="button"], [role="textbox"], [role="combobox"], [role="slider"]'));
  }

  function visiblePlayer() {
    const player = app.querySelector('[data-player]');
    if (!player || player.hidden) return null;
    if (getComputedStyle(player).display === 'none' || getComputedStyle(player).visibility === 'hidden') return null;
    return player;
  }

  document.addEventListener('keydown', event => {
    const isSpace = event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';
    if (!isSpace || event.repeat || event.defaultPrevented) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isTypingOrInteractive(event.target)) return;

    const player = visiblePlayer();
    const playButton = player?.querySelector('[data-play]');
    if (!playButton || playButton.disabled) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    playButton.click();
  }, true);
})();
