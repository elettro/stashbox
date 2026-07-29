(() => {
  'use strict';

  if (!window.location.pathname.includes('/radio-admin/songs/dev')) return;
  if (window.__stashboxSongImagePreviewModalInstalled) return;
  window.__stashboxSongImagePreviewModalInstalled = true;

  function installStyles() {
    if (document.getElementById('songImagePreviewModalStyles')) return;
    const style = document.createElement('style');
    style.id = 'songImagePreviewModalStyles';
    style.textContent = `
      .song-image-preview{
        width:100%!important;
        height:260px!important;
        max-height:none!important;
        aspect-ratio:auto!important;
        padding:10px!important;
        overflow:hidden!important;
        cursor:zoom-in;
      }
      .song-image-preview img{
        width:100%!important;
        height:100%!important;
        max-width:100%!important;
        max-height:100%!important;
        object-fit:contain!important;
        object-position:center center!important;
      }
      .song-image-preview.is-empty{cursor:default}
      .song-image-preview:not(.is-empty):focus-visible{
        outline:3px solid rgba(66,217,130,.9);
        outline-offset:3px;
      }
      .song-image-lightbox[hidden]{display:none!important}
      .song-image-lightbox{
        position:fixed;
        inset:0;
        z-index:100000;
        display:grid;
        place-items:center;
        padding:22px;
        background:rgba(0,0,0,.9);
        backdrop-filter:blur(8px);
      }
      .song-image-lightbox-panel{
        position:relative;
        width:min(96vw,1600px);
        height:min(92vh,1100px);
        display:grid;
        grid-template-rows:auto minmax(0,1fr);
        gap:12px;
        padding:16px;
        border:1px solid rgba(255,255,255,.2);
        border-radius:18px;
        background:#080b0a;
        box-shadow:0 24px 90px rgba(0,0,0,.65);
      }
      .song-image-lightbox-header{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        min-height:38px;
      }
      .song-image-lightbox-title{
        margin:0;
        color:#f1f7f3;
        font-size:.94rem;
        font-weight:850;
      }
      .song-image-lightbox-close{
        width:40px;
        height:40px;
        display:grid;
        place-items:center;
        border:1px solid rgba(255,255,255,.22);
        border-radius:999px;
        background:#18201d;
        color:#fff;
        font:inherit;
        font-size:1.35rem;
        line-height:1;
        cursor:pointer;
      }
      .song-image-lightbox-close:hover{border-color:rgba(66,217,130,.8)}
      .song-image-lightbox-stage{
        min-width:0;
        min-height:0;
        display:grid;
        place-items:center;
        overflow:hidden;
        border-radius:12px;
        background:#030504;
      }
      .song-image-lightbox-image{
        display:block;
        width:100%;
        height:100%;
        max-width:100%;
        max-height:100%;
        object-fit:contain;
        object-position:center center;
      }
      body.song-image-lightbox-open{overflow:hidden!important}
      @media(max-width:640px){
        .song-image-preview{height:340px!important}
        .song-image-lightbox{padding:8px}
        .song-image-lightbox-panel{width:100%;height:96vh;padding:10px;border-radius:13px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    let modal = document.getElementById('songImageLightbox');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'songImageLightbox';
    modal.className = 'song-image-lightbox';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'songImageLightboxTitle');
    modal.innerHTML = `
      <div class="song-image-lightbox-panel">
        <div class="song-image-lightbox-header">
          <p id="songImageLightboxTitle" class="song-image-lightbox-title">Song image preview</p>
          <button class="song-image-lightbox-close" type="button" aria-label="Close full image preview">×</button>
        </div>
        <div class="song-image-lightbox-stage">
          <img class="song-image-lightbox-image" alt="" />
        </div>
      </div>
    `;

    const closeButton = modal.querySelector('.song-image-lightbox-close');
    const closeModal = () => {
      modal.hidden = true;
      document.body.classList.remove('song-image-lightbox-open');
      const image = modal.querySelector('.song-image-lightbox-image');
      image.removeAttribute('src');
    };

    closeButton.addEventListener('click', closeModal);
    modal.addEventListener('click', event => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !modal.hidden) closeModal();
    });

    modal.closeSongImageLightbox = closeModal;
    document.body.appendChild(modal);
    return modal;
  }

  function openModal(preview) {
    if (!preview || preview.classList.contains('is-empty')) return;
    const sourceImage = preview.querySelector('img');
    const source = sourceImage?.currentSrc || sourceImage?.src || '';
    if (!source) return;

    const modal = ensureModal();
    const modalImage = modal.querySelector('.song-image-lightbox-image');
    const title = modal.querySelector('.song-image-lightbox-title');
    modalImage.src = source;
    modalImage.alt = sourceImage.alt || 'Full song image preview';
    title.textContent = sourceImage.alt || 'Song image preview';
    modal.hidden = false;
    document.body.classList.add('song-image-lightbox-open');
    modal.querySelector('.song-image-lightbox-close').focus();
  }

  function preparePreviews(root = document) {
    root.querySelectorAll?.('.song-image-preview').forEach(preview => {
      const isAvailable = !preview.classList.contains('is-empty') && Boolean(preview.querySelector('img')?.src);
      if (!isAvailable) {
        preview.removeAttribute('tabindex');
        preview.removeAttribute('role');
        preview.removeAttribute('aria-label');
        return;
      }
      preview.tabIndex = 0;
      preview.setAttribute('role', 'button');
      preview.setAttribute('aria-label', 'Open full image preview');
      preview.title = 'Click to view the full image';
    });
  }

  installStyles();
  ensureModal();
  preparePreviews();

  document.addEventListener('click', event => {
    const preview = event.target.closest?.('.song-image-preview');
    if (preview) openModal(preview);
  });

  document.addEventListener('keydown', event => {
    const preview = event.target.closest?.('.song-image-preview');
    if (!preview || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    openModal(preview);
  });

  const observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      mutation.addedNodes.forEach(node => {
        if (!(node instanceof Element)) return;
        if (node.matches('.song-image-preview')) preparePreviews(node.parentElement || node);
        else if (node.querySelector('.song-image-preview')) preparePreviews(node);
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
