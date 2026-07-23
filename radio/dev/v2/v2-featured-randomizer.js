(() => {
  'use strict';

  const STORAGE_KEY = 'stashbox_v2_previous_featured_song_keys';
  const FEATURE_COUNT = 8;

  const shuffle = items => {
    const list = [...items];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [list[index], list[randomIndex]] = [list[randomIndex], list[index]];
    }
    return list;
  };

  const readPrevious = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch (_) {
      return [];
    }
  };

  const saveCurrent = keys => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); }
    catch (_) {}
  };

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const collectSongs = () => {
    const seen = new Set();
    return [...document.querySelectorAll('#v2App .v2-song-grid [data-song]')]
      .map(card => {
        const key = String(card.dataset.song || '').trim();
        const image = card.querySelector('img');
        return {
          key,
          title: String(card.querySelector('h3')?.textContent || '').trim(),
          artist: String(card.querySelector('p')?.textContent || 'Stashbox').trim(),
          genre: String(card.querySelector('.v2-song-copy > span')?.textContent || 'Other').trim(),
          art: String(image?.currentSrc || image?.src || '').trim()
        };
      })
      .filter(song => song.key && song.title && song.art && !seen.has(song.key) && seen.add(song.key));
  };

  const chooseFeatured = songs => {
    const previous = readPrevious();
    const previousSet = new Set(previous);
    const freshPool = shuffle(songs.filter(song => !previousSet.has(song.key)));
    const repeatPool = shuffle(songs.filter(song => previousSet.has(song.key)));
    const pool = [...freshPool, ...repeatPool];
    const selected = [];

    while (pool.length && selected.length < Math.min(FEATURE_COUNT, songs.length)) {
      const last = selected[selected.length - 1];
      let pickIndex = pool.findIndex(song => !last || (song.artist !== last.artist && song.genre !== last.genre));
      if (pickIndex < 0) pickIndex = pool.findIndex(song => !last || song.artist !== last.artist);
      if (pickIndex < 0) pickIndex = 0;
      selected.push(pool.splice(pickIndex, 1)[0]);
    }

    const currentKeys = selected.map(song => song.key);
    const sameOrder = currentKeys.length === previous.length && currentKeys.every((key, index) => key === previous[index]);
    if (sameOrder && selected.length > 1) selected.push(selected.shift());

    saveCurrent(selected.map(song => song.key));
    return selected;
  };

  const cardMarkup = song => `
    <article class="v2-feature-card" data-song="${escapeHtml(song.key)}" tabindex="0">
      <div class="v2-feature-art">
        <img src="${escapeHtml(song.art)}" alt="${escapeHtml(song.title)} artwork" loading="lazy">
        <span class="v2-feature-label">Trending Now</span>
        <button class="v2-art-play" tabindex="-1" aria-label="Play ${escapeHtml(song.title)}">
          <svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"></path></svg>
        </button>
      </div>
      <h3>${escapeHtml(song.title)}</h3>
      <p>${escapeHtml(song.artist)}</p>
      <span>${escapeHtml(song.genre)}</span>
    </article>`;

  const randomizeFeed = () => {
    const row = document.querySelector('#v2App .v2-featured-row');
    const songs = collectSongs();
    if (!row || songs.length < 2) return false;

    const featured = chooseFeatured(songs);
    row.innerHTML = featured.map(cardMarkup).join('');
    row.scrollLeft = 0;
    row.closest('[data-carousel-shell]')?.dispatchEvent(new Event('scroll'));
    return true;
  };

  document.addEventListener('click', event => {
    const logo = event.target.closest('#v2App .v2-wordmark, #v2App .v2-player-mark');
    if (!logo) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.reload();
  }, true);

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    if (randomizeFeed() || attempts >= 200) window.clearInterval(timer);
  }, 50);
})();
