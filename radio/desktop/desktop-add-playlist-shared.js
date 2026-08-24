(() => {
  'use strict';

  if (!matchMedia('(min-width: 900px)').matches) return;
  if (window.StashboxDesktopAddPlaylistShared) return;
  window.StashboxDesktopAddPlaylistShared = true;

  const isDev = location.pathname.includes('/radio/dev/v2/');
  const API = isDev
    ? 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev'
    : 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const TOKEN_KEY = isDev ? 'stashbox_radio_dev_cognito_tokens' : 'stashbox_radio_prod_cognito_tokens';
  const app = document.getElementById('v2App');
  if (!app) return;

  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const PLAYLIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h7"/><path d="M4 5v14"/></svg>';
  let catalog = null;
  let popover = null;
  let toastTimer = 0;

  const clean = value => String(value ?? '').trim();
  const esc = value => clean(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');

  function tokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  function loggedIn() {
    return Boolean(tokens().accessToken || tokens().refreshToken);
  }

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
    try { body = text ? JSON.parse(text) : {}; }
    catch (_) { body = { error: text }; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  async function request(path, options = {}, retry = true) {
    const response = await fetch(`${API}${path}`, {
      cache: 'no-store',
      credentials: 'omit',
      ...options,
      headers: { ...headers(Boolean(options.body)), ...(options.headers || {}) }
    });
    if (response.status === 401 && retry && window.StashboxV2Session?.ensureFresh) {
      try {
        await window.StashboxV2Session.ensureFresh({ reason: 'desktop-add-playlist' });
        return request(path, options, false);
      } catch (_) {}
    }
    return parse(response);
  }

  function installStyles() {
    if (document.getElementById('desktopPlaylistSharedStyles')) return;
    const style = document.createElement('style');
    style.id = 'desktopPlaylistSharedStyles';
    style.textContent = `
      .desktop-clean-runtime .desktop-add-playlist-button{flex:0 0 auto;min-height:30px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 11px;border:1px solid rgba(255,159,10,.58);border-radius:999px;background:rgba(5,6,7,.52);color:#ff9f0a;font:700 12px/1 Karla,system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(10px)}
      .desktop-clean-runtime .desktop-add-playlist-button:hover{background:#ff9f0a;border-color:#ff9f0a;color:#171008}
      .desktop-clean-runtime .desktop-add-playlist-button svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .desktop-playlist-popover{position:fixed;z-index:12050;width:min(340px,calc(100vw - 32px));max-height:min(520px,70vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(15,17,20,.98);color:#f7f3eb;box-shadow:0 24px 80px rgba(0,0,0,.55);font-family:Karla,system-ui,sans-serif;backdrop-filter:blur(18px)}
      .desktop-playlist-head{display:flex;align-items:center;justify-content:space-between;padding:14px 15px;border-bottom:1px solid rgba(255,255,255,.09)}
      .desktop-playlist-head button{width:30px;height:30px;display:grid;place-items:center;border:0;border-radius:50%;background:rgba(255,255,255,.07);color:#fff;cursor:pointer}.desktop-playlist-head svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2}
      .desktop-playlist-body{overflow:auto;padding:10px}.desktop-playlist-option{width:100%;min-height:54px;display:grid;grid-template-columns:36px minmax(0,1fr) 24px;align-items:center;gap:10px;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:#fff;text-align:left;cursor:pointer}.desktop-playlist-option:hover{background:rgba(255,159,10,.09)}
      .desktop-playlist-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:rgba(255,159,10,.12);color:#ff9f0a}.desktop-playlist-icon svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8}.desktop-playlist-copy{min-width:0;display:grid;gap:2px}.desktop-playlist-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.desktop-playlist-copy small{color:#9fa4ab;font-size:11px}.desktop-playlist-plus{color:#ff9f0a;font-size:22px;text-align:center}
      .desktop-playlist-create,.desktop-playlist-submit{width:100%;min-height:41px;margin-top:8px;border:1px solid rgba(255,159,10,.55);border-radius:10px;background:rgba(255,159,10,.08);color:#ff9f0a;font-weight:800;cursor:pointer}.desktop-playlist-submit{background:#ff9f0a;color:#171008}.desktop-playlist-message{margin:0;padding:12px 8px;color:#a8adb4;font-size:12px;text-align:center}.desktop-playlist-message.success{color:#63df8e}.desktop-playlist-message.error{color:#ff7188}
      .desktop-playlist-form{display:grid;gap:10px}.desktop-playlist-form label{display:grid;gap:5px;color:#cfd2d7;font-size:12px;font-weight:700}.desktop-playlist-form input,.desktop-playlist-form textarea{width:100%;padding:10px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#0b0d0f;color:#fff}.desktop-playlist-form textarea{min-height:70px;resize:vertical}
      .desktop-playlist-toast{position:fixed;left:50%;bottom:110px;z-index:12100;padding:10px 16px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(15,17,20,.96);color:#fff;font:700 12px Karla,system-ui,sans-serif;opacity:0;transform:translate(-50%,12px);pointer-events:none;transition:.18s ease}.desktop-playlist-toast.show{opacity:1;transform:translate(-50%,0)}
    `;
    document.head.appendChild(style);
  }

  function player() {
    return [...app.querySelectorAll('[data-player]')].find(node => node && !node.hidden && getComputedStyle(node).display !== 'none') || app.querySelector('[data-player]');
  }

  function ensureButton() {
    installStyles();
    const current = player();
    const row = current?.querySelector('.v2-artist-row');
    if (!current || !row || current.hidden) return;
    let button = row.querySelector('[data-desktop-add-playlist]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'desktop-add-playlist-button';
      button.dataset.desktopAddPlaylist = 'true';
      button.title = 'Add to Playlist';
      button.setAttribute('aria-label', 'Add this song to a playlist');
      button.innerHTML = `${PLUS}<span>Playlist</span>`;
      row.appendChild(button);
    }
    window.dispatchEvent(new CustomEvent('stashbox:desktop-controls-ready'));
  }

  async function songs() {
    if (catalog) return catalog;
    const body = await fetch(`${API}/radio/songs`, { cache: 'no-store' }).then(parse);
    const rows = Array.isArray(body) ? body : body.songs || body.items || body.data || [];
    catalog = rows.map((row, index) => ({
      key: clean(row.song_key || row.songKey || row.song_id || row.id || `song-${index}`),
      title: clean(row.display_title || row.song_name || row.title || ''),
      artist: clean(row.artist || row.artist_name || 'Stashbox'),
      genre: clean(row.genre || row.primary_genre || 'Other'),
      art: clean(row.resolved_artwork_url || row.song_artwork_url || row.artwork_url || row.cover_art_url || row.image_url || '')
    })).filter(item => item.key && item.title);
    return catalog;
  }

  async function currentSong() {
    const current = player();
    const title = clean(current?.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(current?.querySelector('[data-partist]')?.textContent);
    if (!title) return null;
    const list = await songs();
    return list.find(item => normalize(item.title) === normalize(title) && (!artist || normalize(item.artist) === normalize(artist)))
      || list.find(item => normalize(item.title) === normalize(title)) || null;
  }

  function toast(message) {
    let node = document.querySelector('.desktop-playlist-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'desktop-playlist-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 1800);
  }

  function closePopover() {
    popover?.remove();
    popover = null;
  }

  function positionPopover(button) {
    if (!popover || !button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(340, innerWidth - 32);
    const left = Math.max(16, Math.min(innerWidth - width - 16, rect.right - width));
    popover.style.left = `${Math.round(left)}px`;
    if (rect.bottom + 400 < innerHeight) popover.style.top = `${Math.round(rect.bottom + 8)}px`;
    else popover.style.bottom = `${Math.round(innerHeight - rect.top + 8)}px`;
  }

  function shell(title, button) {
    closePopover();
    const node = document.createElement('section');
    node.className = 'desktop-playlist-popover';
    node.innerHTML = `<header class="desktop-playlist-head"><strong>${esc(title)}</strong><button type="button" data-playlist-close aria-label="Close">${CLOSE}</button></header><div class="desktop-playlist-body" data-playlist-body><p class="desktop-playlist-message">Loading…</p></div>`;
    document.body.appendChild(node);
    popover = node;
    positionPopover(button);
    return node;
  }

  async function openPicker(button) {
    if (!loggedIn()) {
      document.querySelector('[data-desktop-login], [data-v2-auth-open="login"]')?.click();
      return;
    }
    const song = await currentSong().catch(() => null);
    if (!song) return toast('Could not identify this song');
    const node = shell('Add to Playlist', button);
    Object.assign(node.dataset, { songKey: song.key, songTitle: song.title, songArtist: song.artist, songGenre: song.genre, songArt: song.art });
    const body = node.querySelector('[data-playlist-body]');
    try {
      const result = await request('/radio/me/playlists');
      const playlists = result.playlists || [];
      body.innerHTML = `${playlists.map(item => `<button type="button" class="desktop-playlist-option" data-playlist-id="${esc(item.id)}"><span class="desktop-playlist-icon">${PLAYLIST}</span><span class="desktop-playlist-copy"><strong>${esc(item.name)}</strong><small>${Number(item.item_count || 0)} songs</small></span><span class="desktop-playlist-plus">+</span></button>`).join('') || '<p class="desktop-playlist-message">No playlists yet.</p>'}<button type="button" class="desktop-playlist-create" data-playlist-create>${PLUS} Create New Playlist</button><p class="desktop-playlist-message" data-playlist-message></p>`;
    } catch (error) {
      body.innerHTML = `<p class="desktop-playlist-message error">${esc(error.message)}</p>`;
    }
  }

  function songFromPopover() {
    return popover ? { key: clean(popover.dataset.songKey), title: clean(popover.dataset.songTitle), artist: clean(popover.dataset.songArtist), genre: clean(popover.dataset.songGenre), art: clean(popover.dataset.songArt) } : null;
  }

  async function add(id) {
    const song = songFromPopover();
    const message = popover?.querySelector('[data-playlist-message]');
    if (!song?.key) return;
    try {
      await request(`/radio/me/playlists/${encodeURIComponent(id)}/items`, { method: 'POST', body: JSON.stringify({ song_key: song.key, display_title: song.title, artist: song.artist, metadata: { artwork_url: song.art, genre: song.genre } }) });
      if (message) { message.textContent = 'Song added to playlist.'; message.className = 'desktop-playlist-message success'; }
      toast('Added to playlist');
      setTimeout(closePopover, 550);
    } catch (error) {
      if (message) { message.textContent = error.message; message.className = 'desktop-playlist-message error'; }
    }
  }

  function createForm() {
    const body = popover?.querySelector('[data-playlist-body]');
    if (!body) return;
    body.innerHTML = `<form class="desktop-playlist-form" data-playlist-form><label>Playlist Name<input name="name" maxlength="160" required></label><label>Description<textarea name="description" maxlength="1000"></textarea></label><button class="desktop-playlist-submit" type="submit">Create and Add Song</button><p class="desktop-playlist-message" data-playlist-message></p></form>`;
  }

  async function createPlaylist(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const message = form.querySelector('[data-playlist-message]');
    try {
      const result = await request('/radio/me/playlists', { method: 'POST', body: JSON.stringify({ name: data.name, description: data.description || '', visibility: 'private' }) });
      await add(result.playlist.id);
    } catch (error) {
      if (message) { message.textContent = error.message; message.className = 'desktop-playlist-message error'; }
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-desktop-add-playlist]');
    if (button) { event.preventDefault(); event.stopPropagation(); openPicker(button); return; }
    if (event.target.closest('[data-playlist-close]')) { closePopover(); return; }
    const option = event.target.closest('[data-playlist-id]');
    if (option) { add(option.dataset.playlistId); return; }
    if (event.target.closest('[data-playlist-create]')) { createForm(); return; }
    if (popover && !event.target.closest('.desktop-playlist-popover')) closePopover();
  }, true);

  document.addEventListener('submit', event => {
    if (!event.target.matches('[data-playlist-form]')) return;
    event.preventDefault();
    createPlaylist(event.target);
  }, true);

  const observer = new MutationObserver(ensureButton);
  observer.observe(app, { childList: true, subtree: true });
  window.addEventListener('resize', () => positionPopover(document.querySelector('[data-desktop-add-playlist]')), { passive: true });
  window.addEventListener('stashbox:desktop-song-change', ensureButton);
  [0, 50, 150, 350, 800, 1600, 3000].forEach(delay => setTimeout(ensureButton, delay));
})();