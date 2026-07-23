(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;
  const mobile = window.matchMedia('(max-width: 699px)');
  const backIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  let queued = false;

  function repair() {
    queued = false;
    if (!mobile.matches) return;
    const player = app.querySelector('[data-player]');
    if (!player || player.hidden || !player.classList.contains('is-logged-in-player')) return;
    const header = player.querySelector('.v2-player-header');
    if (!header) return;

    header.querySelectorAll('.v2-player-mark, .v2-player-head-actions').forEach(node => node.remove());

    let back = header.querySelector('[data-close], [data-close-player]');
    if (!back) {
      back = document.createElement('button');
      back.type = 'button';
      back.dataset.close = 'true';
      header.prepend(back);
    }
    back.classList.add('v2-mobile-player-back');
    back.setAttribute('aria-label', 'Back to Stashbox Radio home');
    back.innerHTML = backIcon;

    const actions = player.querySelector('.v2-li-player-head-actions');
    if (actions && actions.parentElement !== header) header.appendChild(actions);

    [...header.children].forEach(child => {
      if (child === back || child === actions) return;
      if (child.matches('.v2-icon-button, a, button')) child.remove();
    });
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(repair);
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#v2App [data-song], #v2App [data-next], #v2App [data-prev], #v2App [data-next-song], #v2App [data-previous-song]')) setTimeout(queue, 20);
  }, true);
  mobile.addEventListener?.('change', queue);
  new MutationObserver(queue).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  queue();
})();
