(() => {
  'use strict';

  const mobile = window.matchMedia('(max-width: 699px)');

  // Mobile titles are presentation-only CSS. No observers, DOM rewriting,
  // resize loops, script loading, or runtime measurements are allowed here.
  if (mobile.matches) {
    if (!document.getElementById('v2-mobile-title-wrap-style')) {
      const style = document.createElement('style');
      style.id = 'v2-mobile-title-wrap-style';
      style.textContent = `
        @media (max-width: 699px) {
          #v2App .v2-player [data-ptitle],
          #v2App .v2-player .v2-player-content > h2 {
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin-bottom: 5px !important;
            overflow: visible !important;
            text-overflow: clip !important;
            white-space: normal !important;
            overflow-wrap: normal !important;
            word-break: normal !important;
            hyphens: none !important;
            text-wrap: balance !important;
            font-family: var(--font-body) !important;
            font-size: clamp(24px, 7.8vw, 34px) !important;
            font-weight: 700 !important;
            line-height: 1.02 !important;
            letter-spacing: -0.025em !important;
            text-transform: none !important;
          }
        }
      `;
      document.head.appendChild(style);
    }
    return;
  }

  const TITLE_SELECTOR = '#v2App .v2-player [data-ptitle], #v2App .v2-player .v2-player-content > h2';
  let frame = 0;

  function setImportant(node, property, value) {
    node.style.setProperty(property, value, 'important');
  }

  function fitTitle(title) {
    if (!(title instanceof HTMLElement)) return;
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

  window.addEventListener('resize', schedule, { passive: true });
  document.fonts?.ready?.then(schedule).catch(() => {});
  schedule();
})();