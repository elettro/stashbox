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
    if (!stage) return;
    setImportant(stage.style, 'display', 'flex');
    setImportant(stage.style, 'align-items', 'center');
    setImportant(stage.style, 'justify-content', 'center');
    setImportant(stage.style, 'overflow', 'hidden');
    setImportant(stage.style, 'background', '#000');
  }

  function forceFit(video) {
    if (!(video instanceof HTMLVideoElement) || !video.classList.contains('v2-ad-break-player')) return false;
    forceMediaStage(video);

    const stage = video.closest('[data-v2-ad-media], .v2-ad-break-media') || video.parentElement;
    const rect = stage?.getBoundingClientRect?.();
    const boxWidth = Math.max(1, Number(rect?.width || window.innerWidth || 1));
    const boxHeight = Math.max(1, Number(rect?.height || window.innerHeight || 1));
    const sourceWidth = Number(video.videoWidth || 0);
    const sourceHeight = Number(video.videoHeight || 0);

    setImportant(video.style, 'position', 'relative');
    setImportant(video.style, 'inset', 'auto');
    setImportant(video.style, 'left', 'auto');
    setImportant(video.style, 'right', 'auto');
    setImportant(video.style, 'top', 'auto');
    setImportant(video.style, 'bottom', 'auto');
    setImportant(video.style, 'min-width', '0');
    setImportant(video.style, 'min-height', '0');
    setImportant(video.style, 'max-width', 'none');
    setImportant(video.style, 'max-height', 'none');
    setImportant(video.style, 'margin', 'auto');
    setImportant(video.style, 'flex', '0 0 auto');
    setImportant(video.style, 'transform', 'none');
    setImportant(video.style, 'transform-origin', 'center center');
    setImportant(video.style, 'background', '#000');

    if (sourceWidth > 0 && sourceHeight > 0) {
      // Size the physical <video> box to the largest rectangle that fits inside
      // the viewer while preserving the source ratio. No COVER rule can crop a
      // frame whose element box already matches the media's native aspect ratio.
      const scale = Math.min(boxWidth / sourceWidth, boxHeight / sourceHeight);
      const width = Math.max(1, Math.floor(sourceWidth * scale));
      const height = Math.max(1, Math.floor(sourceHeight * scale));
      setImportant(video.style, 'width', `${width}px`);
      setImportant(video.style, 'height', `${height}px`);
      setImportant(video.style, 'aspect-ratio', `${sourceWidth} / ${sourceHeight}`);
      setImportant(video.style, 'object-fit', 'fill');
      video.dataset.v2AdForcedFit = `physical-${sourceWidth}x${sourceHeight}-${width}x${height}`;
    } else {
      // Metadata has not arrived yet. Stay safely contained until it does.
      setImportant(video.style, 'width', '100%');
      setImportant(video.style, 'height', '100%');
      setImportant(video.style, 'aspect-ratio', 'auto');
      setImportant(video.style, 'object-fit', 'contain');
      video.dataset.v2AdForcedFit = 'metadata-pending-contain';
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
