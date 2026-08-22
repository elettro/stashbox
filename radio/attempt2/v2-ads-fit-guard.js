(() => {
  'use strict';

  if (!location.pathname.includes('/radio/attempt2/') || location.pathname.includes('/artist/')) return;
  if (window.StashboxV2AdsFitGuard) return;

  const pending = new WeakSet();

  function setImportant(style, property, value) {
    if (style.getPropertyValue(property) === value && style.getPropertyPriority(property) === 'important') return;
    style.setProperty(property, value, 'important');
  }

  function viewportSize() {
    const vv = window.visualViewport;
    return {
      width: Math.max(1, Math.round(Number(vv?.width || window.innerWidth || document.documentElement.clientWidth || 1))),
      height: Math.max(1, Math.round(Number(vv?.height || window.innerHeight || document.documentElement.clientHeight || 1)))
    };
  }

  function forceMediaStage(video) {
    const stage = video.closest('[data-v2-ad-media], .v2-ad-break-media') || video.parentElement;
    if (!stage) return null;

    setImportant(stage.style, 'position', 'fixed');
    setImportant(stage.style, 'inset', '0');
    setImportant(stage.style, 'left', '0');
    setImportant(stage.style, 'top', '0');
    setImportant(stage.style, 'right', '0');
    setImportant(stage.style, 'bottom', '0');
    setImportant(stage.style, 'width', '100vw');
    setImportant(stage.style, 'height', '100vh');
    setImportant(stage.style, 'margin', '0');
    setImportant(stage.style, 'padding', '0');
    setImportant(stage.style, 'overflow', 'hidden');
    setImportant(stage.style, 'background', '#000');
    setImportant(stage.style, 'transform', 'none');
    return stage;
  }

  function forceFit(video) {
    if (!(video instanceof HTMLVideoElement) || !video.classList.contains('v2-ad-break-player')) return false;

    const stage = forceMediaStage(video);
    if (!stage) return false;

    const viewport = viewportSize();
    const boxWidth = viewport.width;
    const boxHeight = viewport.height;
    const sourceWidth = Number(video.videoWidth || 0);
    const sourceHeight = Number(video.videoHeight || 0);

    // Set inset first. The previous order set left/top and then inset:auto,
    // which erased the centering coordinates and sent the ad toward the upper-left.
    setImportant(video.style, 'position', 'fixed');
    setImportant(video.style, 'inset', 'auto');
    setImportant(video.style, 'left', '50vw');
    setImportant(video.style, 'top', '50vh');
    setImportant(video.style, 'right', 'auto');
    setImportant(video.style, 'bottom', 'auto');
    setImportant(video.style, 'margin', '0');
    setImportant(video.style, 'padding', '0');
    setImportant(video.style, 'min-width', '0');
    setImportant(video.style, 'min-height', '0');
    setImportant(video.style, 'max-width', 'none');
    setImportant(video.style, 'max-height', 'none');
    setImportant(video.style, 'transform', 'translate(-50%, -50%)');
    setImportant(video.style, 'transform-origin', 'center center');
    setImportant(video.style, 'background', '#000');

    if (sourceWidth > 0 && sourceHeight > 0) {
      const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
      const width = Math.max(1, Math.floor(sourceWidth * scale));
      const height = Math.max(1, Math.floor(sourceHeight * scale));
      setImportant(video.style, 'width', `${width}px`);
      setImportant(video.style, 'height', `${height}px`);
      setImportant(video.style, 'aspect-ratio', `${sourceWidth} / ${sourceHeight}`);
      setImportant(video.style, 'object-fit', 'fill');
      video.dataset.v2AdForcedFit = `viewport-centered-${sourceWidth}x${sourceHeight}-${width}x${height}`;
    } else {
      setImportant(video.style, 'width', '100vw');
      setImportant(video.style, 'height', '100vh');
      setImportant(video.style, 'aspect-ratio', 'auto');
      setImportant(video.style, 'object-fit', 'contain');
      video.dataset.v2AdForcedFit = 'viewport-centered-metadata-pending';
    }

    setImportant(video.style, 'object-position', 'center center');
    return true;
  }

  function scheduleFit(video) {
    if (!(video instanceof HTMLVideoElement) || pending.has(video)) return;
    pending.add(video);
    requestAnimationFrame(() => {
      pending.delete(video);
      forceFit(video);
    });
  }

  function scan(root = document) {
    if (root instanceof HTMLVideoElement) scheduleFit(root);
    root?.querySelectorAll?.('video.v2-ad-break-player').forEach(scheduleFit);
  }

  ['loadedmetadata', 'durationchange', 'canplay', 'play', 'playing'].forEach(type => {
    document.addEventListener(type, event => {
      const video = event.target;
      if (video instanceof HTMLVideoElement && video.classList.contains('v2-ad-break-player')) scheduleFit(video);
    }, true);
  });

  window.addEventListener('resize', () => scan());
  window.visualViewport?.addEventListener?.('resize', () => scan());
  window.addEventListener('orientationchange', () => window.setTimeout(() => scan(), 50));

  const observer = new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'attributes' && record.target instanceof HTMLVideoElement) {
        if (record.target.classList.contains('v2-ad-break-player')) scheduleFit(record.target);
        return;
      }
      record.addedNodes.forEach(node => {
        if (node instanceof Element) scan(node);
      });
    });
  });

  const start = () => {
    scan();
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'src']
      });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();

  window.StashboxV2AdsFitGuard = Object.freeze({ apply: scan });
})();
