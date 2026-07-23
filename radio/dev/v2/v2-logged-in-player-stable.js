(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_radio_dev_cognito_tokens';
  const FALLBACK = '/images/branding/stashbox-logo-transparent-rastacolors.png';
  const SHOP = 'https://stashbox.ai/products.json?limit=250';

  const icon = {
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M12 3v12m0-12 4 4m-4-4L8 7M5 11v8h14v-8"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M4 7h3c5 0 5 10 10 10h3M17 4l3 3-3 3M4 17h3c2 0 3-1.5 4-3M15 7c1-1 2-1 5-1M17 14l3 3-3 3"/></svg>',
    repeat: '<svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3"/></svg>',
    queue: '<svg viewBox="0 0 24 24"><path d="M10 6h11M10 12h11M10 18h11M3 6h2M3 12h2M3 18h2"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    credits: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M17 14a7 7 0 0 1 5 7"/></svg>',
    warning: '<svg viewBox="0 0 24 24"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/></svg>',
    bag: '<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>'
  };

  const state = {
    player: null,
    songs: [],
    products: [],
    playlists: [],
    favorites: new Set(),
    follows: new Set(),
    accountName: 'Profile',
    avatar: '',
    current: null,
    currentKey: '',
    activeSheet: null,
    installed: false,
    merchSong: '',
    merchTimer: 0,
    merchClose: 0,
    merchInterval: 0,
    titleObserver: null,
    playerObserver: null,
    sheetStartY: null
  };

  const clean = value => String(value ?? '').trim();
  const esc = value => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const slug = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'') || 'artist';

  function tokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }
  function loggedIn() { return Boolean(tokens().accessToken); }
  function headers(json = false) {
    const value = tokens();
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(value.accessToken ? { Authorization: `Bearer ${value.accessToken}` } : {}),
      ...(value.idToken ? { 'X-Cognito-Id-Token': value.idToken } : {})
    };
  }
  async function parse(response) {
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }
  function request(path, options = {}) {
    const url = String(path).startsWith('http') ? path : `${API}${path}`;
    return fetch(url, { cache: 'no-store', credentials: 'omit', ...options, headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) } }).then(parse);
  }
  function image(url, alt = '') { return `<img src="${esc(url || FALLBACK)}" alt="${esc(alt)}" loading="lazy" onerror="this.onerror=null;this.src='${FALLBACK}'">`; }
  function toast(message) {
    let node = document.querySelector('.v2-li-toast');
    if (!node) { node = document.createElement('div'); node.className = 'v2-toast v2-li-toast'; document.body.appendChild(node); }
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(node.__timer);
    node.__timer = setTimeout(() => node.classList.remove('is-visible'), 2200);
  }

  async function loadData() {
    if (!state.songs.length) {
      const body = await fetch(`${API}/radio/songs`, { cache: 'no-store' }).then(parse).catch(() => ({}));
      const rows = Array.isArray(body) ? body : body.songs || body.items || body.data || [];
      state.songs = rows.map((row, index) => ({
        key: clean(row.song_key || row.id || `song-${index}`),
        title: clean(row.display_title || row.song_name || row.title || `Song ${index + 1}`),
        artist: clean(row.artist || row.artist_name || 'Stashbox'),
        genre: clean(row.genre || row.primary_genre || 'Other'),
        art: clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.image_url) || FALLBACK,
        duration: Number(row.duration_seconds || row.duration || 0) || 0,
        raw: row
      })).filter(item => item.key);
    }
    if (!loggedIn()) return;
    const [account, prefs, playlists, favorites, follows] = await Promise.allSettled([
      request('/radio/me'), request('/radio/me/preferences'), request('/radio/me/playlists'), request('/radio/me/favorites'), request('/radio/me/follows')
    ]);
    if (account.status === 'fulfilled') state.accountName = clean(account.value.user?.display_name).split(/\s+/)[0] || 'Profile';
    if (prefs.status === 'fulfilled') state.avatar = clean(prefs.value.preferences?.settings?.avatar_url || prefs.value.preferences?.settings?.profile_image_url);
    if (playlists.status === 'fulfilled') state.playlists = playlists.value.playlists || [];
    if (favorites.status === 'fulfilled') state.favorites = new Set((favorites.value.favorites || []).map(item => clean(item.song_key)));
    if (follows.status === 'fulfilled') state.follows = new Set((follows.value.follows || []).map(item => clean(item.artist_key)));
    updateProfileButton();
  }

  function currentSong() {
    const title = clean(state.player?.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(state.player?.querySelector('[data-partist]')?.textContent);
    if (!title) return null;
    if (state.currentKey) {
      const chosen = state.songs.find(item => item.key === state.currentKey);
      if (chosen && normalize(chosen.title) === normalize(title)) return chosen;
    }
    return state.songs.find(item => normalize(item.title) === normalize(title) && (!artist || normalize(item.artist) === normalize(artist))) || null;
  }

  function inject() {
    if (!state.player || !loggedIn()) return;
    state.player.classList.add('is-logged-in-player');
    const header = state.player.querySelector('.v2-player-header');
    if (header && !header.querySelector('.v2-li-player-head-actions')) {
      header.insertAdjacentHTML('beforeend', `<div class="v2-li-player-head-actions"><button type="button" data-li-search>${icon.search}</button><button type="button" data-li-notifications>${icon.bell}</button><a class="v2-li-player-profile" data-li-profile href="/radio/dev/v2/profile/">P</a></div>`);
    }
    const artistRow = state.player.querySelector('.v2-artist-row');
    if (artistRow && !artistRow.querySelector('[data-li-follow]')) artistRow.insertAdjacentHTML('beforeend', '<button type="button" class="v2-follow-button" data-li-follow>Follow</button><button type="button" class="v2-li-song-more" data-li-more aria-label="More song actions">•••</button>');
    if (artistRow && !state.player.querySelector('[data-li-meta]')) artistRow.insertAdjacentHTML('afterend', '<div class="v2-li-meta-chips" data-li-meta></div>');
    const controls = state.player.querySelector('.v2-player-controls');
    if (controls && !controls.querySelector('[data-li-shuffle]')) controls.insertAdjacentHTML('afterbegin', `<button type="button" class="v2-li-mode-button" data-li-shuffle>${icon.shuffle}</button>`);
    if (controls && !controls.querySelector('[data-li-repeat]')) controls.insertAdjacentHTML('beforeend', `<button type="button" class="v2-li-mode-button" data-li-repeat>${icon.repeat}</button>`);
    if (controls && !state.player.querySelector('[data-li-up-next]')) controls.insertAdjacentHTML('afterend', `<button type="button" class="v2-li-up-next-button" data-li-up-next>${icon.queue}<span>Up Next</span></button>`);
    if (!state.player.querySelector('.v2-li-player-rail')) {
      state.player.insertAdjacentHTML('beforeend', `<aside class="v2-li-player-rail">
        <button type="button" class="v2-li-rail-item" data-li-add-playlist><span class="v2-li-rail-circle">${icon.plus}</span><small>Add to<br>Playlist</small></button>
        <button type="button" class="v2-li-rail-item" data-li-artist><span class="v2-li-rail-circle" data-li-artist-image>${icon.user}</span><strong data-li-artist-name>Artist</strong></button>
        <button type="button" class="v2-li-rail-item" data-li-favorite><span class="v2-li-rail-circle">${icon.heart}</span><strong data-li-like-count>0</strong><small>Favorites</small></button>
        <button type="button" class="v2-li-rail-item" data-li-share><span class="v2-li-rail-circle">${icon.share}</span><small>Share</small></button>
      </aside><section class="v2-li-merch-tray" data-li-merch-tray></section>`);
    }
    updateProfileButton();
  }

  function updateProfileButton() {
    const node = state.player?.querySelector('[data-li-profile]');
    if (!node) return;
    if (state.avatar) {
      const existing = node.querySelector('img');
      const absolute = new URL(state.avatar, location.href).href;
      if (!existing || existing.src !== absolute) node.innerHTML = image(state.avatar, state.accountName);
    } else {
      const letter = (state.accountName || 'P').slice(0, 1).toUpperCase();
      if (node.textContent !== letter || node.querySelector('img')) node.textContent = letter;
    }
  }

  function chips(song) {
    const raw = song.raw || {};
    const date = clean(raw.release_date || raw.created_at);
    const year = date && !Number.isNaN(new Date(date).getTime()) ? new Date(date).getFullYear() : '';
    const mood = Array.isArray(raw.mood_tags) ? raw.mood_tags[0] : clean(raw.mood || raw.secondary_genre);
    const lossless = Boolean(raw.lossless || raw.is_lossless || /\.(wav|flac)(?:\?|$)/i.test(clean(raw.audio_url)));
    return [year, mood, lossless ? 'Lossless' : ''].filter(Boolean).slice(0, 3);
  }

  async function syncSong() {
    if (!loggedIn() || !state.player || state.player.hidden) return;
    const song = currentSong();
    if (!song) return;
    const changed = state.current?.key !== song.key;
    state.current = song;
    state.currentKey = song.key;
    inject();
    const meta = state.player.querySelector('[data-li-meta]');
    if (meta) meta.innerHTML = chips(song).map(value => `<span>${esc(value)}</span>`).join('');
    const likeCount = state.player.querySelector('[data-likes]')?.textContent || '0';
    if (state.player.querySelector('[data-li-like-count]')) state.player.querySelector('[data-li-like-count]').textContent = likeCount;
    state.player.querySelector('[data-li-favorite]')?.classList.toggle('is-favorite', state.favorites.has(song.key) || state.player.querySelector('[data-like]')?.classList.contains('is-liked'));
    if (state.player.querySelector('[data-li-artist-name]')) state.player.querySelector('[data-li-artist-name]').textContent = song.artist;
    const artistKey = slug(song.artist);
    state.player.querySelector('[data-li-artist]')?.setAttribute('data-artist-key', artistKey);
    const follow = state.player.querySelector('[data-li-follow]');
    if (follow) {
      follow.dataset.artistKey = artistKey;
      const active = state.follows.has(artistKey);
      follow.classList.toggle('is-following', active);
      follow.textContent = active ? 'Following' : 'Follow';
    }
    request(`/radio/artists/${encodeURIComponent(artistKey)}`).then(body => {
      const artist = body.artist || {};
      const realKey = clean(artist.artist_key || artist.slug || artistKey);
      state.player.querySelector('[data-li-artist]')?.setAttribute('data-artist-key', artist.slug || realKey);
      if (artist.profile_image_url && state.player.querySelector('[data-li-artist-image]')) state.player.querySelector('[data-li-artist-image]').innerHTML = image(artist.profile_image_url, artist.name || song.artist);
      if (follow) {
        follow.dataset.artistKey = realKey;
        const active = state.follows.has(realKey) || Boolean(artist.is_following);
        follow.classList.toggle('is-following', active);
        follow.textContent = active ? 'Following' : 'Follow';
      }
    }).catch(() => {});
    if (changed) scheduleMerch();
  }

  function openSheet(title, html) {
    closeSheet(true);
    const root = document.createElement('div');
    root.className = 'v2-li-sheet-root';
    root.innerHTML = `<button type="button" class="v2-li-sheet-backdrop" data-li-close-sheet></button><section class="v2-li-sheet" role="dialog" aria-modal="true"><div class="v2-li-sheet-handle" data-li-sheet-handle></div><header class="v2-li-sheet-head"><h2>${esc(title)}</h2><button type="button" class="v2-li-sheet-close" data-li-close-sheet>×</button></header><div class="v2-li-sheet-body">${html}</div></section>`;
    document.body.appendChild(root);
    state.activeSheet = root;
    requestAnimationFrame(() => root.classList.add('is-open'));
  }
  function closeSheet(now = false) {
    if (!state.activeSheet) return;
    const root = state.activeSheet;
    state.activeSheet = null;
    root.classList.remove('is-open');
    setTimeout(() => root.remove(), now ? 0 : 310);
  }

  function actionRow(name, subtitle, action, svg) {
    return `<button type="button" class="v2-li-action" data-li-action="${action}"><span class="v2-li-action-icon">${svg}</span><span class="v2-li-action-copy"><strong>${esc(name)}</strong><small>${esc(subtitle)}</small></span><span class="v2-li-action-arrow">›</span></button>`;
  }
  function openActions() {
    const song = state.current;
    if (!song) return;
    openSheet('Song Actions', `<div class="v2-li-action-list">${actionRow('View Artist', `See more from ${song.artist}`, 'artist', icon.user)}${actionRow('Open Song Page', 'Visit the official song page', 'song-page', icon.link)}${actionRow('View Credits', 'Songwriting, production, and more', 'credits', icon.credits)}${actionRow('Report a Problem', 'Let us know about an issue', 'report', icon.warning)}</div>`);
  }
  function openCredits() {
    const song = state.current;
    const raw = song?.raw || {};
    const rows = [['Artist',song?.artist],['Songwriters',raw.songwriters || raw.songwriter || raw.writers],['Producers',raw.producers || raw.producer],['Album / Release',raw.album_name || raw.release_title],['Credits',raw.credits || raw.public_track_note]].map(([label,value]) => {
      const text = Array.isArray(value) ? value.join(', ') : clean(value);
      return text ? `<article><small>${esc(label)}</small><strong>${esc(text)}</strong></article>` : '';
    }).join('');
    openSheet('Song Credits', `<div class="v2-li-credit-grid">${rows || '<article><strong>Credits have not been added yet.</strong></article>'}</div>`);
  }
  function openReport() {
    openSheet('Report a Problem', '<form class="v2-li-sheet-form" data-li-report-form><label>Issue Type<select name="issue"><option value="audio">Audio issue</option><option value="video">Video or visual issue</option><option value="metadata">Incorrect song information</option><option value="merch">Merchandise issue</option><option value="other">Other</option></select></label><label>Details<textarea name="details" maxlength="1000"></textarea></label><button class="v2-li-sheet-submit" type="submit">Send Report</button><p class="v2-li-sheet-message" data-li-message></p></form>');
  }
  function queueItems() {
    if (!state.current || !state.songs.length) return [];
    const start = Math.max(0, state.songs.findIndex(item => item.key === state.current.key));
    return Array.from({ length: Math.min(12, Math.max(0, state.songs.length - 1)) }, (_, i) => state.songs[(start + i + 1) % state.songs.length]);
  }
  function duration(value) { const seconds = Math.max(0, Number(value) || 0); return seconds ? `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}` : ''; }
  function openQueue() {
    if (!state.current) return;
    const queue = queueItems();
    openSheet('Up Next', `<article class="v2-li-now-playing"><span>${image(state.current.art,state.current.title)}</span><div><b>Now Playing</b><strong>${esc(state.current.title)}</strong><small>${esc(state.current.artist)}</small></div><span class="v2-li-equalizer"><i></i><i></i><i></i><i></i></span></article><div class="v2-li-queue-list">${queue.map((song,i) => `<button type="button" class="v2-li-queue-row" data-li-queue-song="${esc(song.key)}"><span class="v2-li-queue-index">${i+1}</span><span class="v2-li-queue-art">${image(song.art,'')}</span><span class="v2-li-queue-copy"><strong>${esc(song.title)}</strong><small>${esc(song.artist)}</small></span><span class="v2-li-queue-duration">${duration(song.duration)}</span></button>`).join('')}</div><p class="v2-li-sheet-message">Tap a song to jump to it. Swipe down to close.</p>`);
  }

  async function openPlaylists() {
    const body = await request('/radio/me/playlists').catch(() => ({ playlists: state.playlists }));
    state.playlists = body.playlists || [];
    const list = state.playlists.map(item => `<button type="button" class="v2-li-playlist-option" data-li-playlist-id="${esc(item.id)}"><span class="v2-li-playlist-art">${icon.queue}</span><span class="v2-li-playlist-copy"><strong>${esc(item.name)}</strong><small>${Number(item.item_count || 0)} songs</small></span><span class="v2-li-action-arrow">+</span></button>`).join('');
    openSheet('Add to Playlist', `<div class="v2-li-playlist-list">${list || '<p class="v2-li-sheet-message" style="padding:16px">No playlists yet.</p>'}</div><button type="button" class="v2-li-sheet-submit" style="width:100%;margin-top:12px" data-li-create-playlist>Create New Playlist</button><p class="v2-li-sheet-message" data-li-message></p>`);
  }
  function openCreatePlaylist() {
    openSheet('New Playlist', '<form class="v2-li-sheet-form" data-li-create-form><label>Playlist Name<input name="name" maxlength="160" required></label><label>Description<textarea name="description" maxlength="1000"></textarea></label><button class="v2-li-sheet-submit" type="submit">Create and Add Song</button><p class="v2-li-sheet-message" data-li-message></p></form>');
  }
  async function addPlaylist(id, message) {
    if (!state.current) return;
    try {
      await request(`/radio/me/playlists/${encodeURIComponent(id)}/items`, { method:'POST', body:JSON.stringify({ song_key:state.current.key, display_title:state.current.title, artist:state.current.artist, metadata:{ artwork_url:state.current.art, genre:state.current.genre } }) });
      if (message) { message.textContent = 'Song added to playlist.'; message.className = 'v2-li-sheet-message success'; }
      toast('Added to playlist');
      setTimeout(closeSheet, 650);
    } catch (error) { if (message) { message.textContent = error.message; message.className = 'v2-li-sheet-message error'; } }
  }
  async function createPlaylist(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const message = form.querySelector('[data-li-message]');
    try {
      const body = await request('/radio/me/playlists', { method:'POST', body:JSON.stringify({ name:data.name, description:data.description, visibility:'private' }) });
      await addPlaylist(body.playlist.id, message);
    } catch (error) { message.textContent = error.message; message.className = 'v2-li-sheet-message error'; }
  }
  async function favorite() {
    if (!state.current || state.favorites.has(state.current.key)) return;
    state.player.querySelector('[data-like]')?.click();
    state.favorites.add(state.current.key);
    state.player.querySelector('[data-li-favorite]')?.classList.add('is-favorite');
    await request('/radio/me/favorites', { method:'POST', body:JSON.stringify({ song_key:state.current.key, display_title:state.current.title, artist:state.current.artist, metadata:{ artwork_url:state.current.art, genre:state.current.genre } }) }).then(() => toast('Added to Favorites')).catch(error => toast(error.message));
  }
  async function follow(button) {
    const key = clean(button.dataset.artistKey || slug(state.current?.artist));
    const active = state.follows.has(key);
    button.disabled = true;
    try {
      await request(`/radio/me/follows/${encodeURIComponent(key)}`, { method:active?'DELETE':'POST', body:active?undefined:JSON.stringify({ notifications_enabled:true }) });
      if (active) state.follows.delete(key); else state.follows.add(key);
      button.classList.toggle('is-following', !active);
      button.textContent = active ? 'Follow' : 'Following';
    } catch (error) { toast(error.message); }
    button.disabled = false;
  }

  function clickSong(key) {
    const card = [...app.querySelectorAll('[data-song]')].find(node => clean(node.dataset.song) === clean(key));
    card?.click();
  }
  function share() { state.player.querySelector('[data-share]')?.click(); }
  function viewArtist() { location.href = `/radio/dev/v2/artist/?artist=${encodeURIComponent(state.player.querySelector('[data-li-artist]')?.dataset.artistKey || slug(state.current?.artist))}`; }
  function songPage() {
    const url = clean(state.current?.raw?.official_song_page_url || state.current?.raw?.song_page_url);
    if (url) window.open(url,'_blank','noopener'); else toast('No official song page is assigned yet');
  }
  function shuffle(button) {
    const choices = state.songs.filter(item => item.key !== state.current?.key);
    if (!choices.length) return;
    button.classList.add('is-active');
    clickSong(choices[Math.floor(Math.random()*choices.length)].key);
    setTimeout(() => button.classList.remove('is-active'), 450);
  }
  function repeat(button) {
    const audio = state.player.querySelector('[data-audio]');
    if (!audio) return;
    audio.loop = !audio.loop;
    button.classList.toggle('is-active', audio.loop);
    toast(audio.loop ? 'Repeat on' : 'Repeat off');
  }

  function productHandles(song) {
    const raw = song.raw || {};
    return [raw.specific_product_urls, raw.product_urls, raw.shopify_product_urls, raw.shop_url].flatMap(value => Array.isArray(value) ? value : clean(value) ? [value] : []).map(value => {
      try { const parts = new URL(value,location.origin).pathname.split('/').filter(Boolean); const i = parts.indexOf('products'); return i >= 0 ? parts[i+1] : parts.at(-1); }
      catch (_) { return clean(value).split('/').filter(Boolean).at(-1) || ''; }
    }).filter(Boolean);
  }
  function clearMerch() { clearTimeout(state.merchTimer); clearTimeout(state.merchClose); clearInterval(state.merchInterval); state.player?.querySelector('[data-li-merch-tray]')?.classList.remove('is-open'); }
  function scheduleMerch() { clearMerch(); state.merchSong = ''; if (state.current) state.merchTimer = setTimeout(showMerch, 15000); }
  async function showMerch() {
    const song = state.current;
    if (!song || state.merchSong === song.key) return;
    if (!state.products.length) {
      const body = await fetch(SHOP,{cache:'no-store'}).then(parse).catch(() => ({}));
      state.products = body.products || [];
    }
    const handles = new Set(productHandles(song));
    const products = state.products.filter(item => handles.has(clean(item.handle))).slice(0,8);
    if (!products.length || state.current?.key !== song.key) return;
    state.merchSong = song.key;
    const tray = state.player.querySelector('[data-li-merch-tray]');
    tray.innerHTML = `<header class="v2-li-merch-head"><strong>${icon.bag}<span>Merch for this song</span></strong><button type="button" data-li-dismiss-merch>Dismiss in <b data-li-merch-countdown>24</b>s</button></header><div class="v2-li-merch-row">${products.map(item => `<a class="v2-li-merch-card" href="https://stashbox.ai/products/${encodeURIComponent(item.handle || '')}" target="_blank" rel="noopener"><span>${item.images?.[0]?.src ? image(item.images[0].src,item.title) : ''}</span><strong>${esc(item.title || 'Product')}</strong><small>${item.variants?.[0]?.price ? `$${Number(item.variants[0].price).toFixed(2)}` : 'Shop now'}</small></a>`).join('')}</div>`;
    tray.classList.add('is-open');
    let seconds = 24;
    state.merchInterval = setInterval(() => { seconds -= 1; const node = tray.querySelector('[data-li-merch-countdown]'); if (node) node.textContent = String(Math.max(0,seconds)); },1000);
    state.merchClose = setTimeout(clearMerch,24000);
  }

  function bind() {
    document.addEventListener('click', event => {
      const songCard = event.target.closest('#v2App [data-song]');
      if (songCard) { state.currentKey = clean(songCard.dataset.song); setTimeout(syncSong,25); }
      if (!loggedIn()) return;
      if (event.target.closest('.v2-player.is-logged-in-player .v2-player-mark')) { event.preventDefault(); event.stopImmediatePropagation(); state.player.querySelector('[data-close]')?.click(); return; }
      if (event.target.closest('[data-li-search]')) { state.player.querySelector('[data-close]')?.click(); setTimeout(() => app.querySelector('[data-search]')?.click(),30); return; }
      if (event.target.closest('[data-li-notifications]')) { app.querySelector('.v2-notifications-trigger')?.click(); return; }
      if (event.target.closest('[data-li-more]')) return openActions();
      if (event.target.closest('[data-li-up-next]')) return openQueue();
      if (event.target.closest('[data-li-add-playlist]')) return openPlaylists();
      if (event.target.closest('[data-li-artist]')) return viewArtist();
      if (event.target.closest('[data-li-favorite]')) return favorite();
      if (event.target.closest('[data-li-share]')) return share();
      if (event.target.closest('[data-li-follow]')) return follow(event.target.closest('[data-li-follow]'));
      if (event.target.closest('[data-li-shuffle]')) return shuffle(event.target.closest('[data-li-shuffle]'));
      if (event.target.closest('[data-li-repeat]')) return repeat(event.target.closest('[data-li-repeat]'));
      if (event.target.closest('[data-li-dismiss-merch]')) return clearMerch();
      if (event.target.closest('[data-li-close-sheet]')) return closeSheet();
      const queue = event.target.closest('[data-li-queue-song]');
      if (queue) { closeSheet(); setTimeout(() => clickSong(queue.dataset.liQueueSong),60); return; }
      const playlist = event.target.closest('[data-li-playlist-id]');
      if (playlist) return addPlaylist(playlist.dataset.liPlaylistId, state.activeSheet?.querySelector('[data-li-message]'));
      if (event.target.closest('[data-li-create-playlist]')) return openCreatePlaylist();
      const action = event.target.closest('[data-li-action]')?.dataset.liAction;
      if (action === 'artist') { closeSheet(); setTimeout(viewArtist,40); }
      if (action === 'song-page') songPage();
      if (action === 'credits') openCredits();
      if (action === 'report') openReport();
    }, true);
    document.addEventListener('submit', event => {
      if (event.target.matches('[data-li-create-form]')) { event.preventDefault(); createPlaylist(event.target); }
      if (event.target.matches('[data-li-report-form]')) {
        event.preventDefault();
        const form = event.target;
        const values = Object.fromEntries(new FormData(form).entries());
        const message = form.querySelector('[data-li-message]');
        fetch(`${API}/radio/track`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'report_problem',event_type:'report_problem',song_key:state.current?.key,display_title:state.current?.title,artist:state.current?.artist,source:'radio_dev_v2',metadata:{issue_type:values.issue,details:clean(values.details)}})}).then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); message.textContent='Thank you. The issue was submitted.'; message.className='v2-li-sheet-message success'; }).catch(error => { message.textContent=error.message; message.className='v2-li-sheet-message error'; });
      }
    });
    document.addEventListener('pointerdown', event => { if (event.target.closest('[data-li-sheet-handle]')) state.sheetStartY = event.clientY; });
    document.addEventListener('pointerup', event => { if (state.sheetStartY == null) return; const delta = event.clientY - state.sheetStartY; state.sheetStartY = null; if (delta > 70) closeSheet(); });
  }

  function install() {
    const player = app.querySelector('[data-player]');
    if (!player) return false;
    state.player = player;
    if (!state.installed) {
      state.installed = true;
      bind();
      const title = player.querySelector('[data-ptitle]');
      if (title) { state.titleObserver = new MutationObserver(() => { state.currentKey=''; setTimeout(syncSong,10); }); state.titleObserver.observe(title,{childList:true,characterData:true,subtree:true}); }
      state.playerObserver = new MutationObserver(() => {
        document.body.classList.toggle('v2-logged-in-player-open', loggedIn() && !player.hidden);
        if (loggedIn() && !player.hidden) { inject(); syncSong(); } else clearMerch();
      });
      state.playerObserver.observe(player,{attributes:true,attributeFilter:['hidden']});
      player.querySelector('[data-audio]')?.addEventListener('play', () => { if (state.current) scheduleMerch(); });
    }
    if (loggedIn()) { inject(); loadData().then(syncSong); }
    return true;
  }

  let attempts = 0;
  const timer = setInterval(() => { attempts += 1; if (install() || attempts >= 300) clearInterval(timer); },50);
})();
