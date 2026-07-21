(() => {
  const STYLE_ID = 'stashbox-artist-metadata-layout-style';
  let queued = false;

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .player-info .player-title-row{
        display:flex;
        align-items:center;
        gap:10px;
        flex-wrap:wrap;
      }
      .player-info .player-title-row h2{
        margin:0;
      }
      .player-info .player-title-row > .genre-tag{
        margin:0;
        flex:0 0 auto;
      }
      .player-info .meta{
        display:flex;
        align-items:center;
        gap:8px;
        flex-wrap:wrap;
      }
      .player-artist-name-link{
        color:#fff;
        text-decoration:none;
        font-weight:900;
        line-height:1.2;
        border-bottom:1px solid transparent;
        cursor:pointer;
        transition:color .16s ease,border-color .16s ease;
      }
      .player-artist-name-link:hover,
      .player-artist-name-link:focus-visible{
        color:#ffd064;
        border-bottom-color:#ffd064;
        outline:none;
      }
      .player-info .meta > .artist-follow-control{
        margin-left:0;
      }
      .player-info .meta > span:not(.artist-follow-control):not(.genre-tag){
        color:#98a0a9;
      }
      @media(max-width:700px){
        .player-info .player-title-row{gap:7px}
        .player-info .meta{gap:7px}
        .player-info .meta > .artist-follow-control{
          display:inline-flex;
          margin:0;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function bindArtistNavigation(artistNode, profileLink) {
    if (!artistNode || !profileLink) return;
    artistNode.classList.add('player-artist-name-link');
    artistNode.setAttribute('role', 'link');
    artistNode.tabIndex = 0;
    artistNode.dataset.artistProfileHref = profileLink.href;
    artistNode.title = profileLink.title || `Open ${String(artistNode.textContent || '').trim()} artist profile`;

    if (artistNode.dataset.artistNavigationBound === '1') return;
    artistNode.dataset.artistNavigationBound = '1';
    const openArtist = event => {
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const href = artistNode.dataset.artistProfileHref;
      if (href) window.location.href = href;
    };
    artistNode.addEventListener('click', openArtist);
    artistNode.addEventListener('keydown', openArtist);
  }

  function organizePlayerMetadata() {
    injectStyle();
    const playerInfo = document.querySelector('.player-info');
    const titleRow = playerInfo?.querySelector('.player-title-row');
    const meta = playerInfo?.querySelector('.meta');
    if (!titleRow || !meta) return;

    const genre = meta.querySelector(':scope > .genre-tag') || titleRow.querySelector(':scope > .genre-tag');
    if (genre && genre.parentElement !== titleRow) titleRow.appendChild(genre);

    const control = meta.querySelector(':scope > .artist-follow-control');
    const generatedProfileLink = control?.querySelector('.artist-profile-link');
    const artistNode = meta.querySelector(':scope > strong, :scope > .player-artist-name-link');

    if (artistNode && generatedProfileLink) {
      bindArtistNavigation(artistNode, generatedProfileLink);
    }

    generatedProfileLink?.remove();

    if (artistNode && control && artistNode.nextElementSibling !== control) {
      artistNode.after(control);
    }
  }

  function queueOrganize() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      organizePlayerMetadata();
    });
  }

  injectStyle();
  queueOrganize();
  new MutationObserver(queueOrganize).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();
