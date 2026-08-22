(() => {
  'use strict';

  if (window.StashboxPageOverlay) return;

  const ORIGIN = location.origin;
  const HANDOFF_KEY = 'stashbox_v2_artist_song_handoff';
  let overlay = null;

  const clean = value => String(value ?? '').trim();
  const slugify = value => clean(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'stashbox';

  function loadPortraitArtworkReliability() {
    if (
      window.StashboxPortraitArtworkRule ||
      document.querySelector('script[data-stashbox-portrait-artwork-rule], script[src*="v2-portrait-artwork-reliability.js"]')
    ) return;
    const script = document.createElement('script');
    script.src = '/radio/attempt2/v2-portrait-artwork-reliability.js?v=20260802-portrait-rule1';
    script.defer = true;
    script.dataset.stashboxPortraitArtworkRule = 'true';
    document.head.appendChild(script);
  }

  function removeLegacyDesktopMediaFitToggle() {
    document.querySelectorAll(
      '.desktop-media-fit-control, script[data-stashbox-desktop-media-fit], script[src*="v2-desktop-media-fit-toggle.js"]'
    ).forEach(node => node.remove());

    document.querySelectorAll('#v2App [data-player], .artist-realm-player').forEach(player => {
      delete player.dataset.desktopMediaFitMode;
    });

    document.body?.classList.remove('desktop-media-fill-view', 'desktop-media-full-view');
    document.documentElement.removeAttribute('data-desktop-media-fit-mode');
    try { localStorage.removeItem('stashbox_v2_desktop_media_fit_mode'); }
    catch (_) {}
  }

  function markInteractive(root = document) {
    root.querySelectorAll('#v2App [data-player] [data-partist], #v2App [data-player] [data-pgenre], .artist-realm-player [data-realm-genre]').forEach(node => {
      node.classList.add('stashbox-route-link');
      node.setAttribute('role', 'link');
      if (!node.hasAttribute('tabindex')) node.tabIndex = 0;
      const value = clean(node.textContent);
      if (node.matches('[data-partist]')) node.setAttribute('aria-label', `Open ${value || 'artist'} page without stopping playback`);
      else node.setAttribute('aria-label', `Open ${value || 'genre'} song feed without stopping playback`);
    });
  }

  function createOverlay(url, label) {
    const section = document.createElement('section');
    section.className = 'stashbox-page-overlay';
    section.setAttribute('role', 'dialog');
    section.setAttribute('aria-modal', 'true');
    section.setAttribute('aria-label', label || 'Stashbox Radio page');

    const iframe = document.createElement('iframe');
    iframe.src = url.href;
    iframe.title = label || 'Stashbox Radio page';
    iframe.allow = 'autoplay; fullscreen';
    iframe.setAttribute('referrerpolicy', 'same-origin');
    section.appendChild(iframe);
    return section;
  }

  function openRoute(target, label = 'Stashbox Radio page') {
    const url = new URL(target, ORIGIN);
    url.searchParams.set('embedded', '1');

    if (overlay) {
      const iframe = overlay.querySelector('iframe');
      if (iframe) iframe.src = url.href;
      overlay.setAttribute('aria-label', label);
      return;
    }

    overlay = createOverlay(url, label);
    document.body.appendChild(overlay);
    document.body.classList.add('stashbox-page-overlay-open');

    try {
      history.pushState({ stashboxOverlay: true }, '', `${url.pathname}${url.search}`);
    } catch (_) {}
  }

  function closeRoute(fromPopState = false) {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.body.classList.remove('stashbox-page-overlay-open');

    if (!fromPopState && history.state?.stashboxOverlay) {
      try { history.back(); } catch (_) {}
    }
  }

  function openArtist(node) {
    const artistName = clean(node.textContent);
    if (!artistName) return;
    const url = new URL('/radio/attempt2/artist/', ORIGIN);
    url.searchParams.set('artist', slugify(artistName));
    openRoute(url, `${artistName} artist page`);
  }

  function openGenre(node) {
    const genre = clean(node.textContent);
    if (!genre) return;

    const url = new URL('/radio/attempt2/genre/', ORIGIN);
    url.searchParams.set('genre', genre);

    if (node.closest('.artist-realm-player')) {
      const params = new URLSearchParams(location.search);
      const artistName = clean(document.querySelector('.artist-realm-player [data-realm-artist]')?.textContent);
      const artistIdentifier = clean(params.get('artist') || params.get('slug') || slugify(artistName));
      if (artistIdentifier) url.searchParams.set('source_artist', artistIdentifier);
      if (artistName) url.searchParams.set('source_artist_name', artistName);
    }

    openRoute(url, `${genre} song feed`);
  }

  function activate(node) {
    if (node.matches('#v2App [data-player] [data-partist]')) {
      openArtist(node);
      return true;
    }
    if (node.matches('#v2App [data-player] [data-pgenre], .artist-realm-player [data-realm-genre]')) {
      openGenre(node);
      return true;
    }
    return false;
  }

  document.addEventListener('click', event => {
    const node = event.target.closest('#v2App [data-player] [data-partist], #v2App [data-player] [data-pgenre], .artist-realm-player [data-realm-genre]');
    if (!node) return;
    event.preventDefault();
    event.stopPropagation();
    activate(node);
  }, true);

  document.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    const node = event.target.closest('#v2App [data-player] [data-partist], #v2App [data-player] [data-pgenre], .artist-realm-player [data-realm-genre]');
    if (!node) return;
    event.preventDefault();
    activate(node);
  });

  window.addEventListener('message', event => {
    if (event.origin !== ORIGIN || !event.data || typeof event.data !== 'object') return;

    if (event.data.type === 'stashbox:close-overlay') {
      closeRoute();
      return;
    }

    if (event.data.type === 'stashbox:play-song') {
      if (window.self !== window.top) {
        window.top.postMessage(event.data, ORIGIN);
        return;
      }

      const songKey = clean(event.data.songKey);
      if (!songKey) return;
      try {
        sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({
          songKey,
          mode: clean(event.data.mode || 'genre'),
          createdAt: Date.now()
        }));
      } catch (_) {}
      location.href = '/radio/attempt2/?artist_radio=1';
    }
  });

  window.addEventListener('popstate', () => {
    if (overlay && !history.state?.stashboxOverlay) closeRoute(true);
  });

  const observer = new MutationObserver(() => {
    markInteractive();
    removeLegacyDesktopMediaFitToggle();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  markInteractive();
  removeLegacyDesktopMediaFitToggle();
  loadPortraitArtworkReliability();

  window.StashboxPageOverlay = {
    open: openRoute,
    close: closeRoute,
    mark: markInteractive
  };
})();