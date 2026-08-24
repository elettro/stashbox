(() => {
  'use strict';

  if (window.StashboxProfilePlaylistPlaybackControls) return;
  window.StashboxProfilePlaylistPlaybackControls = true;

  const isDev = location.pathname.includes('/radio/dev/v2/');
  const API = isDev
    ? 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev'
    : 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const TOKEN_KEY = isDev ? 'stashbox_radio_dev_cognito_tokens' : 'stashbox_radio_prod_cognito_tokens';
  const QUEUE_KEY = 'stashbox_v2_profile_queue_handoff';
  const HANDOFF_KEY = 'stashbox_v2_artist_song_handoff';
  const TARGET = isDev ? '/radio/dev/v2/?profile_play=1' : '/radio/?profile_play=1';
  const MAX_AGE_MS = 10 * 60 * 1000;
  const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
  const SHUFFLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h3c5 0 5 10 10 10h3M17 4l3 3-3 3M4 17h3c2 0 3-1.5 4-3M15 7c1-1 2-1 5-1M17 14l3 3-3 3"/></svg>';

  const clean = value => String(value ?? '').trim();

  function tokens() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null') || {}; }
    catch (_) { return {}; }
  }

  async function request(path, retry = true) {
    const value = tokens();
    const response = await fetch(`${API}${path}`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        ...(value.accessToken ? { Authorization: `Bearer ${value.accessToken}` } : {}),
        ...(value.idToken ? { 'X-Cognito-Id-Token': value.idToken } : {})
      }
    });
    if (response.status === 401 && retry && window.StashboxV2Session?.ensureFresh) {
      try {
        await window.StashboxV2Session.ensureFresh({ reason: 'profile-playlist-playback' });
        return request(path, false);
      } catch (_) {}
    }
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_) { body = {}; }
    if (!response.ok) throw new Error(body.error || body.message || `HTTP ${response.status}`);
    return body;
  }

  function toast(message) {
    let node = document.querySelector('.profile-playlist-playback-toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'profile-playlist-playback-toast';
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(node.__timer);
    node.__timer = setTimeout(() => node.classList.remove('show'), 2200);
  }

  function shuffle(values) {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  async function startPlaylist(playlistId, mode) {
    const id = clean(playlistId);
    if (!id) return;
    try {
      const body = await request(`/radio/me/playlists/${encodeURIComponent(id)}`);
      const playlist = body.playlist || {};
      const ordered = [];
      (Array.isArray(playlist.items) ? playlist.items : []).forEach(item => {
        const key = clean(item.song_key || item.songKey || item.song_id || item.songId);
        if (key && !ordered.includes(key)) ordered.push(key);
      });
      if (!ordered.length) {
        toast('This playlist is empty');
        return;
      }
      const songKeys = mode === 'shuffle' ? shuffle(ordered) : ordered;
      const now = Date.now();
      const payload = {
        songKeys,
        index: 0,
        selectedSongKey: songKeys[0],
        playlistId: id,
        playlistName: clean(playlist.name || 'Playlist'),
        mode: mode === 'shuffle' ? 'profile-playlist-shuffle' : 'profile-playlist',
        autoplay: true,
        createdAt: now,
        expiresAt: now + MAX_AGE_MS
      };
      try {
        sessionStorage.setItem(QUEUE_KEY, JSON.stringify(payload));
        sessionStorage.removeItem(HANDOFF_KEY);
      } catch (_) {}
      location.href = TARGET;
    } catch (error) {
      toast(error.message || 'Could not start playlist');
    }
  }

  function ensureStyle() {
    if (document.getElementById('profilePlaylistPlaybackStyle')) return;
    const style = document.createElement('style');
    style.id = 'profilePlaylistPlaybackStyle';
    style.textContent = `
      .profile-playlist-top-playback{display:flex;align-items:center;gap:8px;margin-right:auto}
      .profile-playlist-top-playback .profile-button{display:inline-flex;align-items:center;gap:7px}
      .profile-playlist-top-playback .profile-button svg{width:16px;height:16px}
      .profile-playlist-top-playback .profile-playlist-play-primary{background:var(--p-orange,#ff9f0a);border-color:var(--p-orange,#ff9f0a);color:#171008}
      .profile-list-actions .profile-playlist-row-action{width:34px;height:34px;display:grid;place-items:center;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:50%;background:rgba(255,255,255,.035);color:#fff;cursor:pointer}
      .profile-list-actions .profile-playlist-row-action:hover{border-color:var(--p-orange,#ff9f0a);color:var(--p-orange,#ff9f0a)}
      .profile-list-actions .profile-playlist-row-action svg{width:16px;height:16px}
      .profile-list-actions .profile-playlist-row-action.play svg{fill:currentColor;stroke:none;margin-left:1px}
      .profile-playlist-playback-toast{position:fixed;left:50%;bottom:90px;z-index:500;max-width:calc(100vw - 30px);padding:10px 15px;border:1px solid rgba(255,255,255,.14);border-radius:999px;background:rgba(15,17,20,.97);color:#fff;font:700 12px Karla,system-ui,sans-serif;opacity:0;transform:translate(-50%,12px);pointer-events:none;transition:.18s ease}
      .profile-playlist-playback-toast.show{opacity:1;transform:translate(-50%,0)}
      @media(max-width:640px){.profile-playlist-top-playback{width:100%;order:-1}.profile-playlist-top-playback .profile-button{flex:1}.profile-list-actions .profile-playlist-row-action{width:32px;height:32px}}
    `;
    document.head.appendChild(style);
  }

  function enhanceListing(root = document) {
    root.querySelectorAll('.profile-list-row [data-open-playlist]').forEach(open => {
      const id = clean(open.dataset.openPlaylist);
      const actions = open.closest('.profile-list-actions');
      if (!id || !actions || actions.querySelector(`[data-profile-play-playlist="${CSS.escape(id)}"]`)) return;
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'profile-playlist-row-action play';
      play.dataset.profilePlayPlaylist = id;
      play.setAttribute('aria-label', 'Play playlist');
      play.title = 'Play playlist';
      play.innerHTML = PLAY;
      const shuffleButton = document.createElement('button');
      shuffleButton.type = 'button';
      shuffleButton.className = 'profile-playlist-row-action shuffle';
      shuffleButton.dataset.profileShufflePlaylist = id;
      shuffleButton.setAttribute('aria-label', 'Shuffle playlist');
      shuffleButton.title = 'Shuffle playlist';
      shuffleButton.innerHTML = SHUFFLE;
      actions.insertBefore(play, open);
      actions.insertBefore(shuffleButton, open);
    });
  }

  function enhanceDetail(root = document) {
    root.querySelectorAll('.profile-overlay').forEach(overlay => {
      const rename = overlay.querySelector('[data-rename-playlist]');
      const remove = overlay.querySelector('[data-delete-playlist]');
      const id = clean(rename?.dataset.renamePlaylist || remove?.dataset.deletePlaylist);
      if (!id) return;
      const actions = rename?.closest('.profile-form-actions') || remove?.closest('.profile-form-actions');
      if (!actions || actions.querySelector('[data-profile-playlist-top-playback]')) return;
      const group = document.createElement('span');
      group.className = 'profile-playlist-top-playback';
      group.dataset.profilePlaylistTopPlayback = 'true';
      group.innerHTML = `<button type="button" class="profile-button profile-playlist-play-primary" data-profile-play-playlist="${id}">${PLAY}<span>Play</span></button><button type="button" class="profile-button ghost" data-profile-shuffle-playlist="${id}">${SHUFFLE}<span>Shuffle</span></button>`;
      actions.insertBefore(group, actions.firstChild);
    });
  }

  function enhance() {
    ensureStyle();
    enhanceListing();
    enhanceDetail();
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const play = target.closest('[data-profile-play-playlist]');
    if (play) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return startPlaylist(play.dataset.profilePlayPlaylist, 'ordered');
    }
    const shuffleButton = target.closest('[data-profile-shuffle-playlist]');
    if (shuffleButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return startPlaylist(shuffleButton.dataset.profileShufflePlaylist, 'shuffle');
    }
  }, true);

  const observer = new MutationObserver(enhance);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pageshow', enhance);
  window.addEventListener('focus', enhance);
  enhance();
})();
