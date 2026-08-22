(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/') || location.pathname.includes('/artist/')) return;
  if (window.StashboxV2AdsFitGuard) return;

  const pending = new WeakSet();

  function setImportant(style, property, value) {
    if (style.getPropertyValue(property) === value && style.getPropertyPriority(property) === 'important') return;
    style.setProperty(property, value, 'important');
  }

  function forceMediaStage(video) {
    const stage = video.closest('[data-v2-ad-media], .v2-ad-break-media') || video.parentElement;
    if (!stage) return null;

    // The ad media stage always owns the full viewport. Center the fitted media
    // with explicit coordinates instead of depending on flex/grid inheritance.
    setImportant(stage.style, 'position', 'absolute');
    setImportant(stage.style, 'inset', '0');
    setImportant(stage.style, 'width', '100%');
    setImportant(stage.style, 'height', '100%');
    setImportant(stage.style, 'overflow', 'hidden');
    setImportant(stage.style, 'background', '#000');
    return stage;
  }

  function forceFit(video) {
    if (!(video instanceof HTMLVideoElement) || !video.classList.contains('v2-ad-break-player')) return false;

    const stage = forceMediaStage(video);
    if (!stage) return false;

    const rect = stage.getBoundingClientRect?.();
    const boxWidth = Math.max(1, Number(rect?.width || window.innerWidth || 1));
    const boxHeight = Math.max(1, Number(rect?.height || window.innerHeight || 1));
    const sourceWidth = Number(video.videoWidth || 0);
    const sourceHeight = Number(video.videoHeight || 0);

    // Explicit absolute centering avoids the left-anchor failure seen with the
    // 9:16 Clementine creative. These properties are isolated to ad media only.
    setImportant(video.style, 'position', 'absolute');
    setImportant(video.style, 'left', '50%');
    setImportant(video.style, 'top', '50%');
    setImportant(video.style, 'right', 'auto');
    setImportant(video.style, 'bottom', 'auto');
    setImportant(video.style, 'inset', 'auto');
    setImportant(video.style, 'margin', '0');
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
      video.dataset.v2AdForcedFit = `centered-physical-${sourceWidth}x${sourceHeight}-${width}x${height}`;
    } else {
      // Before metadata arrives, use a contained viewport-sized box. Once the
      // intrinsic dimensions become available this is replaced by physical FIT.
      setImportant(video.style, 'width', '100%');
      setImportant(video.style, 'height', '100%');
      setImportant(video.style, 'aspect-ratio', 'auto');
      setImportant(video.style, 'object-fit', 'contain');
      video.dataset.v2AdForcedFit = 'centered-metadata-pending-contain';
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
