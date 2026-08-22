(() => {
  'use strict';

  if (!location.pathname.includes('/radio/') || location.pathname.includes('/artist/')) return;
  if (!matchMedia('(min-width: 900px)').matches) return;

  const KEY = 'stashbox_desktop_video_fit';

  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== 'fit' && saved !== 'fill') localStorage.setItem(KEY, 'fit');
  } catch (_) {}

  function updateTooltip(button) {
    if (!button) return false;
    const mode = String(button.textContent || '').trim().toUpperCase() === 'FILL' ? 'fill' : 'fit';
    button.title = mode === 'fit'
      ? 'Video display: FIT shows the entire video with no cropping. Click to switch to FILL.'
      : 'Video display: FILL fills the player and may crop the video. Click to switch to FIT.';
    button.setAttribute('aria-description', mode === 'fit'
      ? 'FIT shows the complete video without cropping.'
      : 'FILL fills the player area and may crop the video.');
    return true;
  }

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const button = document.querySelector('#v2App [data-desktop-rescue-fit-toggle]');
    if (button) {
      updateTooltip(button);
      if (!button.dataset.fitTooltipBound) {
        button.dataset.fitTooltipBound = 'true';
        button.addEventListener('click', () => window.setTimeout(() => updateTooltip(button), 0));
      }
      window.clearInterval(timer);
    } else if (attempts >= 40) {
      window.clearInterval(timer);
    }
  }, 250);
})();
