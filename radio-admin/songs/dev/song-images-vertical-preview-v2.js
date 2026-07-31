(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;
  if (window.__stashboxSongImagesFullPreviewInstalled) return;
  window.__stashboxSongImagesFullPreviewInstalled = true;

  const SUPPORTED_RATIOS = new Set(['1x1', '9x16', '16x9', '3x4', '4x5', '21x9']);

  function installStyles() {
    if (document.getElementById('songImagesFullPreviewStyles')) return;

    const style = document.createElement('style');
    style.id = 'songImagesFullPreviewStyles';
    style.textContent = `
      .song-image-card[data-song-image-ratio] .song-image-preview{
        width:100%!important;
        height:300px!important;
        min-height:300px!important;
        max-height:300px!important;
        aspect-ratio:auto!important;
        margin-left:auto!important;
        margin-right:auto!important;
        padding:10px!important;
        overflow:hidden!important;
        background:#080d0b!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
      }
      .song-image-card[data-song-image-ratio] .song-image-preview img{
        display:block!important;
        width:auto!important;
        height:auto!important;
        min-width:0!important;
        min-height:0!important;
        max-width:100%!important;
        max-height:100%!important;
        object-fit:contain!important;
        object-position:center center!important;
        flex:0 1 auto!important;
      }
      .song-image-card[data-song-image-ratio] .song-image-preview.is-empty img{
        padding:18px!important;
      }
      @media(max-width:640px){
        .song-image-card[data-song-image-ratio] .song-image-preview{
          height:360px!important;
          min-height:360px!important;
          max-height:360px!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function showCompleteArtwork(card) {
    const ratio = String(card.querySelector('.song-image-ratio')?.textContent || '')
      .trim()
      .toLowerCase();

    if (!SUPPORTED_RATIOS.has(ratio)) {
      card.removeAttribute('data-song-image-ratio');
      return;
    }

    card.setAttribute('data-song-image-ratio', ratio);
    const preview = card.querySelector('.song-image-preview');
    const image = preview?.querySelector('img');
    if (!preview || !image) return;

    preview.style.setProperty('width', '100%', 'important');
    preview.style.setProperty('height', window.matchMedia('(max-width: 640px)').matches ? '360px' : '300px', 'important');
    preview.style.setProperty('min-height', window.matchMedia('(max-width: 640px)').matches ? '360px' : '300px', 'important');
    preview.style.setProperty('max-height', window.matchMedia('(max-width: 640px)').matches ? '360px' : '300px', 'important');
    preview.style.setProperty('aspect-ratio', 'auto', 'important');
    preview.style.setProperty('display', 'flex', 'important');
    preview.style.setProperty('align-items', 'center', 'important');
    preview.style.setProperty('justify-content', 'center', 'important');
    preview.style.setProperty('padding', '10px', 'important');

    image.style.setProperty('width', 'auto', 'important');
    image.style.setProperty('height', 'auto', 'important');
    image.style.setProperty('min-width', '0', 'important');
    image.style.setProperty('min-height', '0', 'important');
    image.style.setProperty('max-width', '100%', 'important');
    image.style.setProperty('max-height', '100%', 'important');
    image.style.setProperty('object-fit', 'contain', 'important');
    image.style.setProperty('object-position', 'center center', 'important');
  }

  function applyToAll(root = document) {
    root.querySelectorAll?.('.song-image-card').forEach(showCompleteArtwork);
  }

  installStyles();
  applyToAll();

  const observer = new MutationObserver(() => applyToAll());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('resize', () => applyToAll());
})();
