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
    let artistLink = meta.querySelector(':scope > .player-artist-name-link');
    const artistStrong = meta.querySelector(':scope > strong');

    if (!artistLink && artistStrong && generatedProfileLink) {
      artistLink = document.createElement('a');
      artistLink.className = 'player-artist-name-link';
      artistLink.textContent = artistStrong.textContent || '';
      artistLink.href = generatedProfileLink.href;
      artistLink.title = generatedProfileLink.title || `Open ${artistLink.textContent.trim()} artist profile`;
      artistStrong.replaceWith(artistLink);
    } else if (artistLink && generatedProfileLink) {
      artistLink.href = generatedProfileLink.href;
      artistLink.title = generatedProfileLink.title || artistLink.title;
    }

    generatedProfileLink?.remove();

    if (artistLink && control && artistLink.nextElementSibling !== control) {
      artistLink.after(control);
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
