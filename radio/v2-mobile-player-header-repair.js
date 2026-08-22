(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const mobile = window.matchMedia('(max-width: 699px)');
  const backIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  let queued = false;
  let playerObserver = null;
  let observedPlayer = null;

  function ensureBack(player) {
    const manager = window.StashboxV2ViewerOverlay;
    if (manager?.ensureBackButton) return manager.ensureBackButton(player);

    let back = player.querySelector('[data-close], [data-close-player]');
    if (!back) {
      back = document.createElement('button');
      back.type = 'button';
      back.dataset.close = 'true';
      player.appendChild(back);
    }
    back.classList.add('v2-mobile-player-back');
    back.setAttribute('aria-label', 'Back to Stashbox Radio home');
    back.innerHTML = backIcon;
    return back;
  }

  function observePlayer(player) {
    if (player === observedPlayer) return;
    playerObserver?.disconnect();
    observedPlayer = player;
    if (!player) return;
    playerObserver = new MutationObserver(queue);
    playerObserver.observe(player, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden']
    });
  }

  function repair() {
    queued = false;
    if (!mobile.matches) return;

    const player = app.querySelector('[data-player]');
    observePlayer(player);
    if (!player) return;

    const header = player.querySelector('.v2-player-header');
    if (!header) return;

    if (player.classList.contains('is-logged-in-player')) {
      header.querySelectorAll('.v2-player-mark, .v2-player-head-actions').forEach(node => node.remove());
    }

    const back = ensureBack(player);
    const actions = player.querySelector('.v2-li-player-head-actions');
    if (actions && actions.parentElement !== header) header.appendChild(actions);

    player.querySelector('.v2-li-player-rail')?.classList.add('viewer-action-rail');

    const manager = window.StashboxV2ViewerOverlay;
    manager?.cleanExisting?.(player);
    manager?.sync?.();

    // Remove only obsolete header controls. The back control now lives in the
    // independent upper-left overlay and the account actions stay on the right.
    [...header.children].forEach(child => {
      if (child === actions) return;
      if (child === back || child.matches('#viewer-overlay-left, [data-viewer-overlay-left]')) return;
      if (child.matches('[data-mobile-vec-status], #viewer-vec-status')) {
        manager?.cleanExisting?.(player);
        return;
      }
      if (player.classList.contains('is-logged-in-player') && child.matches('.v2-icon-button, a, button')) child.remove();
    });
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(repair);
  }

  document.addEventListener('click', event => {
    if (event.target.closest('#v2App [data-song], #v2App [data-next], #v2App [data-prev], #v2App [data-next-song], #v2App [data-previous-song]')) {
      setTimeout(queue, 20);
    }
  }, true);

  window.addEventListener('stashbox:vec-asset-change', queue);
  window.addEventListener('orientationchange', queue);
  mobile.addEventListener?.('change', queue);

  new MutationObserver(queue).observe(app, { childList: true, subtree: true });
  queue();
})();