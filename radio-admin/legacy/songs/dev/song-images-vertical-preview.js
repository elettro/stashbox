(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;
  if (window.__stashboxSongImagesVerticalPreviewInstalled) return;
  window.__stashboxSongImagesVerticalPreviewInstalled = true;

  function installStyles() {
    if (document.getElementById('songImagesVerticalPreviewStyles')) return;

    const style = document.createElement('style');
    style.id = 'songImagesVerticalPreviewStyles';
    style.textContent = `
      .song-image-preview.song-image-preview-9x16{
        width:100%!important;
        height:auto!important;
        max-height:none!important;
        aspect-ratio:9 / 16!important;
        padding:10px!important;
        overflow:hidden!important;
      }
      .song-image-preview.song-image-preview-9x16 img{
        display:block!important;
        width:100%!important;
        height:100%!important;
        max-width:100%!important;
        max-height:100%!important;
        object-fit:contain!important;
        object-position:center center!important;
      }
      @media(max-width:640px){
        .song-image-preview.song-image-preview-9x16{
          height:auto!important;
          aspect-ratio:9 / 16!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function identifyVerticalPreview(root = document) {
    root.querySelectorAll?.('.song-image-card').forEach(card => {
      const ratio = String(card.querySelector('.song-image-ratio')?.textContent || '')
        .trim()
        .toLowerCase();
      const preview = card.querySelector('.song-image-preview');
      if (!preview) return;
      preview.classList.toggle('song-image-preview-9x16', ratio === '9x16');
    });
  }

  installStyles();
  identifyVerticalPreview();

  const observer = new MutationObserver(() => identifyVerticalPreview());
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
