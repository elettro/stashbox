(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app || !matchMedia('(min-width: 900px)').matches) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const TOKEN_KEY = 'stashbox_radio_prod_cognito_tokens';
  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const PLAYLIST = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h7"/><path d="M4 5v14"/></svg>';

  let catalog = null;
  let popover = null;
  let queued = false;

  function clean(value) {
    return String(value ?? '').trim();
  }

  function esc(value) {
    return clean(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalize(value) {
    return clean(value).toLowerCase().replace(/\s+/g, ' ');
  }

  function readTokens() {
    try {
      return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {};
    } catch (_) {
      return {};
    }
  }

  function loggedIn() {
    return Boolean(readTokens().accessToken);
  }

  function authHeaders(json = false) {
    const tokens = readTokens();
    return {
      ...(json ? { 'Content-Type': 'application/json' } : {}),
      ...(tokens.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      ...(tokens.idToken ? { 'X-Cognito-Id-Token': tokens.idToken } : {})
    };
  }

  async function parseResponse(response) {
    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (_) {
      body = { error: text };
    }
    if (!response.ok) {
      const error = new Error(body.error || body.message || `HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function request(path, options = {}, retry = true) {
    const url = String(path).startsWith('http') ? path : `${API}${path}`;
    const headers = {
      ...authHeaders(Boolean(options.body)),
      ...(options.headers || {})
    };
    const response = await fetch(url, {
      cache: 'no-store',
      credentials: 'omit',
      ...options,
      headers
    });
    if (response.status === 401 && retry && window.StashboxV2Session?.ensureFresh) {
      try {
        await window.StashboxV2Session.ensureFresh({ reason: 'desktop-add-playlist' });
        return request(path, options, false);
      } catch (_) {}
    }
    return parseResponse(response);
  }

  function ensureStyle() {
    if (document.getElementById('desktopAddPlaylistStyle')) return;
    const style = document.createElement('style');
    style.id = 'desktopAddPlaylistStyle';
    style.textContent = `
      .desktop-clean-runtime .v2-player .v2-artist-row{display:flex;align-items:center;gap:10px;min-width:0}
      .desktop-clean-runtime .desktop-add-playlist-button{margin-left:auto;flex:0 0 auto;min-height:30px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 11px;border:1px solid rgba(255,159,10,.58);border-radius:999px;background:rgba(5,6,7,.52);color:#ff9f0a;font:700 12px/1 Karla,system-ui,sans-serif;letter-spacing:.01em;cursor:pointer;backdrop-filter:blur(10px);transition:background .16s ease,border-color .16s ease,color .16s ease}
      .desktop-clean-runtime .desktop-add-playlist-button:hover{background:#ff9f0a;border-color:#ff9f0a;color:#171008}
      .desktop-clean-runtime .desktop-add-playlist-button svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .desktop-playlist-popover{position:fixed;z-index:12050;width:min(340px,calc(100vw - 32px));max-height:min(520px,70vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.14);border-radius:16px;background:rgba(15,17,20,.98);color:#f7f3eb;box-shadow:0 24px 80px rgba(0,0,0,.55);font-family:Karla,system-ui,sans-serif;backdrop-filter:blur(18px)}
      .desktop-playlist-popover-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 16px 12px;border-bottom:1px solid rgba(255,255,255,.09)}
      .desktop-playlist-popover-head strong{font-size:15px}
      .desktop-playlist-popover-head button{width:30px;height:30px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:rgba(255,255,255,.07);color:#fff;cursor:pointer}
      .desktop-playlist-popover-head svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
      .desktop-playlist-popover-body{overflow:auto;padding:10px}
      .desktop-playlist-option{width:100%;min-height:54px;display:grid;grid-template-columns:36px minmax(0,1fr) 24px;align-items:center;gap:10px;padding:8px 10px;border:0;border-radius:10px;background:transparent;color:#fff;text-align:left;cursor:pointer}
      .desktop-playlist-option:hover{background:rgba(255,159,10,.09)}
      .desktop-playlist-option>span:first-child{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:rgba(255,159,10,.12);color:#ff9f0a}
      .desktop-playlist-option svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
      .desktop-playlist-option-copy{min-width:0;display:grid;gap:2px}
      .desktop-playlist-option-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
      .desktop-playlist-option-copy small{color:#9fa4ab;font-size:11px}
      .desktop-playlist-option-plus{color:#ff9f0a;font-size:22px;text-align:center}
      .desktop-playlist-create{width:100%;min-height:40px;margin-top:8px;border:1px solid rgba(255,159,10,.55);border-radius:10px;background:rgba(255,159,10,.08);color:#ff9f0a;font-weight:800;cursor:pointer}
      .desktop-playlist-create:hover{background:#ff9f0a;color:#171008}
      .desktop-playlist-empty,.desktop-playlist-message{margin:0;padding:16px 10px;color:#a8adb4;font-size:12px;text-align:center}
      .desktop-playlist-message.success{color:#63df8e}.desktop-playlist-message.error{color:#ff7188}
      .desktop-playlist-form{display:grid;gap:11px;padding:4px}
      .desktop-playlist-form label{display:grid;gap:6px;color:#cfd2d7;font-size:12px;font-weight:700}
      .desktop-playlist-form input,.desktop-playlist-form textarea{width:100%;padding:10px 11px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:#0b0d0f;color:#fff;outline:none}
      .desktop-playlist-form textarea{min-height:78px;resize:vertical}
      .desktop-playlist-form input:focus,.desktop-playlist-form textarea:focus{border-color:#ff9f0a}
      .desktop-playlist-submit{min-height:42px;border:0;border-radius:10px;background:#ff9f0a;color:#171008;font-weight:900;cursor:pointer}
      .desktop-playlist-toast{position:fixed;left:50%;bottom:110px;z-index:12100;padding:10px 16px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(15,17,20,.96);color:#fff;font:700 12px Karla,system-ui,sans-serif;opacity:0;transform:translate(-50%,12px);pointer-events:none;transition:.18s ease}
      .desktop-playlist-toast.is-visible{opacity:1;transform:translate(-50%,0)}
    `;
    document.head.appendChild(style);
  }

  function player() {
    return app.querySelector('[data-player]');
  }

  function playerVisible() {
    const node = player();
    return Boolean(node && !node.hidden && getComputedStyle(node).display !== 'none');
  }

  function ensureButton() {
    ensureStyle();
    const currentPlayer = player();
    if (!currentPlayer || !playerVisible()) {
      closePopover();
      return;
    }
    const artistRow = currentPlayer.querySelector('.v2-artist-row');
    if (!artistRow || artistRow.querySelector('[data-desktop-add-playlist]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desktop-add-playlist-button';
    button.dataset.desktopAddPlaylist = 'true';
    button.setAttribute('aria-label', 'Add this song to a playlist');
    button.title = 'Add to Playlist';
    button.innerHTML = `${PLUS}<span>Playlist</span>`;
    artistRow.appendChild(button);
  }

  function queueEnsure() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      ensureButton();
    });
  }

  async function loadCatalog() {
    if (catalog) return catalog;
    const body = await fetch(`${API}/radio/songs`, { cache: 'no-store' }).then(parseResponse);
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
    const currentPlayer = player();
    const title = clean(currentPlayer?.querySelector('[data-ptitle]')?.textContent);
    const artist = clean(currentPlayer?.querySelector('[data-partist]')?.textContent);
    if (!title) return null;
    const songs = await loadCatalog();
    return songs.find(item => normalize(item.title) === normalize(title) && (!artist || normalize(item.artist) === normalize(artist)))
      || songs.find(item => normalize(item.title) === normalize(title))
      || null;
  }

  function toast(message) {
    let node = document.querySelector('.desktop-playlist-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'desktop-playlist-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(node.__timer);
    node.__timer = setTimeout(() => node.classList.remove('is-visible'), 2100);
  }

  function closePopover() {
    popover?.remove();
    popover = null;
  }

  function positionPopover(button) {
    if (!popover || !button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 32);
    const margin = 16;
    const left = Math.max(margin, Math.min(window.innerWidth - width - margin, rect.right - width));
    popover.style.left = `${Math.round(left)}px`;
    popover.style.right = 'auto';
    popover.style.top = 'auto';
    popover.style.bottom = 'auto';

    const preferredTop = rect.bottom + 8;
    const estimatedHeight = Math.min(480, window.innerHeight * 0.7);
    if (preferredTop + estimatedHeight <= window.innerHeight - margin) {
      popover.style.top = `${Math.round(preferredTop)}px`;
    } else {
      const bottom = Math.max(margin, window.innerHeight - rect.top + 8);
      popover.style.bottom = `${Math.round(bottom)}px`;
    }
  }

  function popoverShell(title) {
    closePopover();
    const node = document.createElement('section');
    node.className = 'desktop-playlist-popover';
    node.innerHTML = `<header class="desktop-playlist-popover-head"><strong>${esc(title)}</strong><button type="button" data-desktop-playlist-close aria-label="Close">${CLOSE}</button></header><div class="desktop-playlist-popover-body" data-desktop-playlist-body><p class="desktop-playlist-message">Loading…</p></div>`;
    document.body.appendChild(node);
    popover = node;
    return node;
  }

  async function openPicker(button) {
    if (!loggedIn()) {
      const login = document.querySelector('[data-v2-auth-open="login"], [data-desktop-login]');
      login?.click();
      return;
    }

    const song = await currentSong().catch(() => null);
    if (!song) {
      toast('Could not identify this song');
      return;
    }

    const node = popoverShell('Add to Playlist');
    node.dataset.songKey = song.key;
    node.dataset.songTitle = song.title;
    node.dataset.songArtist = song.artist;
    node.dataset.songGenre = song.genre;
    node.dataset.songArt = song.art;
    positionPopover(button);

    const bodyNode = node.querySelector('[data-desktop-playlist-body]');
    try {
      const body = await request('/radio/me/playlists');
      const playlists = body.playlists || [];
      bodyNode.innerHTML = `${playlists.length ? playlists.map(item => `
        <button type="button" class="desktop-playlist-option" data-desktop-playlist-id="${esc(item.id)}">
          <span>${PLAYLIST}</span>
          <span class="desktop-playlist-option-copy"><strong>${esc(item.name)}</strong><small>${Number(item.item_count || 0)} songs</small></span>
          <span class="desktop-playlist-option-plus">+</span>
        </button>`).join('') : '<p class="desktop-playlist-empty">No playlists yet.</p>'}
        <button type="button" class="desktop-playlist-create" data-desktop-create-playlist>${PLUS} Create New Playlist</button>
        <p class="desktop-playlist-message" data-desktop-playlist-message></p>`;
    } catch (error) {
      bodyNode.innerHTML = `<p class="desktop-playlist-message error">${esc(error.message)}</p>`;
    }
  }

  function popoverSong() {
    if (!popover) return null;
    return {
      key: clean(popover.dataset.songKey),
      title: clean(popover.dataset.songTitle),
      artist: clean(popover.dataset.songArtist),
      genre: clean(popover.dataset.songGenre),
      art: clean(popover.dataset.songArt)
    };
  }

  async function addToPlaylist(id) {
    const song = popoverSong();
    if (!song?.key) return;
    const message = popover?.querySelector('[data-desktop-playlist-message]');
    try {
      await request(`/radio/me/playlists/${encodeURIComponent(id)}/items`, {
        method: 'POST',
        body: JSON.stringify({
          song_key: song.key,
          display_title: song.title,
          artist: song.artist,
          metadata: {
            artwork_url: song.art,
            genre: song.genre
          }
        })
      });
      if (message) {
        message.textContent = 'Song added to playlist.';
        message.className = 'desktop-playlist-message success';
      }
      toast('Added to playlist');
      setTimeout(closePopover, 600);
    } catch (error) {
      if (message) {
        message.textContent = error.message;
        message.className = 'desktop-playlist-message error';
      }
    }
  }

  function openCreateForm() {
    if (!popover) return;
    const body = popover.querySelector('[data-desktop-playlist-body]');
    popover.querySelector('.desktop-playlist-popover-head strong').textContent = 'New Playlist';
    body.innerHTML = `<form class="desktop-playlist-form" data-desktop-playlist-form>
      <label>Playlist Name<input name="name" maxlength="160" required autofocus></label>
      <label>Description<textarea name="description" maxlength="1000"></textarea></label>
      <button type="submit" class="desktop-playlist-submit">Create and Add Song</button>
      <p class="desktop-playlist-message" data-desktop-playlist-message></p>
    </form>`;
    body.querySelector('input')?.focus();
  }

  async function createPlaylist(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const message = form.querySelector('[data-desktop-playlist-message]');
    try {
      const body = await request('/radio/me/playlists', {
        method: 'POST',
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          visibility: 'private'
        })
      });
      await addToPlaylist(body.playlist.id);
    } catch (error) {
      if (message) {
        message.textContent = error.message;
        message.className = 'desktop-playlist-message error';
      }
    }
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-desktop-add-playlist]');
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      openPicker(button);
      return;
    }

    if (event.target.closest('[data-desktop-playlist-close]')) {
      closePopover();
      return;
    }

    const playlist = event.target.closest('[data-desktop-playlist-id]');
    if (playlist) {
      addToPlaylist(playlist.dataset.desktopPlaylistId);
      return;
    }

    if (event.target.closest('[data-desktop-create-playlist]')) {
      openCreateForm();
      return;
    }

    if (popover && !event.target.closest('.desktop-playlist-popover')) closePopover();
  }, true);

  document.addEventListener('submit', event => {
    if (!event.target.matches('[data-desktop-playlist-form]')) return;
    event.preventDefault();
    createPlaylist(event.target);
  }, true);

  window.addEventListener('resize', closePopover);
  window.addEventListener('pageshow', queueEnsure);
  window.addEventListener('focus', queueEnsure);
  window.addEventListener('storage', queueEnsure);

  new MutationObserver(queueEnsure).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  setInterval(queueEnsure, 900);
  queueEnsure();
})();