(() => {
  const ARTISTS_HREF = '/radio-admin/artists/dev/';

  function addArtistsCmsLink() {
    const navs = document.querySelectorAll(
      'nav.radio-admin-private-nav, nav.radio-admin-macro-nav, nav.admin-nav, nav[aria-label="Stashbox Radio admin tools"]'
    );

    navs.forEach((nav) => {
      if (nav.querySelector(`a[href="${ARTISTS_HREF}"]`)) return;
      const songsLink = nav.querySelector('a[href="/radio-admin/songs/dev/"]');
      if (!songsLink) return;

      const artistsLink = document.createElement('a');
      artistsLink.href = ARTISTS_HREF;
      artistsLink.textContent = 'Artists';
      artistsLink.setAttribute('aria-label', 'Open Artist CMS');
      songsLink.insertAdjacentElement('afterend', artistsLink);
    });
  }

  addArtistsCmsLink();
  document.addEventListener('DOMContentLoaded', addArtistsCmsLink, { once: true });

  const coreScript = document.createElement('script');
  coreScript.src = '/radio-admin/dev/app-core.js?v=20260721-artists-nav1';
  coreScript.async = false;
  coreScript.onload = addArtistsCmsLink;
  coreScript.onerror = () => console.error('[DEV admin] Unable to load app-core.js.');
  document.head.appendChild(coreScript);
})();
