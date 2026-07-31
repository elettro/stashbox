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
        cursor:zoom-in;
      }
      .song-image-preview.is-empty{cursor:default}
      .song-image-preview:not(.is-empty):focus-visible{
        outline:3px solid rgba(66,217,130,.9);
        outline-offset:3px;
      }
      .song-image-lightbox[hidden]{display:none!important}
      .song-image-lightbox{
        position:fixed!important;
        inset:0!important;
        z-index:100000!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        padding:22px!important;
        background:rgba(0,0,0,.92)!important;
        backdrop-filter:blur(8px);
      }
      .song-image-lightbox-panel{
        position:relative!important;
        width:min(96vw,1600px)!important;
        height:min(92vh,1100px)!important;
        height:min(92dvh,1100px)!important;
        display:grid!important;
        grid-template-rows:auto minmax(0,1fr)!important;
        gap:12px!important;
        padding:16px!important;
        overflow:hidden!important;
        border:1px solid rgba(255,255,255,.2)!important;
        border-radius:18px!important;
        background:#080b0a!important;
        box-shadow:0 24px 90px rgba(0,0,0,.65)!important;
      }
      .song-image-lightbox-header{
        display:flex!important;
        align-items:center!important;
        justify-content:space-between!important;
        gap:16px!important;
        min-height:38px!important;
      }
      .song-image-lightbox-title{
        margin:0!important;
        color:#f1f7f3!important;
        font-size:.94rem!important;
        font-weight:850!important;
      }
      .song-image-lightbox-close{
        width:40px!important;
        height:40px!important;
        display:grid!important;
        place-items:center!important;
        flex:0 0 40px!important;
        border:1px solid rgba(255,255,255,.22)!important;
        border-radius:999px!important;
        background:#18201d!important;
        color:#fff!important;
        font:inherit!important;
        font-size:1.35rem!important;
        line-height:1!important;
        cursor:pointer!important;
      }
      .song-image-lightbox-close:hover{border-color:rgba(66,217,130,.8)!important}
      .song-image-lightbox-stage{
        min-width:0!important;
        min-height:0!important;
        width:100%!important;
        height:100%!important;
        display:flex!important;
        align-items:center!important;
        justify-content:center!important;
        overflow:hidden!important;
        padding:12px!important;
        border-radius:12px!important;
        background:#030504!important;
      }
      img.song-image-lightbox-image{
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
        margin:auto!important;
        padding:0!important;
        border:0!important;
        border-radius:0!important;
        transform:none!important;
      }
      body.song-image-lightbox-open{overflow:hidden!important}
      @media(max-width:640px){
        .song-image-lightbox{padding:8px!important}
        .song-image-lightbox-panel{
          width:100%!important;
          height:96vh!important;
          height:96dvh!important;
          padding:10px!important;
          border-radius:13px!important;
        }
        .song-image-lightbox-stage{padding:6px!important}
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
      image.removeAttribute('width');
      image.removeAttribute('height');
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

    modalImage.removeAttribute('width');
    modalImage.removeAttribute('height');
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
