(() => {
  'use strict';

  const slugify = value => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'stashbox';

  document.addEventListener('click', event => {
    const card = event.target.closest('#v2App .v2-artist-card[data-artist]');
    if (!card) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    location.href = `/radio/dev/v2/artist/?artist=${encodeURIComponent(slugify(card.dataset.artist))}`;
  }, true);
})();
