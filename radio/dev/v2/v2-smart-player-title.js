(() => {
  'use strict';

  const desktop = window.matchMedia('(min-width: 700px)');
  const MAX_SIZE = 78;
  const MIN_SIZE = 24;
  let frame = 0;
  let resizeObserver = null;

  function resetTitle(title) {
    title.style.removeProperty('font-size');
    title.removeAttribute('data-v2-title-fit');
  }

  function fitTitle(title) {
    if (!(title instanceof HTMLElement)) return;

    if (!desktop.matches) {
      resetTitle(title);
      return;
    }

    const text = String(title.textContent || '').trim();
    const available = title.clientWidth;
    if (!text || available < 40) return;

    title.style.whiteSpace = 'nowrap';
    title.style.overflow = 'visible';
    title.style.textOverflow = 'clip';
    title.style.fontSize = `${MAX_SIZE}px`;

    if (title.scrollWidth <= available + 1) {
      title.dataset.v2TitleFit = String(MAX_SIZE);
      return;
    }

    let low = MIN_SIZE;
    let high = MAX_SIZE;
    let best = MIN_SIZE;

    for (let step = 0; step < 9; step += 1) {
      const size = (low + high) / 2;
      title.style.fontSize = `${size}px`;

      if (title.scrollWidth <= available + 1) {
        best = size;
        low = size;
      } else {
        high = size;
      }
    }

    const finalSize = Math.max(MIN_SIZE, Math.floor(best * 2) / 2);
    title.style.fontSize = `${finalSize}px`;
    title.dataset.v2TitleFit = String(finalSize);
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
