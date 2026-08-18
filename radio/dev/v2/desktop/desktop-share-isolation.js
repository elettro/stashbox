(() => {
  'use strict';

  if (window.__stashboxDesktopShareIsolationLoaded) return;
  window.__stashboxDesktopShareIsolationLoaded = true;

  const app = document.getElementById('v2App');
  if (!app) return;

  let localCount = 0;

  function findShareButton() {
    const player = app.querySelector('.v2-player:not([hidden])') || app.querySelector('[data-player]:not([hidden])');
    if (!player) return null;
    return [...player.querySelectorAll('[data-share]')].find(button => button.getClientRects().length) || player.querySelector('[data-share]');
  }

  function replaceShareButton() {
    if (!matchMedia('(min-width: 900px)').matches) return;
    const original = findShareButton();
    if (!original || original.dataset.desktopShareIsolation === 'true') return;

    const clone = original.cloneNode(true);
    clone.dataset.desktopShareIsolation = 'true';

    let count = clone.querySelector('[data-shares]');
    if (!count) {
      count = document.createElement('strong');
      count.setAttribute('data-shares', '');
      count.className = 'v2-share-count';
      count.textContent = String(localCount);
      clone.appendChild(count);
    }

    clone.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      localCount += 1;
      count.textContent = String(localCount);
      clone.setAttribute('aria-label', `Share isolation test ${localCount}`);
    }, false);

    original.replaceWith(clone);
  }

  const style = document.createElement('style');
  style.textContent = `
    @media (min-width: 900px) {
      .v2-player [data-share] {
        display:inline-flex !important;
        align-items:center !important;
        gap:7px !important;
      }
      .v2-player [data-share] .v2-share-count {
        display:inline-block;
        font-size:13px;
        line-height:1;
        pointer-events:none;
      }
    }
  `;
  document.head.appendChild(style);

  [0, 100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000].forEach(delay => {
    setTimeout(replaceShareButton, delay);
  });
  setInterval(replaceShareButton, 1000);
})();
