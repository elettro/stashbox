(() => {
  'use strict';

  let timer = 0;
  let pendingAccountSave = false;
  const toast = document.createElement('div');
  toast.className = 'profile-save-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  function show(kind, title, detail) {
    clearTimeout(timer);
    toast.className = `profile-save-toast ${kind || ''}`;
    toast.innerHTML = `<i>${kind === 'success' ? '✓' : kind === 'error' ? '!' : '…'}</i><span><strong>${title}</strong><small>${detail}</small></span>`;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    timer = window.setTimeout(() => toast.classList.remove('is-visible'), kind === 'error' ? 5200 : 3000);
  }

  document.addEventListener('submit', event => {
    const form = event.target.closest('form[data-form="account"]');
    if (!form) return;
    pendingAccountSave = true;
    show('', 'Saving Profile', 'Saving your account information and profile settings…');
  }, true);

  new MutationObserver(() => {
    document.querySelectorAll('.profile-message, .profile-media-status').forEach(node => {
      const text = node.textContent.trim();
      if (!text || node.dataset.saveToastSeen === text) return;
      if (pendingAccountSave && node.classList.contains('profile-message')) {
        if (node.classList.contains('error')) {
          node.dataset.saveToastSeen = text;
          pendingAccountSave = false;
          show('error', 'Profile Not Saved', text);
        } else if (/profile saved/i.test(text)) {
          node.dataset.saveToastSeen = text;
          pendingAccountSave = false;
          show('success', 'Profile Saved', text);
        }
      }
      if (node.classList.contains('profile-media-status') && /uploaded and saved|image removed/i.test(text)) {
        node.dataset.saveToastSeen = text;
        show('success', 'Profile Image Saved', text);
      }
      if (node.classList.contains('profile-media-status') && node.classList.contains('error')) {
        node.dataset.saveToastSeen = text;
        show('error', 'Image Not Saved', text);
      }
    });
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
})();
