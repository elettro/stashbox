(() => {
  'use strict';

  const form = document.getElementById('artistForm');
  const message = document.getElementById('message');
  if (!form || !message) return;

  let pending = false;
  let timer = 0;
  const toast = document.createElement('div');
  toast.className = 'artist-save-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  document.body.appendChild(toast);

  function show(kind, title, detail) {
    clearTimeout(timer);
    toast.className = `artist-save-toast ${kind || ''}`;
    toast.innerHTML = `<i>${kind === 'success' ? '✓' : kind === 'error' ? '!' : '…'}</i><span><strong>${title}</strong><small>${detail}</small></span>`;
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    timer = window.setTimeout(() => toast.classList.remove('is-visible'), kind === 'error' ? 5200 : 3000);
  }

  form.addEventListener('submit', () => {
    pending = true;
    show('', 'Saving Artist', 'Sending the complete artist profile to Stashbox Radio…');
  }, true);

  new MutationObserver(() => {
    if (!pending) return;
    const text = message.textContent.trim();
    if (!text) return;
    if (message.classList.contains('error')) {
      pending = false;
      show('error', 'Artist Not Saved', text);
      return;
    }
    if (/\bsaved\.?$/i.test(text) || /artist.+saved/i.test(text)) {
      pending = false;
      show('success', 'Artist Saved', text);
    }
  }).observe(message, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
})();
