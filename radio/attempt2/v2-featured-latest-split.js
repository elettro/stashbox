(() => {
  'use strict';

  if (window.StashboxFeaturedLatestSplit) return;

  const app = document.getElementById('v2App');
  if (!app) return;

  const STORAGE_KEY = 'stashbox_v2_previous_random_featured_song_keys';
  const FEATURE_COUNT = 8;
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  let installed = false;

  const clean = value => String(value ?? '').trim();
  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function randomValue() {
    if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    return Math.random();
  }

  function shuffle(items) {
    const list = [...items];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(randomValue() * (index + 1));
      [list[index], list[randomIndex]] = [list[randomIndex], list[index]];
    }
    return list;
  }

  function readPrevious() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function saveCurrent(keys) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(keys)); }
    catch (_) {}
  }

  function collectSongs() {
    const seen = new Set();
    return [...app.querySelectorAll('.v2-song-grid [data-song]')]
      .map(card => {
        const key = clean(card.dataset.song);
        const image = card.querySelector('img');
        return {
          key,
          title: clean(card.querySelector('h3')?.textContent),
          artist: clean(card.querySelector('p')?.textContent) || 'Stashbox',
          genre: clean(card.querySelector('.v2-song-copy > span')?.textContent) || 'Other',
          art: clean(image?.currentSrc || image?.src) || FALLBACK
        };
      })
      .filter(song => song.key && song.title && song.art && !seen.has(song.key) && seen.add(song.key));
  }

  function chooseFeatured(songs) {
    const previous = readPrevious();
    const previousSet = new Set(previous);
    const freshPool = shuffle(songs.filter(song => !previousSet.has(song.key)));
    const repeatPool = shuffle(songs.filter(song => previousSet.has(song.key)));
    const pool = [...freshPool, ...repeatPool];
    const selected = [];

    while (pool.length && selected.length < Math.min(FEATURE_COUNT, songs.length)) {
      const last = selected.at(-1);
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
  }

  function cardMarkup(song) {
    return `
      <article class="v2-feature-card" data-song="${escapeHtml(song.key)}" tabindex="0">
        <div class="v2-feature-art">
          <img src="${escapeHtml(song.art)}" alt="${escapeHtml(song.title)} artwork" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">
          <span class="v2-feature-label">Trending Now</span>
          <button class="v2-art-play" tabindex="-1" aria-label="Play ${escapeHtml(song.title)}">
            <svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"></path></svg>
          </button>
        </div>
        <h3>${escapeHtml(song.title)}</h3>
        <p>${escapeHtml(song.artist)}</p>
        <span>${escapeHtml(song.genre)}</span>
      </article>`;
  }

  function isVecRow(row) {
    return [...(row?.querySelectorAll('.v2-feature-label') || [])]
      .some(label => /^(Fresh VEC|Recently Added)$/i.test(clean(label.textContent)));
  }

  function updateCarousel(section) {
    const shell = section?.querySelector('[data-carousel-shell]');
    const row = shell?.querySelector('[data-carousel-row]');
    if (!shell || !row) return;

    const update = () => {
      const overflow = row.scrollWidth > row.clientWidth + 4;
      const atStart = row.scrollLeft <= 4;
      const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
      shell.classList.toggle('has-overflow', overflow);
      const previous = shell.querySelector('.v2-carousel-prev');
      const next = shell.querySelector('.v2-carousel-next');
      if (previous) previous.disabled = !overflow || atStart;
      if (next) next.disabled = !overflow || atEnd;
    };

    row.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
    window.addEventListener('resize', update, { passive: true });
    requestAnimationFrame(update);
  }

  function install() {
    if (installed || app.querySelector('[data-featured-songs-section]')) return true;

    const latestRow = [...app.querySelectorAll('.v2-featured-row')].find(isVecRow);
    const latestSection = latestRow?.closest('.v2-section');
    const songs = collectSongs();
    if (!latestRow || !latestSection || songs.length < 2) return false;

    installed = true;
    latestSection.dataset.latestVideoUpdatesSection = 'true';
    latestSection.classList.add('v2-latest-video-updates-section');
    latestSection.querySelector('.v2-section-heading h2')?.replaceChildren('Latest Video Updates');
    latestRow.classList.add('v2-latest-video-updates-row');

    const featuredSection = latestSection.cloneNode(true);
    featuredSection.removeAttribute('data-latest-video-updates-section');
    featuredSection.dataset.featuredSongsSection = 'true';
    featuredSection.classList.remove('v2-latest-video-updates-section');
    featuredSection.classList.add('v2-random-featured-songs-section');
    featuredSection.querySelector('.v2-section-heading h2')?.replaceChildren('Featured Songs');

    const featuredRow = featuredSection.querySelector('.v2-featured-row');
    featuredRow?.classList.remove('v2-latest-video-updates-row');
    featuredRow?.classList.add('v2-random-featured-songs-row');
    if (featuredRow) {
      featuredRow.innerHTML = chooseFeatured(songs).map(cardMarkup).join('');
      featuredRow.scrollLeft = 0;
    }

    latestSection.insertAdjacentElement('beforebegin', featuredSection);
    updateCarousel(featuredSection);
    updateCarousel(latestSection);

    window.dispatchEvent(new CustomEvent('stashbox:featured-latest-split-ready', {
      detail: {
        featuredCount: featuredRow?.querySelectorAll('[data-song]').length || 0,
        latestCount: latestRow.querySelectorAll('[data-song]').length
      }
    }));
    return true;
  }

  window.addEventListener('stashbox:featured-vec-feed-ready', install, { once: true });

  let attempts = 0;
  const timer = window.setInterval(() => {
    attempts += 1;
    const vecReady = [...app.querySelectorAll('.v2-featured-row')].some(isVecRow);
    if ((vecReady && install()) || attempts >= 240) window.clearInterval(timer);
  }, 50);

  window.StashboxFeaturedLatestSplit = { install };
})();