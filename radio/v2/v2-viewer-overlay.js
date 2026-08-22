(() => {
  'use strict';

  if (window.StashboxV2ViewerOverlay) return;

  const app = document.getElementById('v2App');
  if (!app) return;

  const MOBILE = window.matchMedia('(max-width: 699px)');
  const OVERLAY_ID = 'viewer-overlay-left';
  const BADGE_ID = 'viewer-vec-status';
  const VEC_EXPLAINER = 'VEC = Visual Experience Controller. The green status means this player is actively pulling the current song’s visual experience from VEC, including its artwork and video clips.';
  const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';

  let queued = false;
  let syncing = false;

  function currentPlayer() {
    return app.querySelector('[data-player]');
  }

  function badgeCandidates(player) {
    if (!player) return [];
    return [...player.querySelectorAll(`#${BADGE_ID}, [data-mobile-vec-status]`)];
  }

  function overlayCandidates(player) {
    if (!player) return [];
    return [...player.querySelectorAll(`#${OVERLAY_ID}, .viewer-overlay-left`)];
  }

  function ensureOverlay(player) {
    if (!player) return null;
    const candidates = overlayCandidates(player);
    let overlay = candidates.find(node => node.id === OVERLAY_ID) || candidates[0] || null;

    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.className = 'viewer-overlay-left';
      overlay.dataset.viewerOverlayLeft = 'true';
      player.appendChild(overlay);
    }

    overlay.id = OVERLAY_ID;
    overlay.classList.add('viewer-overlay-left');
    overlay.dataset.viewerOverlayLeft = 'true';
    candidates.forEach(node => {
      if (node !== overlay) node.remove();
    });
    return overlay;
  }

  function ensureBackButton(player, overlay = ensureOverlay(player)) {
    if (!player || !overlay) return null;
    let back = overlay.querySelector('[data-close], [data-close-player]')
      || player.querySelector('.v2-player-header [data-close], .v2-player-header [data-close-player]')
      || player.querySelector('[data-close], [data-close-player]');

    if (!back) {
      back = document.createElement('button');
      back.type = 'button';
      back.dataset.close = 'true';
    }

    back.classList.add('v2-mobile-player-back');
    back.setAttribute('aria-label', 'Back to Stashbox Radio home');
    if (!back.querySelector('svg')) back.innerHTML = BACK_ICON;
    if (back.parentElement !== overlay) overlay.prepend(back);
    return back;
  }

  function createBadge() {
    const badge = document.createElement('span');
    badge.className = 'v2-mobile-vec-status v2-vec-header-pill';
    badge.dataset.mobileVecStatus = 'true';
    badge.innerHTML = '<i aria-hidden="true"></i><b>VEC</b>';
    return badge;
  }

  function updateBadge(badge, label = 'VEC') {
    if (!badge) return null;
    badge.id = BADGE_ID;
    badge.classList.add('v2-mobile-vec-status', 'v2-vec-header-pill');
    badge.dataset.mobileVecStatus = 'true';
    badge.dataset.vecExplainer = VEC_EXPLAINER;
    badge.setAttribute('role', 'status');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', VEC_EXPLAINER);
    badge.title = VEC_EXPLAINER;

    let dot = badge.querySelector('i');
    if (!dot) {
      dot = document.createElement('i');
      dot.setAttribute('aria-hidden', 'true');
      badge.prepend(dot);
    }

    let text = badge.querySelector('b');
    if (!text) {
      text = document.createElement('b');
      badge.appendChild(text);
    }

    text.textContent = 'VEC';
    badge.dataset.vecState = String(label || 'VEC');
    return badge;
  }

  function removeDuplicateBadges(player, keep) {
    badgeCandidates(player).forEach(node => {
      if (node !== keep) node.remove();
    });
  }

  function placeDesktopBadge(player, badge) {
    const header = player?.querySelector('.v2-player-header');
    const mark = header?.querySelector('.v2-player-mark');
    if (!header || !mark || !badge) return false;

    if (badge.parentElement !== header || badge.previousElementSibling !== mark) {
      mark.insertAdjacentElement('afterend', badge);
    }
    header.classList.add('has-desktop-vec-badge');

    overlayCandidates(player).forEach(overlay => {
      const back = overlay.querySelector('[data-close], [data-close-player]');
      if (back && back.parentElement === overlay) header.prepend(back);
      if (!overlay.children.length) overlay.remove();
    });
    return true;
  }

  function placeMobileBadge(player, badge) {
    const overlay = ensureOverlay(player);
    ensureBackButton(player, overlay);
    if (badge && badge.parentElement !== overlay) overlay.appendChild(badge);
    player?.querySelector('.v2-player-header')?.classList.remove('has-desktop-vec-badge');
    return overlay;
  }

  function placeBadge(player, badge) {
    if (!player || !badge) return null;
    if (MOBILE.matches) return placeMobileBadge(player, badge);
    placeDesktopBadge(player, badge);
    return badge;
  }

  function setVecStatus(player = currentPlayer(), label = 'VEC') {
    if (!player) return null;
    const candidates = badgeCandidates(player);
    let badge = candidates.find(node => node.id === BADGE_ID) || candidates[0] || null;
    if (!badge) badge = createBadge();

    updateBadge(badge, label);
    removeDuplicateBadges(player, badge);
    placeBadge(player, badge);
    return badge;
  }

  function cleanExisting(player = currentPlayer()) {
    if (!player) return null;
    const candidates = badgeCandidates(player);
    if (!candidates.length) {
      if (MOBILE.matches) {
        const overlays = overlayCandidates(player);
        overlays.slice(1).forEach(node => node.remove());
        player.querySelector('.v2-li-player-rail')?.classList.add('viewer-action-rail');
      } else {
        player.querySelector('.v2-player-header')?.classList.remove('has-desktop-vec-badge');
      }
      return null;
    }

    const badge = candidates.find(node => node.id === BADGE_ID) || candidates[0];
    updateBadge(badge, badge.dataset.vecState || 'VEC');
    removeDuplicateBadges(player, badge);
    placeBadge(player, badge);
    if (MOBILE.matches) player.querySelector('.v2-li-player-rail')?.classList.add('viewer-action-rail');
    return badge;
  }

  function sync() {
    queued = false;
    if (syncing) return;
    const player = currentPlayer();
    if (!player) return;

    syncing = true;
    try {
      cleanExisting(player);
      if (MOBILE.matches) {
        const overlay = ensureOverlay(player);
        ensureBackButton(player, overlay);
        player.querySelector('.v2-li-player-rail')?.classList.add('viewer-action-rail');
      }
    } finally {
      syncing = false;
    }
  }

  function queueSync() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }

  document.addEventListener('click', event => {
    if (!event.target.closest(`#${BADGE_ID}, [data-mobile-vec-status]`)) return;
    event.preventDefault();
  }, true);

  document.addEventListener('keydown', event => {
    if (!event.target.closest(`#${BADGE_ID}, [data-mobile-vec-status]`)) return;
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
  });

  window.addEventListener('stashbox:vec-asset-change', queueSync);
  window.addEventListener('orientationchange', queueSync);
  window.addEventListener('resize', queueSync, { passive: true });
  MOBILE.addEventListener?.('change', queueSync);

  const observer = new MutationObserver(queueSync);
  observer.observe(app, { childList: true, subtree: true });

  window.StashboxV2ViewerOverlay = {
    overlayId: OVERLAY_ID,
    badgeId: BADGE_ID,
    ensureOverlay,
    ensureBackButton,
    setVecStatus,
    cleanExisting,
    sync: queueSync
  };

  queueSync();
})();