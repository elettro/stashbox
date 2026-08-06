(() => {
  'use strict';

  const desktop = window.matchMedia('(min-width: 700px)');
  const DESKTOP_MAX_SIZE = 78;
  const DESKTOP_MIN_SIZE = 24;
  const MOBILE_MAX_SIZE = 38;
  const MOBILE_MIN_SIZE = 22;
  const MOBILE_LINE_HEIGHT = 1.02;
  let frame = 0;
  let resizeObserver = null;

  const FIT_PROPERTIES = [
    'display',
    'width',
    'max-width',
    'font-size',
    'line-height',
    'max-height',
    'overflow',
    'overflow-wrap',
    'text-overflow',
    'text-wrap',
    'white-space',
    'word-break',
    'hyphens',
    '-webkit-box-orient',
    '-webkit-line-clamp'
  ];

  function clearFitStyles(title) {
    FIT_PROPERTIES.forEach(property => title.style.removeProperty(property));
    title.removeAttribute('data-v2-title-fit');
    title.removeAttribute('data-v2-title-lines');
  }

  function important(title, property, value) {
    title.style.setProperty(property, value, 'important');
  }

  function fitSingleLine(title, maxSize, minSize) {
    const text = String(title.textContent || '').trim();
    const available = title.clientWidth;
    if (!text || available < 40) return false;

    important(title, 'display', 'block');
    important(title, 'white-space', 'nowrap');
    important(title, 'overflow', 'visible');
    important(title, 'text-overflow', 'clip');
    important(title, 'max-height', 'none');
    important(title, 'font-size', `${maxSize}px`);

    if (title.scrollWidth <= available + 1) {
      title.dataset.v2TitleFit = String(maxSize);
      title.dataset.v2TitleLines = '1';
      return true;
    }

    let low = minSize;
    let high = maxSize;
    let best = minSize;

    for (let step = 0; step < 10; step += 1) {
      const size = (low + high) / 2;
      important(title, 'font-size', `${size}px`);

      if (title.scrollWidth <= available + 1) {
        best = size;
        low = size;
      } else {
        high = size;
      }
    }

    const finalSize = Math.max(minSize, Math.floor(best * 2) / 2);
    important(title, 'font-size', `${finalSize}px`);
    const fits = title.scrollWidth <= available + 1;

    if (fits) {
      title.dataset.v2TitleFit = String(finalSize);
      title.dataset.v2TitleLines = '1';
    }
    return fits;
  }

  function estimatedLines(title, size) {
    const lineHeight = size * MOBILE_LINE_HEIGHT;
    return Math.max(1, Math.round(title.scrollHeight / lineHeight));
  }

  function fitMobileTitle(title) {
    clearFitStyles(title);

    const text = String(title.textContent || '').trim();
    if (!text) return;

    // The parent already reserves the right-side action rail. Keeping the title
    // at 100% of that content box prevents it from running beneath the rail or
    // outside the phone viewport.
    important(title, 'display', 'block');
    important(title, 'width', '100%');
    important(title, 'max-width', '100%');
    important(title, 'white-space', 'normal');
    important(title, 'overflow', 'visible');
    important(title, 'text-overflow', 'clip');
    important(title, 'max-height', 'none');
    important(title, 'overflow-wrap', 'break-word');
    important(title, 'word-break', 'normal');
    important(title, 'hyphens', 'none');
    important(title, 'line-height', String(MOBILE_LINE_HEIGHT));
    important(title, 'text-wrap', 'balance');

    const targetLines = text.length > 52 ? 3 : 2;
    let chosenSize = MOBILE_MIN_SIZE;
    let chosenLines = targetLines;

    for (let size = MOBILE_MAX_SIZE; size >= MOBILE_MIN_SIZE; size -= 0.5) {
      important(title, 'font-size', `${size}px`);
      const lines = estimatedLines(title, size);
      chosenSize = size;
      chosenLines = lines;
      if (lines <= targetLines) break;
    }

    // Never clamp or hide the title. Extremely long titles can use an extra
    // line rather than losing words off the right side of the screen.
    important(title, 'font-size', `${chosenSize}px`);
    title.dataset.v2TitleFit = `wrapped-${chosenSize}`;
    title.dataset.v2TitleLines = String(chosenLines);
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
    return [...document.querySelectorAll('#v2App .v2-player [data-ptitle]')];
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
  window.addEventListener('orientationchange', schedule, { passive: true });
  document.fonts?.ready?.then(schedule).catch(() => {});
  schedule();
})();
