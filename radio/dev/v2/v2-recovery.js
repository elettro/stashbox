(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SONGS = `${API}/radio/songs`;
  const TRACK = `${API}/radio/track`;
  const SHOP = 'https://stashbox.ai/products.json?limit=50';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const fix = value => clean(value)
    .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
    .replace(/\?dl=[01]/, '');

  const rows = (data, keys) => {
    if (typeof data?.body === 'string') {
      try { data = JSON.parse(data.body); } catch (_) {}
    }
    if (Array.isArray(data)) return data;
    for (const key of keys) {
      if (Array.isArray(data?.[key])) return data[key];
    }
    return [];
  };

  const icon = {
    search: '<svg viewBox="0 0 24 24"><path d="m21 21-4.4-4.4m2.4-5.6a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="m8 5 11 7-11 7Z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
    back: '<svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>',
    previousTrack: '<svg viewBox="0 0 24 24"><path d="M7 5v14M18 6l-8 6 8 6Z"/></svg>',
    nextTrack: '<svg viewBox="0 0 24 24"><path d="M17 5v14M6 6l8 6-8 6Z"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0-12 4 4m-4-4L8 7M5 11v8h14v-8"/></svg>'
  };

  const state = {
    songs: [],
    products: [],
    visible: [],
    query: '',
    genre: 'ALL',
    selected: null,
    queue: [],
    index: -1,
    shopLoading: false,
    shopLoaded: false
  };

  const song = (row, index) => ({
    key: clean(row.song_key || row.songKey || row.song_id || row.id || `song-${index}`),
    title: clean(row.display_title || row.title || row.song_name || `Song ${index + 1}`),
    artist: clean(row.artist || row.artist_name || 'Stashbox'),
    genre: clean(row.genre || row.primary_genre || 'Other'),
    art: fix(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url) || FALLBACK,
    audio: fix(row.audio_url || row.audioUrl || row.mp3_url || row.stream_url),
    video: fix(row.video_link || row.video_url || row.videoUrl),
    plays: Number(row.total_plays || row.plays || 0) || 0,
    likes: Number(row.total_likes || row.likes || 0) || 0,
    raw: row
  });

  const art = item => `<img src="${esc(item.art)}" alt="${esc(item.title)} artwork" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">`;

  const filter = () => {
    const query = state.query.toLowerCase();
    state.visible = state.songs.filter(item => (
      (!query || `${item.title} ${item.artist} ${item.genre}`.toLowerCase().includes(query)) &&
      (state.genre === 'ALL' || item.genre === state.genre)
    ));
  };

  const card = item => `
    <article class="v2-song-card song-card" data-song="${esc(item.key)}" tabindex="0">
      <div class="v2-song-art">${art(item)}<button class="v2-art-play" tabindex="-1">${icon.play}</button></div>
      <div class="v2-song-copy"><h3>${esc(item.title)}</h3><p>${esc(item.artist)}</p><span>${esc(item.genre)}</span></div>
    </article>`;

  const featured = item => `
    <article class="v2-feature-card" data-song="${esc(item.key)}" tabindex="0">
      <div class="v2-feature-art">${art(item)}<span class="v2-feature-label">Trending Now</span><button class="v2-art-play" tabindex="-1">${icon.play}</button></div>
      <h3>${esc(item.title)}</h3><p>${esc(item.artist)}</p><span>${esc(item.genre)}</span>
    </article>`;

  const product = item => {
    const variant = item.variants?.[0];
    const image = item.images?.[0]?.src || '';
    return `
      <a class="v2-product-card" href="https://stashbox.ai/products/${encodeURIComponent(item.handle || '')}" target="_blank" rel="noopener">
        <span class="v2-product-image">${image ? `<img src="${esc(image)}" alt="${esc(item.title)}" loading="lazy">` : '<b>SB</b>'}</span>
        <strong>${esc(item.title || 'Stashbox Product')}</strong>
        <small>${variant?.price ? `$${Number(variant.price).toFixed(2)}` : 'Shop now'}</small>
      </a>`;
  };

  const carousel = (rowClass, content, label) => `
    <div class="v2-carousel-shell" data-carousel-shell>
      <button class="v2-carousel-arrow v2-carousel-prev" type="button" data-carousel-direction="-1" aria-label="Scroll ${esc(label)} left">${icon.back}</button>
      <div class="v2-horizontal ${rowClass}" data-carousel-row>${content}</div>
      <button class="v2-carousel-arrow v2-carousel-next" type="button" data-carousel-direction="1" aria-label="Scroll ${esc(label)} right">${icon.next}</button>
    </div>`;

  function render() {
    filter();
    const genres = [...new Set(state.songs.map(item => item.genre))].filter(Boolean);
    const artists = [...new Set(state.songs.map(item => item.artist))].slice(0, 10);

    app.innerHTML = `
      <header class="v2-header">
        <a class="v2-wordmark" href="/radio/dev/v2/">STASH<span>BOX</span></a>
        <div class="v2-header-actions">
          <button class="v2-icon-button" data-search>${icon.search}</button>
          <button class="v2-icon-button v2-notifications-trigger">${icon.bell}<span class="v2-notification-dot"></span></button>
          <div class="stashbox-action-row"></div>
        </div>
      </header>
      <main class="v2-home">
        <section class="v2-section">
          <div class="v2-section-heading"><h2>Featured Songs</h2><button class="v2-see-all" data-to-songs>See All</button></div>
          ${carousel('v2-featured-row', state.songs.slice(0, 8).map(featured).join(''), 'Featured Songs')}
        </section>
        <section class="v2-section">
          <div class="v2-section-heading"><h2>Popular Artists</h2></div>
          ${carousel('v2-artists-row', artists.map(artistName => {
            const artistSong = state.songs.find(item => item.artist === artistName);
            return `<button class="v2-artist-card" data-artist="${esc(artistName)}"><span class="v2-artist-avatar">${art(artistSong)}</span><strong>${esc(artistName)}</strong><small>${state.songs.filter(item => item.artist === artistName).length} tracks</small></button>`;
          }).join(''), 'Popular Artists')}
        </section>
        <section class="v2-section">
          <div class="v2-section-heading"><h2>Genres</h2></div>
          ${carousel('v2-category-row', genres.map((genre, index) => `<button class="v2-category-card tone-${index % 6}" data-genre="${esc(genre)}"><strong>${esc(genre)}</strong><small>${state.songs.filter(item => item.genre === genre).length} tracks</small></button>`).join(''), 'Genres')}
        </section>
        <section class="v2-section v2-shop-section" data-shop-section>
          <div class="v2-section-heading"><h2>Shop</h2><a class="v2-see-all" href="https://stashbox.ai/collections/stashbox" target="_blank" rel="noopener">See All</a></div>
          <div class="v2-shop-lazy" data-shop-lazy><span></span><strong>Loading products when this section comes into view…</strong></div>
        </section>
        <section class="v2-section v2-songs-section" id="v2Songs">
          <div class="v2-section-heading v2-songs-heading"><div><h2>Songs</h2><span data-count>${state.visible.length} of ${state.songs.length}</span></div><button class="v2-tool-button" data-search>${icon.search}<span>Search</span></button></div>
          <div class="v2-song-grid" data-grid>${state.visible.map(card).join('')}</div>
        </section>
      </main>
      <section class="v2-search-sheet" data-search-sheet hidden>
        <div class="v2-sheet-bar"><label class="v2-search-field">${icon.search}<input type="search" data-input placeholder="Song, artist, or genre"></label><button class="v2-sheet-close" data-done>Done</button></div>
        <div class="v2-search-results" data-results></div>
      </section>
      <section class="v2-player" data-player hidden>
        <div class="v2-player-backdrop" data-backdrop></div><div class="v2-player-shade"></div>
        <header class="v2-player-header"><button class="v2-icon-button" data-close>${icon.back}</button><a class="v2-player-mark" href="/radio/dev/v2/">STASH<span>BOX</span></a></header>
        <div class="v2-player-content player-info">
          <div class="v2-player-labels"><span data-pgenre></span><b><i></i>Now Playing</b></div>
          <h2 data-ptitle></h2>
          <div class="meta v2-artist-row"><span class="v2-mini-avatar" data-avatar></span><strong data-partist></strong></div>
          <div class="v2-timeline"><input type="range" min="0" max="0" value="0" step=".1" data-scrub><div><span data-now>0:00</span><span data-total>0:00</span></div></div>
          <div class="v2-player-controls"><button class="v2-side-action" data-like>${icon.heart}<span data-likes>0</span></button><button class="v2-transport" data-prev>${icon.previousTrack}</button><button class="v2-main-play" data-play>${icon.play}</button><button class="v2-transport" data-next>${icon.nextTrack}</button><button class="v2-side-action" data-share>${icon.share}</button></div>
        </div>
        <audio data-audio preload="metadata" playsinline></audio>
      </section>`;

    bind();
    initializeCarousels();
    initializeLazyShop();
  }

  function bind() {
    app.onclick = event => {
      const songElement = event.target.closest('[data-song]');
      if (songElement) return openSong(songElement.dataset.song, true);

      const carouselButton = event.target.closest('[data-carousel-direction]');
      if (carouselButton) return scrollCarousel(carouselButton);

      if (event.target.closest('[data-search]')) return openSearch();
      if (event.target.closest('[data-done]')) return closeSearch();
      if (event.target.closest('[data-to-songs]')) return document.getElementById('v2Songs')?.scrollIntoView({ behavior: 'smooth' });

      const artistName = event.target.closest('[data-artist]')?.dataset.artist;
      if (artistName) {
        state.query = artistName;
        refresh();
        return document.getElementById('v2Songs')?.scrollIntoView({ behavior: 'smooth' });
      }

      const genreName = event.target.closest('[data-genre]')?.dataset.genre;
      if (genreName) {
        state.genre = genreName;
        refresh();
        return document.getElementById('v2Songs')?.scrollIntoView({ behavior: 'smooth' });
      }

      if (event.target.closest('[data-close]')) return closePlayer();
      if (event.target.closest('[data-play]')) return toggle();
      if (event.target.closest('[data-next]')) return adjacent(1);
      if (event.target.closest('[data-prev]')) return adjacent(-1);
      if (event.target.closest('[data-share]')) return share();
      if (event.target.closest('[data-like]')) return like();
      if (event.target.closest('.v2-notifications-trigger')) return document.querySelector('.sbr-notification-bell')?.click();
    };

    const input = app.querySelector('[data-input]');
    if (input) input.oninput = () => { state.query = input.value; searchResults(); };

    const audio = getAudio();
    if (audio) {
      audio.ontimeupdate = timeline;
      audio.onloadedmetadata = timeline;
      audio.onplay = playIcon;
      audio.onpause = playIcon;
      audio.onended = () => adjacent(1);
    }

    const scrub = app.querySelector('[data-scrub]');
    if (scrub) scrub.oninput = () => { if (audio) audio.currentTime = Number(scrub.value) || 0; };
  }

  function initializeCarousels(root = app) {
    root.querySelectorAll('[data-carousel-shell]').forEach(shell => {
      if (shell.dataset.carouselReady === 'true') {
        updateCarousel(shell);
        return;
      }
      shell.dataset.carouselReady = 'true';
      const row = shell.querySelector('[data-carousel-row]');
      if (!row) return;
      row.addEventListener('scroll', () => window.requestAnimationFrame(() => updateCarousel(shell)), { passive: true });
      updateCarousel(shell);
    });
  }

  function updateCarousel(shell) {
    const row = shell.querySelector('[data-carousel-row]');
    if (!row) return;
    const overflow = row.scrollWidth > row.clientWidth + 4;
    const atStart = row.scrollLeft <= 4;
    const atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
    shell.classList.toggle('has-overflow', overflow);
    const previous = shell.querySelector('.v2-carousel-prev');
    const next = shell.querySelector('.v2-carousel-next');
    if (previous) previous.disabled = !overflow || atStart;
    if (next) next.disabled = !overflow || atEnd;
  }

  function scrollCarousel(button) {
    const shell = button.closest('[data-carousel-shell]');
    const row = shell?.querySelector('[data-carousel-row]');
    if (!row) return;
    const direction = Number(button.dataset.carouselDirection) || 1;
    const amount = Math.max(280, row.clientWidth * 0.82);
    row.scrollBy({ left: direction * amount, behavior: 'smooth' });
  }

  function initializeLazyShop() {
    const section = app.querySelector('[data-shop-section]');
    if (!section || state.shopLoaded || state.shopLoading) return;

    const load = () => loadShop();
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      }, { rootMargin: '500px 0px' });
      observer.observe(section);
    } else {
      window.setTimeout(load, 350);
    }
  }

  async function loadShop() {
    if (state.shopLoaded || state.shopLoading) return;
    state.shopLoading = true;
    const section = app.querySelector('[data-shop-section]');
    try {
      const productData = await json(SHOP);
      state.products = rows(productData, ['products']).slice(0, 50);
      state.shopLoaded = true;
      if (!section) return;
      if (!state.products.length) {
        section.querySelector('[data-shop-lazy]')?.replaceWith(createShopMessage('No products are currently available.'));
        return;
      }
      const shell = document.createElement('div');
      shell.innerHTML = carousel('v2-shop-row', state.products.map(product).join(''), 'Shop products').trim();
      section.querySelector('[data-shop-lazy]')?.replaceWith(shell.firstElementChild);
      initializeCarousels(section);
    } catch (error) {
      console.warn('[V2] shop unavailable', error);
      section?.querySelector('[data-shop-lazy]')?.replaceWith(createShopMessage('Store products could not load right now.'));
    } finally {
      state.shopLoading = false;
    }
  }

  function createShopMessage(message) {
    const element = document.createElement('div');
    element.className = 'v2-shop-lazy';
    element.textContent = message;
    return element;
  }

  function refresh() {
    filter();
    const grid = app.querySelector('[data-grid]');
    if (grid) grid.innerHTML = state.visible.map(card).join('');
    const count = app.querySelector('[data-count]');
    if (count) count.textContent = `${state.visible.length} of ${state.songs.length}`;
  }

  function openSearch() {
    const sheet = app.querySelector('[data-search-sheet]');
    if (sheet) sheet.hidden = false;
    document.body.classList.add('v2-sheet-open');
    searchResults();
    window.setTimeout(() => app.querySelector('[data-input]')?.focus(), 30);
  }

  function closeSearch() {
    const sheet = app.querySelector('[data-search-sheet]');
    if (sheet) sheet.hidden = true;
    document.body.classList.remove('v2-sheet-open');
    refresh();
  }

  function searchResults() {
    filter();
    const results = app.querySelector('[data-results]');
    if (results) {
      results.innerHTML = `<div class="v2-search-result-list">${state.visible.slice(0, 30).map(item => `<button data-song="${esc(item.key)}"><span>${art(item)}</span><div><strong>${esc(item.title)}</strong><small>${esc(item.artist)} · ${esc(item.genre)}</small></div></button>`).join('')}</div>`;
    }
  }

  function openSong(key, autoplay) {
    const selected = state.songs.find(item => item.key === key);
    if (!selected) return;
    state.selected = selected;
    state.queue = state.visible.length ? [...state.visible] : [...state.songs];
    state.index = Math.max(0, state.queue.findIndex(item => item.key === key));

    const player = app.querySelector('[data-player]');
    if (player) player.hidden = false;
    document.body.classList.add('v2-player-open');
    app.querySelector('[data-ptitle]').textContent = selected.title;
    app.querySelector('[data-partist]').textContent = selected.artist;
    app.querySelector('[data-pgenre]').textContent = selected.genre;
    app.querySelector('[data-avatar]').innerHTML = art(selected);
    app.querySelector('[data-likes]').textContent = selected.likes;
    app.querySelector('[data-backdrop]').style.backgroundImage = `url("${selected.art.replaceAll('"', '%22')}")`;

    const audio = getAudio();
    if (audio) {
      audio.src = selected.audio || '';
      audio.load();
      if (autoplay && selected.audio) audio.play().catch(() => {});
      else if (!selected.audio && selected.video) window.open(selected.video, '_blank', 'noopener');
    }
  }

  function closePlayer() {
    const player = app.querySelector('[data-player]');
    if (player) player.hidden = true;
    document.body.classList.remove('v2-player-open');
  }

  function getAudio() { return app.querySelector('[data-audio]'); }
  function toggle() { const audio = getAudio(); if (audio) audio.paused ? audio.play().catch(() => {}) : audio.pause(); }
  function playIcon() { const button = app.querySelector('[data-play]'); const audio = getAudio(); if (button) button.innerHTML = audio && !audio.paused ? icon.pause : icon.play; }
  function adjacent(direction) { if (!state.queue.length) return; state.index = (state.index + direction + state.queue.length) % state.queue.length; openSong(state.queue[state.index].key, true); }

  function timeline() {
    const audio = getAudio();
    const scrub = app.querySelector('[data-scrub]');
    if (!audio || !scrub) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const current = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    scrub.max = duration;
    scrub.value = current;
    const format = value => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
    app.querySelector('[data-now]').textContent = format(current);
    app.querySelector('[data-total]').textContent = format(duration);
  }

  function like() {
    if (!state.selected) return;
    state.selected.likes += 1;
    app.querySelector('[data-likes]').textContent = state.selected.likes;
    track('like');
  }

  async function share() {
    if (!state.selected) return;
    const url = new URL('/radio/dev/v2/', location.origin);
    url.searchParams.set('song', state.selected.key);
    try {
      if (navigator.share) await navigator.share({ title: state.selected.title, url: url.toString() });
      else await navigator.clipboard.writeText(url.toString());
      track('share');
    } catch (_) {}
  }

  function track(action) {
    if (!state.selected) return;
    fetch(TRACK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        event_type: action,
        song_key: state.selected.key,
        display_title: state.selected.title,
        artist: state.selected.artist,
        source: 'radio_dev_v2'
      }),
      keepalive: true
    }).catch(() => {});
  }

  async function json(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function init() {
    try {
      const songData = await json(SONGS);
      state.songs = rows(songData, ['songs', 'items', 'data']).map(song).filter(item => item.key && item.title);
      if (!state.songs.length) throw new Error('No songs returned by DEV API');
      render();
      const requested = new URLSearchParams(location.search).get('song');
      if (requested) openSong(requested, false);
    } catch (error) {
      console.error('[V2]', error);
      app.innerHTML = `<section class="v2-load-error"><span>STASH<span>BOX</span></span><h1>Radio V2 could not load</h1><p>${esc(error.message || 'Unknown loading error')}</p><button onclick="location.reload()">Retry</button></section>`;
    }
  }

  window.addEventListener('resize', () => {
    window.clearTimeout(window.__v2CarouselResize);
    window.__v2CarouselResize = window.setTimeout(() => initializeCarousels(), 120);
  });

  init();
})();
