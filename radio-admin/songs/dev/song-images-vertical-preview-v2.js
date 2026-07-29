(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;
  if (window.__stashboxSongImagesVerticalPreviewV2Installed) return;
  window.__stashboxSongImagesVerticalPreviewV2Installed = true;

  function installStyles() {
    if (document.getElementById('songImagesVerticalPreviewV2Styles')) return;

    const style = document.createElement('style');
    style.id = 'songImagesVerticalPreviewV2Styles';
    style.textContent = `
      .song-image-card[data-song-image-ratio="9x16"] .song-image-preview{
        width:min(100%,320px)!important;
        height:auto!important;
        min-height:0!important;
        max-height:none!important;
        aspect-ratio:9 / 16!important;
        margin-left:auto!important;
        margin-right:auto!important;
        padding:10px!important;
        overflow:hidden!important;
        background:#080d0b!important;
      }
      .song-image-card[data-song-image-ratio="9x16"] .song-image-preview img{
        display:block!important;
        width:100%!important;
        height:100%!important;
        min-width:0!important;
        min-height:0!important;
        max-width:100%!important;
        max-height:100%!important;
        object-fit:contain!important;
        object-position:center center!important;
      }
      @media(max-width:640px){
        .song-image-card[data-song-image-ratio="9x16"] .song-image-preview{
          width:min(100%,360px)!important;
          height:auto!important;
          aspect-ratio:9 / 16!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function makeVerticalPreview(card) {
    const ratio = String(card.querySelector('.song-image-ratio')?.textContent || '')
      .trim()
      .toLowerCase();

    if (ratio !== '9x16') {
      card.removeAttribute('data-song-image-ratio');
      return;
    }

    card.setAttribute('data-song-image-ratio', '9x16');
    const preview = card.querySelector('.song-image-preview');
    const image = preview?.querySelector('img');
    if (!preview || !image) return;

    // Inline important values guarantee that the global fixed-height preview
    // treatment cannot crop or flatten the vertical artwork.
    preview.style.setProperty('width', 'min(100%, 320px)', 'important');
    preview.style.setProperty('height', 'auto', 'important');
    preview.style.setProperty('min-height', '0', 'important');
    preview.style.setProperty('max-height', 'none', 'important');
    preview.style.setProperty('aspect-ratio', '9 / 16', 'important');
    preview.style.setProperty('margin-left', 'auto', 'important');
    preview.style.setProperty('margin-right', 'auto', 'important');

    image.style.setProperty('width', '100%', 'important');
    image.style.setProperty('height', '100%', 'important');
    image.style.setProperty('max-width', '100%', 'important');
    image.style.setProperty('max-height', '100%', 'important');
    image.style.setProperty('object-fit', 'contain', 'important');
    image.style.setProperty('object-position', 'center center', 'important');
  }

  function applyToAll(root = document) {
    root.querySelectorAll?.('.song-image-card').forEach(makeVerticalPreview);
  }

  installStyles();
  applyToAll();

  const observer = new MutationObserver(() => applyToAll());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
