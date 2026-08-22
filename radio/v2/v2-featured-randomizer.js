(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const FEATURE_COUNT = 8;
  const FRESH_WINDOW = 24;
  const PREVIOUS_KEY = 'stashbox_v2_previous_featured_song_keys';

  let catalogPromise = null;
  let activeMood = '';
  let moodGridObserver = null;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const dateStamp = value => {
    const stamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(stamp) ? stamp : 0;
  };
  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); }
      catch (_) { return data; }
    }
    return data;
  }

  function rows(data, names) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const name of names) if (Array.isArray(data?.[name])) return data[name];
    return [];
  }

  async function json(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = {}; }
    body = unwrap(body);
    if (!response.ok) throw new Error(body?.error || body?.message || `HTTP ${response.status}`);
    return body;
  }

  function parseList(value) {
    if (Array.isArray(value)) return value.flatMap(parseList);
    if (value == null) return [];
    if (typeof value === 'object') return Object.values(value).flatMap(parseList);
    const text = clean(value);
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      if (parsed !== text) return parseList(parsed);
    } catch (_) {}
    return text.split(/[\n,|;/]+/).map(clean).filter(Boolean);
  }

  function moodsFor(row) {
    const seen = new Set();
    return [
      ...parseList(row.mood_tags),
      ...parseList(row.moods),
      ...parseList(row.mood),
      ...parseList(row.primary_mood),
      ...parseList(row.secondary_mood)
    ].filter(value => {
      const key = normalize(value);
      if (!key || ['none', 'null', 'n/a', 'other'].includes(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function normalizeSong(row, index) {
    return {
      key: clean(row.song_key || row.songKey || row.song_id || row.id || `song-${index}`),
      title: clean(row.display_title || row.title || row.song_name || `Song ${index + 1}`),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      genre: clean(row.genre || row.primary_genre || 'Other'),
      art: clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url) || FALLBACK,
      audio: clean(row.audio_url || row.audioUrl || row.mp3_url || row.stream_url || row.audio_file_url || row.file_url),
      plays: number(row.total_plays ?? row.plays ?? row.play_count),
      date: Math.max(dateStamp(row.updated_at), dateStamp(row.created_at), dateStamp(row.release_date)),
      moods: moodsFor(row),
      vecEnabled: row.enhanced_visuals_enabled !== false
    };
  }

  function getCatalog() {
    if (!catalogPromise) {
      catalogPromise = json(SONGS_URL)
        .then(body => rows(body, ['songs', 'items', 'data']).map(normalizeSong).filter(song => song.key && song.title))
        .catch(error => {
          catalogPromise = null;
          throw error;
        });
    }
    return catalogPromise;
  }

  function randomValue() {
    if (globalThis.crypto?.getRandomValues) return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    return Math.random();
  }

  function shuffle(items) {
    const list = [...items];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(randomValue() * (index + 1));
      [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
    }
    return list;
  }

  // Discovery is catalog-only. It must never fetch one VEC recipe per song.
  // The active player is the only component allowed to resolve a recipe.
  function buildVecFeed(songs) {
    return songs
      .map(song => ({ song, vecStamp: song.vecEnabled ? song.date : 0 }))
      .sort((a, b) =>
        b.vecStamp - a.vecStamp ||
        b.song.date - a.song.date ||
        b.song.plays - a.song.plays ||
        a.song.title.localeCompare(b.song.title)
      );
  }

  function readPrevious() {
    try {
      const value = JSON.parse(localStorage.getItem(PREVIOUS_KEY) || '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function chooseFeatured(feed) {
    if (!feed.length) return [];
    const windowed = feed.slice(0, Math.min(FRESH_WINDOW, feed.length));
    const previous = new Set(readPrevious());
    const fresh = windowed.filter(item => !previous.has(item.song.key));
    const repeats = windowed.filter(item => previous.has(item.song.key));
    const pool = [...fresh, ...repeats, ...feed.slice(windowed.length)];
    const selected = [];

    while (pool.length && selected.length < Math.min(FEATURE_COUNT, feed.length)) {
      const last = selected.at(-1)?.song;
      let index = pool.findIndex(item => !last || (item.song.artist !== last.artist && item.song.genre !== last.genre));
      if (index < 0) index = pool.findIndex(item => !last || item.song.artist !== last.artist);
      if (index < 0) index = 0;
      selected.push(pool.splice(index, 1)[0]);
    }

    try { localStorage.setItem(PREVIOUS_KEY, JSON.stringify(selected.map(item => item.song.key))); }
    catch (_) {}
    return selected;
  }

  function featureMarkup(item) {
    const song = item.song;
    const label = song.vecEnabled ? 'VEC Enabled' : 'Recently Added';
    return `
      <article class="v2-feature-card" data-song="${escapeHtml(song.key)}" tabindex="0">
        <div class="v2-feature-art">
          <img src="${escapeHtml(song.art)}" alt="${escapeHtml(song.title)} artwork" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">
          <span class="v2-feature-label">${label}</span>
          <button class="v2-art-play" tabindex="-1" aria-label="Play ${escapeHtml(song.title)}">
            <svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"></path></svg>
          </button>
        </div>
        <h3>${escapeHtml(song.title)}</h3>
        <p>${escapeHtml(song.artist)}</p>
        <span>${escapeHtml(song.genre)}</span>
      </article>`;
  }

  function renderFeatured(songs) {
    const row = app.querySelector('.v2-featured-row');
    if (!row || !songs.length) return false;
    const featured = chooseFeatured(buildVecFeed(songs));
    if (!featured.length) return false;
    row.innerHTML = featured.map(featureMarkup).join('');
    row.scrollLeft = 0;
    row.closest('[data-carousel-shell]')?.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new CustomEvent('stashbox:featured-vec-feed-ready', {
      detail: { count: featured.length, vecCount: featured.filter(item => item.song.vecEnabled).length }
    }));
    return true;
  }

  function moodMap(songs) {
    const map = new Map();
    songs.forEach(song => song.moods.forEach(mood => {
      const key = normalize(mood);
      if (!map.has(key)) map.set(key, { label: mood, songKeys: new Set() });
      map.get(key).songKeys.add(song.key);
    }));
    return map;
  }

  function arrow(direction, label) {
    const path = direction < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6';
    return `<button class="v2-carousel-arrow ${direction < 0 ? 'v2-carousel-prev' : 'v2-carousel-next'}" type="button" data-carousel-direction="${direction}" aria-label="${label}"><svg viewBox="0 0 24 24"><path d="${path}"/></svg></button>`;
  }

  function moodSectionMarkup(entries) {
    return `
      <section class="v2-section v2-mood-section" data-mood-section>
        <div class="v2-section-heading"><h2>Moods</h2></div>
        <div class="v2-carousel-shell" data-carousel-shell>
          ${arrow(-1, 'Scroll moods left')}
          <div class="v2-horizontal v2-category-row v2-mood-row" data-carousel-row>
            ${entries.map(([key, value], index) => `<button class="v2-category-card tone-${index % 6}" data-mood="${escapeHtml(key)}" aria-pressed="false"><strong>${escapeHtml(value.label)}</strong><small>${value.songKeys.size} track${value.songKeys.size === 1 ? '' : 's'}</small></button>`).join('')}
          </div>
          ${arrow(1, 'Scroll moods right')}
        </div>
      </section>`;
  }

  function updateMoodCarousel(section) {
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

  function renderMoodFeed(songs) {
    if (app.querySelector('[data-mood-section]')) return true;
    const genreRow = app.querySelector('.v2-category-row[data-carousel-row]');
    const genreSection = genreRow?.closest('.v2-section');
    if (!genreSection) return false;

    const entries = shuffle([...moodMap(songs).entries()]);
    if (!entries.length) return true;
    const holder = document.createElement('div');
    holder.innerHTML = moodSectionMarkup(entries).trim();
    const section = holder.firstElementChild;
    genreSection.insertAdjacentElement('afterend', section);
    updateMoodCarousel(section);
    window.dispatchEvent(new CustomEvent('stashbox:mood-feed-ready', { detail: { count: entries.length } }));
    return true;
  }

  function updateMoodButtons() {
    app.querySelectorAll('[data-mood]').forEach(button => {
      const active = Boolean(activeMood && button.dataset.mood === activeMood);
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function applyMoodFilter() {
    const cards = [...app.querySelectorAll('.v2-song-grid [data-song]')];
    if (!cards.length) return;
    const catalog = window.__stashboxMoodCatalog || [];
    const matching = activeMood
      ? new Set(catalog.filter(song => song.moods.some(mood => normalize(mood) === activeMood)).map(song => song.key))
      : null;
    let visible = 0;
    cards.forEach(card => {
      const show = !matching || matching.has(clean(card.dataset.song));
      card.hidden = !show;
      if (show) visible += 1;
    });
    const count = app.querySelector('[data-count]');
    if (count) count.textContent = `${visible} of ${cards.length}`;
    updateMoodButtons();
  }

  function bindMoodFilter(songs) {
    window.__stashboxMoodCatalog = songs;
    document.addEventListener('click', event => {
      const moodButton = event.target.closest('#v2App [data-mood]');
      if (moodButton) {
        event.preventDefault();
        activeMood = activeMood === moodButton.dataset.mood ? '' : moodButton.dataset.mood;
        applyMoodFilter();
        app.querySelector('#v2Songs')?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (event.target.closest('#v2App [data-genre], #v2App [data-artist]')) {
        activeMood = '';
        updateMoodButtons();
      }
    }, true);

    const watchGrid = () => {
      const grid = app.querySelector('.v2-song-grid');
      if (!grid) return false;
      moodGridObserver?.disconnect();
      moodGridObserver = new MutationObserver(() => {
        if (activeMood) applyMoodFilter();
      });
      moodGridObserver.observe(grid, { childList: true });
      return true;
    };
    watchGrid();
  }

  async function initialize() {
    try {
      const songs = await getCatalog();
      if (!songs.length) return;

      let attempts = 0;
      const timer = window.setInterval(() => {
        attempts += 1;
        const moodReady = renderMoodFeed(songs);
        const featuredReady = Boolean(app.querySelector('.v2-featured-row'));
        if ((moodReady && featuredReady) || attempts >= 200) {
          window.clearInterval(timer);
          bindMoodFilter(songs);
          const build = () => {
            try { renderFeatured(songs); }
            catch (error) { console.warn('[V2 Featured Feed]', error); }
          };
          if ('requestIdleCallback' in window) window.requestIdleCallback(build, { timeout: 1200 });
          else window.setTimeout(build, 150);
        }
      }, 50);
    } catch (error) {
      console.warn('[V2 Discovery Feeds]', error);
    }
  }

  document.addEventListener('click', event => {
    const logo = event.target.closest('#v2App .v2-wordmark, #v2App .v2-player-mark');
    if (!logo) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.reload();
  }, true);

  initialize();
})();