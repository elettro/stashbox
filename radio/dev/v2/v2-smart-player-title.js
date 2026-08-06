(() => {
  'use strict';

  const desktop = window.matchMedia('(min-width: 700px)');
  const DESKTOP_MAX_SIZE = 78;
  const DESKTOP_MIN_SIZE = 24;
  const MOBILE_MAX_SIZE = 38;
  const MOBILE_MIN_SIZE = 26;
  let frame = 0;
  let resizeObserver = null;

  function clearFitStyles(title) {
    [
      'display',
      'font-size',
      'max-height',
      'overflow',
      'overflow-wrap',
      'text-overflow',
      'white-space',
      'word-break',
      '-webkit-box-orient',
      '-webkit-line-clamp'
    ].forEach(property => title.style.removeProperty(property));
    title.removeAttribute('data-v2-title-fit');
  }

  function fitSingleLine(title, maxSize, minSize) {
    const text = String(title.textContent || '').trim();
    const available = title.clientWidth;
    if (!text || available < 40) return false;

    title.style.display = 'block';
    title.style.whiteSpace = 'nowrap';
    title.style.overflow = 'visible';
    title.style.textOverflow = 'clip';
    title.style.maxHeight = 'none';
    title.style.fontSize = `${maxSize}px`;

    if (title.scrollWidth <= available + 1) {
      title.dataset.v2TitleFit = String(maxSize);
      return true;
    }

    let low = minSize;
    let high = maxSize;
    let best = minSize;

    for (let step = 0; step < 10; step += 1) {
      const size = (low + high) / 2;
      title.style.fontSize = `${size}px`;

      if (title.scrollWidth <= available + 1) {
        best = size;
        low = size;
      } else {
        high = size;
      }
    }

    const finalSize = Math.max(minSize, Math.floor(best * 2) / 2);
    title.style.fontSize = `${finalSize}px`;
    const fits = title.scrollWidth <= available + 1;

    if (fits) title.dataset.v2TitleFit = String(finalSize);
    return fits;
  }

  function fitMobileTitle(title) {
    clearFitStyles(title);

    if (fitSingleLine(title, MOBILE_MAX_SIZE, MOBILE_MIN_SIZE)) return;

    title.style.display = 'block';
    title.style.fontSize = `${MOBILE_MIN_SIZE}px`;
    title.style.whiteSpace = 'normal';
    title.style.overflow = 'visible';
    title.style.textOverflow = 'clip';
    title.style.maxHeight = 'none';
    title.style.overflowWrap = 'anywhere';
    title.style.wordBreak = 'normal';
    title.dataset.v2TitleFit = `wrapped-${MOBILE_MIN_SIZE}`;
  }

  function fitDesktopTitle(title) {
    clearFitStyles(title);
    fitSingleLine(title, DESKTOP_MAX_SIZE, DESKTOP_MIN_SIZE);
  }

  function fitTitle(title) {
    if (!(title instanceof HTMLElement)) return;
    if (desktop.matches) fitDesktopTitle(title);
    else fitMobileTitle(title);
  }

  function getTitles() {
    return [...document.querySelectorAll('#v2App .v2-player .v2-player-content > h2')];
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const current = getTitles();
      current.forEach(fitTitle);

      resizeObserver?.disconnect();
      resizeObserver = new ResizeObserver(entries => {
        entries.forEach(entry => fitTitle(entry.target));
      });
      current.forEach(title => resizeObserver.observe(title));
    });
  }

  const root = document.getElementById('v2App') || document.documentElement;
  new MutationObserver(schedule).observe(root, {
    childList: true,
    subtree: true,
    characterData: true
  });

  desktop.addEventListener?.('change', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  document.fonts?.ready?.then(schedule).catch(() => {});
  schedule();
})();