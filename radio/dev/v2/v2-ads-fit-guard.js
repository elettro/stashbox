(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (window.StashboxV2AdsFitGuard) return;

  function forceFit(video) {
    if (!(video instanceof HTMLVideoElement) || !video.classList.contains('v2-ad-break-player')) return false;

    // Ads always use FIT. The ad video owns the full viewer box while
    // object-fit: contain preserves the complete source frame at every ratio.
    video.style.setProperty('position', 'absolute', 'important');
    video.style.setProperty('inset', '0', 'important');
    video.style.setProperty('width', '100%', 'important');
    video.style.setProperty('height', '100%', 'important');
    video.style.setProperty('max-width', 'none', 'important');
    video.style.setProperty('max-height', 'none', 'important');
    video.style.setProperty('object-fit', 'contain', 'important');
    video.style.setProperty('object-position', 'center center', 'important');
    video.style.setProperty('background', '#000', 'important');
    video.dataset.v2AdForcedFit = 'viewport-contain';
    return true;
  }

  function scan(root = document) {
    if (root instanceof HTMLVideoElement) forceFit(root);
    root?.querySelectorAll?.('video.v2-ad-break-player').forEach(forceFit);
  }

  ['loadedmetadata', 'canplay', 'play', 'playing', 'resize'].forEach(type => {
    const target = type === 'resize' ? window : document;
    target.addEventListener(type, event => {
      if (type === 'resize') scan();
      else forceFit(event.target);
    }, true);
  });

  const observer = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node instanceof Element) scan(node);
      });
    });
  });

  const start = () => {
    scan();
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.StashboxV2AdsFitGuard = Object.freeze({ apply: scan });
})();
