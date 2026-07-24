(() => {
  'use strict';

  // The in-player STASHBOX wordmark must behave exactly like the back arrow.
  // Closing the overlay preserves the current audio element and playback time.
  document.addEventListener('click', event => {
    const wordmark = event.target.closest('#v2App .v2-player-mark');
    if (!wordmark) return;

    const player = wordmark.closest('[data-player]');
    const backButton = player?.querySelector('[data-close]');
    if (!backButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    backButton.click();
  }, true);
})();
