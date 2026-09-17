(() => {
  'use strict';

  if (!location.pathname.includes('/radio/dev/v2/artist/')) return;
  if (window.StashboxArtistRealmTransitionGuard) return;

  const STYLE_ID = 'artistRealmTransitionGuardStyle';
  const HOLD_MS = 320;
  let observer = null;
  let stage = null;
  let installTimer = 0;
  let transitionToken = 0;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .artist-realm-stage .artist-realm-media[data-transition-pending="true"]{
        opacity:0!important;
      }
      .artist-realm-stage .artist-realm-media[data-transition-outgoing="true"]{
        z-index:0!important;
        opacity:1!important;
        transition:none!important;
      }
    `;
    document.head.appendChild(style);
  }

  function cleanupOutgoing(node, token) {
    window.setTimeout(() => {
      if (token !== transitionToken) return;
      if (!node?.isConnected) return;
      try { node.pause?.(); } catch (_) {}
      node.removeAttribute('data-transition-outgoing');
      node.remove();
    }, HOLD_MS);
  }

  function revealIncoming(incoming, outgoing, token) {
    if (token !== transitionToken || !incoming?.isConnected) return;
    incoming.removeAttribute('data-transition-pending');
    incoming.classList.add('is-active');
    if (outgoing) cleanupOutgoing(outgoing, token);
  }

  function guardVideo(incoming, outgoing, token) {
    incoming.dataset.transitionPending = 'true';

    const reveal = () => revealIncoming(incoming, outgoing, token);
    if (incoming.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !incoming.paused && incoming.currentTime > 0) {
      reveal();
      return;
    }

    incoming.addEventListener('playing', reveal, { once: true });
    incoming.addEventListener('timeupdate', () => {
      if (incoming.currentTime > 0) reveal();
    }, { once: true });

    window.setTimeout(() => {
      if (token !== transitionToken || !incoming?.isConnected) return;
      if (incoming.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) reveal();
    }, 900);
  }

  function guardImage(incoming, outgoing, token) {
    incoming.dataset.transitionPending = 'true';
    const reveal = () => revealIncoming(incoming, outgoing, token);
    if (incoming.complete && incoming.naturalWidth > 0) {
      reveal();
      return;
    }
    incoming.addEventListener('load', reveal, { once: true });
    window.setTimeout(reveal, 900);
  }

  function handleMutations(records) {
    const removed = [];
    const added = [];

    records.forEach(record => {
      record.removedNodes.forEach(node => {
        if (node instanceof HTMLElement && node.matches?.('.artist-realm-media')) removed.push(node);
      });
      record.addedNodes.forEach(node => {
        if (node instanceof HTMLElement && node.matches?.('.artist-realm-media')) added.push(node);
      });
    });

    if (!added.length || !removed.length || !stage) return;

    const incoming = added[added.length - 1];
    const outgoing = removed[removed.length - 1];
    if (!incoming || !outgoing || incoming === outgoing) return;

    const token = ++transitionToken;
    outgoing.dataset.transitionOutgoing = 'true';
    stage.prepend(outgoing);

    if (incoming instanceof HTMLVideoElement) guardVideo(incoming, outgoing, token);
    else if (incoming instanceof HTMLImageElement) guardImage(incoming, outgoing, token);
  }

  function install() {
    const nextStage = document.querySelector('.artist-realm-player [data-realm-stage]');
    if (!nextStage) return false;
    if (stage === nextStage && observer) return true;

    observer?.disconnect();
    stage = nextStage;
    injectStyle();
    observer = new MutationObserver(handleMutations);
    observer.observe(stage, { childList: true });
    return true;
  }

  installTimer = window.setInterval(() => {
    if (install()) window.clearInterval(installTimer);
  }, 50);
  install();

  window.StashboxArtistRealmTransitionGuard = Object.freeze({
    install,
    state: () => ({ installed: Boolean(observer && stage), transitionToken })
  });
})();
