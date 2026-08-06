(() => {
  'use strict';

  const mobile = window.matchMedia('(max-width: 699px)');
  const TITLE_SELECTOR = '#v2App .v2-player [data-ptitle], #v2App .v2-player .v2-player-content > h2';
  let frame = 0;

  function setImportant(node, property, value) {
    node.style.setProperty(property, value, 'important');
  }

  function lineCount(title, size) {
    setImportant(title, 'font-size', `${size}px`);
    const style = getComputedStyle(title);
    const lineHeight = Number.parseFloat(style.lineHeight) || size * 1.02;
    return Math.max(1, Math.round(title.scrollHeight / lineHeight));
  }

  function fitMobile(title) {
    const text = String(title.textContent || '').trim();
    if (!text || title.clientWidth < 80) return;

    setImportant(title, 'display', 'block');
    setImportant(title, 'width', '100%');
    setImportant(title, 'max-width', '100%');
    setImportant(title, 'white-space', 'normal');
    setImportant(title, 'overflow', 'visible');
    setImportant(title, 'text-overflow', 'clip');
    setImportant(title, 'overflow-wrap', 'normal');
    setImportant(title, 'word-break', 'normal');
    setImportant(title, 'hyphens', 'none');
    setImportant(title, 'text-wrap', 'balance');
    setImportant(title, 'line-height', '1.02');
    setImportant(title, 'max-height', 'none');
    setImportant(title, 'text-transform', 'none');

    const maxSize = 36;
    const minSize = 16;
    let low = minSize;
    let high = maxSize;
    let best = minSize;

    for (let step = 0; step < 9; step += 1) {
      const size = (low + high) / 2;
      if (lineCount(title, size) <= 2) {
        best = size;
        low = size;
      } else {
        high = size;
      }
    }

    const finalSize = Math.max(minSize, Math.floor(best * 2) / 2);
    setImportant(title, 'font-size', `${finalSize}px`);
    title.dataset.v2TitleFit = `mobile-two-line-${finalSize}`;
    title.dataset.v2TitleLines = String(Math.min(2, lineCount(title, finalSize)));
  }

  function fitDesktop(title) {
    const text = String(title.textContent || '').trim();
    const available = title.clientWidth;
    if (!text || available < 80) return;

    setImportant(title, 'display', 'block');
    setImportant(title, 'white-space', 'nowrap');
    setImportant(title, 'overflow', 'visible');
    setImportant(title, 'text-overflow', 'clip');
    setImportant(title, 'max-height', 'none');

    let low = 24;
    let high = 78;
    let best = 24;
    for (let step = 0; step < 9; step += 1) {
      const size = (low + high) / 2;
      setImportant(title, 'font-size', `${size}px`);
      if (title.scrollWidth <= available + 1) {
        best = size;
        low = size;
      } else {
        high = size;
      }
    }
    setImportant(title, 'font-size', `${Math.floor(best * 2) / 2}px`);
  }

  function fitTitle(title) {
    if (!(title instanceof HTMLElement)) return;
    if (mobile.matches) fitMobile(title);
    else fitDesktop(title);
  }

  function fitAll() {
    document.querySelectorAll(TITLE_SELECTOR).forEach(fitTitle);
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fitAll);
  }

  function touchesTitle(mutation) {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target?.parentElement;
    if (target?.matches?.(TITLE_SELECTOR) || target?.closest?.('[data-ptitle]')) return true;
    return [...mutation.addedNodes].some(node =>
      node instanceof Element && (node.matches?.(TITLE_SELECTOR) || node.querySelector?.('[data-ptitle]'))
    );
  }

  const root = document.getElementById('v2App') || document.documentElement;
  new MutationObserver(mutations => {
    if (mutations.some(touchesTitle)) schedule();
  }).observe(root, {
    childList: true,
    subtree: true,
    characterData: true
  });

  mobile.addEventListener?.('change', schedule);
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('orientationchange', schedule, { passive: true });
  document.fonts?.ready?.then(schedule).catch(() => {});
  schedule();
})();