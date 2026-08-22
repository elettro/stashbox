(() => {
  'use strict';

  if (window.__stashboxArtistProfileLinksLoaded) return;
  window.__stashboxArtistProfileLinksLoaded = true;

  const slugify = value => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'stashbox';

  const playerArtistTarget = target => target.closest(
    '#v2App [data-partist], #v2App [data-player-artist], #v2App [data-avatar], #v2App [data-player-avatar]'
  );

  function artistNameFor(target) {
    const player = target.closest('[data-player], .v2-player');
    return String(
      player?.querySelector('[data-partist], [data-player-artist]')?.textContent || ''
    ).trim();
  }

  function artistHref(name, player = null) {
    const key = String(
      player?.dataset?.artistProfileKey ||
      player?.querySelector('[data-li-artist]')?.dataset?.artistKey ||
      slugify(name)
    ).trim();
    return `/radio/artist/?artist=${encodeURIComponent(key)}`;
  }

  function openPlayerArtist(target) {
    const name = artistNameFor(target);
    if (!name) return false;
    location.href = artistHref(name, target.closest('[data-player], .v2-player'));
    return true;
  }

  function activateNames() {
    document.querySelectorAll('#v2App [data-partist], #v2App [data-player-artist], #v2App [data-avatar], #v2App [data-player-avatar]').forEach(node => {
      const player = node.closest('[data-player], .v2-player');
      const name = String(player?.querySelector('[data-partist], [data-player-artist]')?.textContent || '').trim();
      if (!name) return;
      node.classList.add('v2-artist-profile-link');
      node.setAttribute('role', 'link');
      node.setAttribute('tabindex', '0');
      node.setAttribute('title', `View ${name} artist profile`);
      node.setAttribute('aria-label', `View ${name} artist profile and follow artist`);
    });
  }

  document.addEventListener('click', event => {
    const playerArtist = playerArtistTarget(event.target);
    if (playerArtist) {
      event.preventDefault();
      event.stopPropagation();
      openPlayerArtist(playerArtist);
      return;
    }

    const card = event.target.closest('#v2App .v2-artist-card[data-artist], #v2App .v2-artist-card[data-artist-filter]');
    if (!card) return;
    const name = card.dataset.artist || card.dataset.artistFilter;
    if (!name) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href = artistHref(name);
  }, true);

  document.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const playerArtist = playerArtistTarget(event.target);
    if (!playerArtist) return;
    event.preventDefault();
    openPlayerArtist(playerArtist);
  }, true);

  const style = document.createElement('style');
  style.textContent = `
    #v2App .v2-artist-profile-anchor,
    #v2App .v2-artist-profile-link {
      color: inherit;
      cursor: pointer;
      text-decoration: none;
    }
    #v2App .v2-artist-profile-link:focus-visible,
    #v2App .v2-artist-profile-anchor:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 3px;
    }
  `;
  document.head.appendChild(style);

  activateNames();
  const observer = new MutationObserver(activateNames);
  observer.observe(document.getElementById('v2App') || document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
