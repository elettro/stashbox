import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_PATH = path.join(ROOT, 'radio/dev/app.js');
const ACCOUNT_PATH = path.join(ROOT, 'radio/dev/account.js');
const LOADER_PATH = path.join(ROOT, 'radio/dev/notifications.js');
const UI_PATH = path.join(ROOT, 'radio/dev/account-playlist-ui.js');
const REPORT_PATH = path.join(ROOT, 'radio/dev/PLAYLIST_PLAYBACK_STATUS.md');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one anchor, found ${count}.`);
  }
  return source.replace(before, after);
}

function replaceRegex(source, pattern, after, label) {
  const matches = source.match(pattern);
  if (!matches) throw new Error(`${label}: required code block was not found.`);
  return source.replace(pattern, after);
}

function materialize(raw) {
  return raw
    .replaceAll('__BT__', '`')
    .replaceAll('__DL__', '${');
}

let app = read(APP_PATH);
let account = read(ACCOUNT_PATH);
let loader = read(LOADER_PATH);

if (!app.includes("const STASHBOX_PLAYLIST_PLAY_EVENT = 'stashbox:playlist-play';")) {
  app = replaceExact(
    app,
    "const DEV_RADIO_SHARE_URL = 'https://stashbox.com/radio/dev/';\n",
    "const DEV_RADIO_SHARE_URL = 'https://stashbox.com/radio/dev/';\nconst STASHBOX_PLAYLIST_PLAY_EVENT = 'stashbox:playlist-play';\n",
    'DEV playlist event constant'
  );
}

if (!app.includes("activeShuffleSourceKey.startsWith('playlist:')")) {
  app = replaceExact(
    app,
    "    if (!isShuffleQueueActive || !activeShuffleSourceKey || activeShuffleSourceKey === shuffleSourceKey) return;",
    "    if (!isShuffleQueueActive || !activeShuffleSourceKey || activeShuffleSourceKey === shuffleSourceKey || activeShuffleSourceKey.startsWith('playlist:')) return;",
    'preserve playlist queue across browsing-filter changes'
  );
}

if (!app.includes('[playlist playback] queue started')) {
  const playlistEffect = materialize(String.raw`
  useEffect(() => {
    const handlePlaylistPlayback = event => {
      const detail = event?.detail || {};
      const requestedItems = Array.isArray(detail.items) ? detail.items : [];
      const requestedMode = clean(detail.mode).toLowerCase() === 'shuffle' ? 'shuffle' : 'ordered';
      const playlistId = clean(detail.playlistId || detail.playlist_id || detail.id || 'playlist');
      const playlistName = clean(detail.playlistName || detail.playlist_name || detail.name || 'Playlist');
      const keyMap = new Map();

      tracks.forEach(track => {
        [
          track?.songKey,
          track?.song_key,
          track?.id,
          track?.idx,
          track?.raw?.song_key,
          track?.raw?.song_id,
          track?.raw?.id
        ].map(value => clean(value).toLowerCase()).filter(Boolean).forEach(key => keyMap.set(key, track));
      });

      const requestedQueue = requestedItems.map(item => {
        const itemKeys = [
          item?.song_key,
          item?.songKey,
          item?.song_id,
          item?.songId,
          item?.id
        ].map(value => clean(value).toLowerCase()).filter(Boolean);
        const keyMatch = itemKeys.map(key => keyMap.get(key)).find(Boolean);
        if (keyMatch) return keyMatch;

        const requestedTitle = clean(item?.display_title || item?.title || item?.song_name).toLowerCase();
        const requestedArtist = clean(item?.artist || item?.artist_name).toLowerCase();
        return tracks.find(track => {
          const titleMatches = requestedTitle && getSongTitle(track).toLowerCase() === requestedTitle;
          const artistMatches = !requestedArtist || getSongArtist(track).toLowerCase() === requestedArtist;
          return titleMatches && artistMatches;
        }) || null;
      }).filter(Boolean).filter(canPlayTrack);

      const seen = new Set();
      const dedupedQueue = requestedQueue.filter(track => {
        const key = clean(track?.songKey || track?.song_key || track?.idx || track?.id);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const queue = requestedMode === 'shuffle' ? shuffleTracks(dedupedQueue) : dedupedQueue;

      if (!queue.length) {
        setPlayerMessage(__BT____DL__playlistName} does not contain any currently playable songs.__BT__);
        return;
      }

      const firstTrack = queue[0];
      finishPlayback('play_partial');
      setCurrentAd(null);
      setIsAdPlaying(false);
      pendingAdNextSongRef.current = null;
      setActiveShuffleQueue(queue);
      setActiveShuffleIndex(0);
      setActiveShuffleSourceKey(__BT__playlist:__DL__playlistId}:__DL__requestedMode}__BT__);
      setIsShuffleQueueActive(true);
      setShuffleNotice(__BT____DL__playlistName} · __DL__queue.length} song__DL__queue.length === 1 ? '' : 's'} · __DL__requestedMode === 'shuffle' ? 'Shuffled playlist' : 'Playlist order'}__BT__);
      setPlayerMessage(__BT__Playing “__DL__playlistName}” __DL__requestedMode === 'shuffle' ? 'in shuffle mode' : 'in playlist order'}. The list will repeat.__BT__);
      console.log('[playlist playback] queue started', {
        playlist_id: playlistId,
        playlist_name: playlistName,
        mode: requestedMode,
        song_keys: queue.map(track => track.songKey || track.song_key)
      });
      selectTrack(firstTrack, {
        autoStart: true,
        preferVideo: isVideoOnlyTrack(firstTrack) || !firstTrack.hasAudio,
        startSource: requestedMode === 'shuffle' ? 'playlist_shuffle' : 'playlist_play'
      });
      window.dispatchEvent(new CustomEvent('stashbox:playlist-player-started', {
        detail: { playlistId, playlistName, mode: requestedMode, count: queue.length }
      }));
    };

    window.addEventListener(STASHBOX_PLAYLIST_PLAY_EVENT, handlePlaylistPlayback);
    return () => window.removeEventListener(STASHBOX_PLAYLIST_PLAY_EVENT, handlePlaylistPlayback);
  }, [tracks, finishPlayback, mediaMode]);

`);
  app = replaceExact(
    app,
    "  function resolveAdjacentPlayableSong(direction, song = selectedSong, { allowWrap = true } = {}) {",
    `${playlistEffect}  function resolveAdjacentPlayableSong(direction, song = selectedSong, { allowWrap = true } = {}) {`,
    'playlist event listener insertion'
  );
}

if (!account.includes("const PLAYLIST_PLAY_EVENT = 'stashbox:playlist-play';")) {
  account = replaceExact(
    account,
    "  const ACCOUNT_CSS_URL = './account.css';\n",
    "  const ACCOUNT_CSS_URL = './account.css';\n  const PLAYLIST_PLAY_EVENT = 'stashbox:playlist-play';\n  const PLAYLIST_FALLBACK_ARTWORK = '/images/branding/stashbox-logo-transparent-rastacolors.png';\n",
    'account playlist constants'
  );
}

if (!account.includes('playlistDetails: {}')) {
  account = replaceExact(
    account,
    "    menuOpen: false,\n    currentPlaylistSong: null\n",
    "    menuOpen: false,\n    currentPlaylistSong: null,\n    playlistDetails: {}\n",
    'account playlist detail state'
  );
}

if (!account.includes('state.playlistDetails = {};')) {
  account = replaceExact(
    account,
    "    state.preferences = null;\n    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_) {}",
    "    state.preferences = null;\n    state.playlistDetails = {};\n    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch (_) {}",
    'clear cached playlist details on logout'
  );
}

if (!account.includes('function normalizeArtworkUrl(value)')) {
  const normalizeBlock = `  function normalizeArtworkUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    return url.replace('www.dropbox.com', 'dl.dropboxusercontent.com').replace(/\\?dl=[01]/, '');
  }

  function normalizeSong(row) {
    return {
      song_key: String(row?.song_key || row?.songKey || row?.id || '').trim(),
      song_id: String(row?.song_id || row?.songId || row?.id || '').trim(),
      display_title: String(row?.display_title || row?.title || row?.song_name || '').trim(),
      artist: String(row?.artist || row?.artist_name || 'Stashbox').trim(),
      genre: String(row?.genre || row?.primary_genre || '').trim(),
      artwork_url: normalizeArtworkUrl(row?.resolved_artwork_url || row?.song_artwork_url || row?.artwork_url || row?.cover_art_url || row?.image_url || '')
    };
  }
`;
  account = replaceRegex(
    account,
    /  function normalizeSong\(row\) \{[\s\S]*?\n  \}\n\n  function currentSongFromDom/,
    `${normalizeBlock}\n  function currentSongFromDom`,
    'account song normalization with artwork'
  );
}

if (!account.includes("dataset.playPlaylist")) {
  account = replaceExact(
    account,
    "    const addPlaylistId = event.target.closest('[data-add-to-playlist]')?.dataset.addToPlaylist;\n    if (addPlaylistId) return addCurrentSongToPlaylist(addPlaylistId);\n",
    "    const addPlaylistId = event.target.closest('[data-add-to-playlist]')?.dataset.addToPlaylist;\n    if (addPlaylistId) return addCurrentSongToPlaylist(addPlaylistId);\n    const playPlaylistId = event.target.closest('[data-play-playlist]')?.dataset.playPlaylist;\n    if (playPlaylistId) return startPlaylistPlayback(playPlaylistId, 'ordered');\n    const shufflePlaylistId = event.target.closest('[data-shuffle-playlist]')?.dataset.shufflePlaylist;\n    if (shufflePlaylistId) return startPlaylistPlayback(shufflePlaylistId, 'shuffle');\n",
    'playlist Play and Shuffle click handling'
  );
}

if (!account.includes('function renderPlaylistDetail(playlist, target)')) {
  const playlistBlock = materialize(String.raw`  function resolvePlaylistSong(item) {
    const normalizedSongs = state.songs.map(normalizeSong);
    const itemKeys = [item?.song_key, item?.songKey, item?.song_id, item?.songId, item?.id]
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    const keyMatch = normalizedSongs.find(song => [song.song_key, song.song_id]
      .map(value => String(value || '').trim().toLowerCase())
      .some(value => value && itemKeys.includes(value)));
    if (keyMatch) return keyMatch;
    const title = String(item?.display_title || item?.title || item?.song_name || '').trim().toLowerCase();
    const artist = String(item?.artist || item?.artist_name || '').trim().toLowerCase();
    return normalizedSongs.find(song => song.display_title.toLowerCase() === title && (!artist || song.artist.toLowerCase() === artist)) || null;
  }

  function renderPlaylistDetail(playlist, target) {
    if (!target || !playlist) return;
    const items = Array.isArray(playlist.items) ? playlist.items : [];
    const playlistId = escapeHtml(playlist.id || '');
    const tracksMarkup = items.length ? __BT__
      <div class="radio-playlist-track-list">
        __DL__items.map((item, index) => {
          const song = resolvePlaylistSong(item);
          const title = item.display_title || item.title || item.song_name || item.song_key || 'Untitled song';
          const artist = item.artist || item.artist_name || song?.artist || 'Stashbox';
          const artwork = song?.artwork_url || PLAYLIST_FALLBACK_ARTWORK;
          return __BT__
            <article class="radio-playlist-track" data-playlist-song-key="__DL__escapeHtml(item.song_key || song?.song_key || '')}">
              <div class="radio-playlist-track-artwork">
                <img src="__DL__escapeHtml(artwork)}" alt="__DL__escapeHtml(title)} artwork" loading="lazy">
                <span aria-hidden="true">__DL__index + 1}</span>
              </div>
              <div class="radio-playlist-track-copy">
                <strong>__DL__escapeHtml(title)}</strong>
                <span>__DL__escapeHtml(artist)}</span>
              </div>
            </article>__BT__;
        }).join('')}
      </div>__BT__ : '<p class="radio-account-empty">This playlist is empty.</p>';

    target.innerHTML = __BT__
      <section class="radio-playlist-detail" data-playlist-detail-id="__DL__playlistId}">
        <header class="radio-playlist-detail-header">
          <div>
            <p class="radio-playlist-detail-kicker">Personal Playlist</p>
            <h3 class="radio-account-section-title">__DL__escapeHtml(playlist.name || 'Playlist')}</h3>
            <span class="radio-playlist-detail-count">__DL__items.length} song__DL__items.length === 1 ? '' : 's'}</span>
          </div>
          <div class="radio-playlist-playback-actions" aria-label="Playlist playback controls">
            <button class="primary radio-playlist-start-button" type="button" data-play-playlist="__DL__playlistId}" __DL__items.length ? '' : 'disabled'}>
              <span aria-hidden="true">▶</span> Play
            </button>
            <button class="radio-playlist-shuffle-button" type="button" data-shuffle-playlist="__DL__playlistId}" __DL__items.length ? '' : 'disabled'}>
              <span aria-hidden="true">⇄</span> Shuffle
            </button>
          </div>
        </header>
        __DL__tracksMarkup}
      </section>__BT__;
  }

  function startPlaylistPlayback(playlistId, mode = 'ordered') {
    const playlist = state.playlistDetails?.[playlistId];
    if (!playlist) return setFeedback('', 'Open the playlist before starting playback.');
    const items = (Array.isArray(playlist.items) ? playlist.items : []).map(item => {
      const song = resolvePlaylistSong(item);
      return {
        song_key: item.song_key || item.songKey || song?.song_key || '',
        song_id: item.song_id || item.songId || song?.song_id || '',
        display_title: item.display_title || item.title || item.song_name || song?.display_title || '',
        artist: item.artist || item.artist_name || song?.artist || ''
      };
    }).filter(item => item.song_key || item.display_title);
    if (!items.length) return setFeedback('', 'This playlist does not contain any playable songs.');

    closeModal();
    window.dispatchEvent(new CustomEvent(PLAYLIST_PLAY_EVENT, {
      detail: {
        playlistId,
        playlistName: playlist.name || 'Playlist',
        mode: mode === 'shuffle' ? 'shuffle' : 'ordered',
        items
      }
    }));
  }

  async function showPlaylist(playlistId) {
    setBusy(true);
    try {
      const result = await apiFetch(__BT____DL__ME_URL}/playlists/__DL__encodeURIComponent(playlistId)}__BT__);
      const playlist = result.playlist || null;
      if (playlist) state.playlistDetails[playlistId] = playlist;
      const target = ui.content.querySelector('[data-playlist-detail]');
      renderPlaylistDetail(playlist, target);
    } catch (error) {
      setFeedback('', friendlyError(error));
    } finally {
      setBusy(false);
    }
  }

`);
  account = replaceRegex(
    account,
    /  async function showPlaylist\(playlistId\) \{[\s\S]*?\n  \}\n\n  async function deletePlaylist/,
    `${playlistBlock}  async function deletePlaylist`,
    'playlist detail rendering and playback dispatch'
  );
}

if (!loader.includes('account-playlist-ui.js')) {
  loader = replaceExact(
    loader,
    "    .then(() => loadScript('./account-preferences-ui.js?v=20260720-toggle1'))\n",
    "    .then(() => loadScript('./account-preferences-ui.js?v=20260720-toggle1'))\n    .then(() => loadScript('./account-playlist-ui.js?v=20260720-playlist1'))\n",
    'load playlist account styling'
  );
}

const playlistUi = materialize(String.raw`(() => {
  const STYLE_ID = 'stashbox-account-playlist-ui';
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = __BT__
    .radio-playlist-detail {
      display: grid;
      gap: 14px;
      margin-top: 6px;
    }

    .radio-playlist-detail-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 16px;
      border: 1px solid rgba(240, 165, 0, .28);
      border-radius: 14px;
      background: linear-gradient(135deg, rgba(240, 165, 0, .09), rgba(255, 255, 255, .025));
    }

    .radio-playlist-detail-header > div:first-child {
      min-width: 0;
    }

    .radio-playlist-detail-kicker {
      margin: 0 0 5px;
      color: #f0a500;
      font: 800 11px/1 Karla, Arial, sans-serif;
      letter-spacing: .12em;
      text-transform: uppercase;
    }

    .radio-playlist-detail-header .radio-account-section-title {
      margin: 0;
      color: #fff;
      font-size: 22px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .radio-playlist-detail-count {
      display: block;
      margin-top: 5px;
      color: #aaa;
      font: 600 13px/1.2 Karla, Arial, sans-serif;
    }

    .radio-playlist-playback-actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 9px;
      flex: 0 0 auto;
    }

    .radio-playlist-playback-actions button {
      min-width: 94px;
      height: 40px;
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 15px;
    }

    .radio-playlist-shuffle-button {
      border-color: rgba(240, 165, 0, .5) !important;
      color: #ffd064 !important;
      background: rgba(240, 165, 0, .08) !important;
    }

    .radio-playlist-track-list {
      display: grid;
      gap: 9px;
    }

    .radio-playlist-track {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      align-items: center;
      gap: 13px;
      min-width: 0;
      padding: 9px 13px 9px 9px;
      border: 1px solid rgba(255, 255, 255, .13);
      border-radius: 13px;
      background: linear-gradient(135deg, rgba(255, 255, 255, .045), rgba(255, 255, 255, .018));
      transition: border-color .16s ease, background .16s ease, transform .16s ease;
    }

    .radio-playlist-track:hover {
      border-color: rgba(240, 165, 0, .38);
      background: linear-gradient(135deg, rgba(240, 165, 0, .065), rgba(255, 255, 255, .025));
      transform: translateY(-1px);
    }

    .radio-playlist-track-artwork {
      position: relative;
      width: 64px;
      height: 64px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, .14);
      border-radius: 10px;
      background: #090909;
    }

    .radio-playlist-track-artwork img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .radio-playlist-track-artwork span {
      position: absolute;
      left: 5px;
      bottom: 5px;
      display: inline-grid;
      place-items: center;
      min-width: 20px;
      height: 20px;
      padding: 0 5px;
      border-radius: 999px;
      color: #111;
      background: #f0a500;
      font: 900 10px/1 Karla, Arial, sans-serif;
      box-shadow: 0 2px 7px rgba(0, 0, 0, .45);
    }

    .radio-playlist-track-copy {
      min-width: 0;
    }

    .radio-playlist-track-copy strong,
    .radio-playlist-track-copy span {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .radio-playlist-track-copy strong {
      color: #fff;
      font: 800 16px/1.2 Karla, Arial, sans-serif;
    }

    .radio-playlist-track-copy span {
      margin-top: 6px;
      color: #aeb5bd;
      font: 600 13px/1.2 Karla, Arial, sans-serif;
    }

    @media (max-width: 620px) {
      .radio-playlist-detail-header {
        align-items: flex-start;
        flex-direction: column;
        padding: 14px;
      }

      .radio-playlist-playback-actions {
        width: 100%;
        justify-content: stretch;
      }

      .radio-playlist-playback-actions button {
        flex: 1 1 0;
        min-width: 0;
      }

      .radio-playlist-track {
        grid-template-columns: 56px minmax(0, 1fr);
        gap: 11px;
      }

      .radio-playlist-track-artwork {
        width: 56px;
        height: 56px;
      }
    }
  __BT__;
  document.head.appendChild(style);
})();
`);

write(APP_PATH, app);
write(ACCOUNT_PATH, account);
write(LOADER_PATH, loader);
write(UI_PATH, playlistUi);

const requiredChecks = [
  [app, "const STASHBOX_PLAYLIST_PLAY_EVENT = 'stashbox:playlist-play';", 'player event constant'],
  [app, '[playlist playback] queue started', 'player queue handler'],
  [app, "activeShuffleSourceKey.startsWith('playlist:')", 'playlist queue filter protection'],
  [account, 'function renderPlaylistDetail(playlist, target)', 'playlist detail UI'],
  [account, "startPlaylistPlayback(playPlaylistId, 'ordered')", 'playlist Play action'],
  [account, "startPlaylistPlayback(shufflePlaylistId, 'shuffle')", 'playlist Shuffle action'],
  [loader, 'account-playlist-ui.js?v=20260720-playlist1', 'playlist UI loader']
];
for (const [source, needle, label] of requiredChecks) {
  if (!source.includes(needle)) throw new Error(`Post-patch verification failed: ${label}.`);
}

write(REPORT_PATH, `# DEV Playlist Playback Status

- Patch prepared: ${new Date().toISOString()}
- Scope: \`radio/dev/\` only
- Production player changed: No
- Playlist thumbnails: Added from song artwork with Stashbox fallback
- Playlist Play: Ordered queue, starts at song 1, wraps after the final song
- Playlist Shuffle: Shuffled queue containing every playable playlist song, wraps after the final song
- Existing player reused: Yes
- Existing player stats, VEC, ads, next/previous, and media session retained: Yes
- Browser end-to-end verification: Pending
`);

console.log('DEV playlist playback patch applied successfully.');
