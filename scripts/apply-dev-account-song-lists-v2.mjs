import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const APP_PATH = path.join(ROOT, 'radio/dev/app.js');
const LOADER_PATH = path.join(ROOT, 'radio/dev/notifications.js');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

function replaceExact(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one anchor, found ${count}.`);
  return source.replace(before, after);
}

let app = read(APP_PATH);
let loader = read(LOADER_PATH);

if (!app.includes("const STASHBOX_ACCOUNT_SONG_PLAY_EVENT = 'stashbox:account-song-play';")) {
  app = replaceExact(
    app,
    "const STASHBOX_PLAYLIST_PLAY_EVENT = 'stashbox:playlist-play';\n",
    "const STASHBOX_PLAYLIST_PLAY_EVENT = 'stashbox:playlist-play';\nconst STASHBOX_ACCOUNT_SONG_PLAY_EVENT = 'stashbox:account-song-play';\n",
    'account song play event constant'
  );
}

if (!app.includes('[account song playback] started')) {
  const accountSongEffect = `
  useEffect(() => {
    const handleAccountSongPlay = event => {
      const detail = event?.detail || {};
      const requestedKeys = [
        detail.song_key,
        detail.songKey,
        detail.song_id,
        detail.songId,
        detail.id
      ].map(value => clean(value).toLowerCase()).filter(Boolean);
      const requestedTitle = clean(detail.display_title || detail.title || detail.song_name).toLowerCase();
      const requestedArtist = clean(detail.artist || detail.artist_name).toLowerCase();

      const track = tracks.find(candidate => {
        const candidateKeys = [
          candidate?.songKey,
          candidate?.song_key,
          candidate?.id,
          candidate?.idx,
          candidate?.raw?.song_key,
          candidate?.raw?.song_id,
          candidate?.raw?.id
        ].map(value => clean(value).toLowerCase()).filter(Boolean);
        if (requestedKeys.some(key => candidateKeys.includes(key))) return true;
        const titleMatches = requestedTitle && getSongTitle(candidate).toLowerCase() === requestedTitle;
        const artistMatches = !requestedArtist || getSongArtist(candidate).toLowerCase() === requestedArtist;
        return titleMatches && artistMatches;
      });

      if (!track || !canPlayTrack(track)) {
        setPlayerMessage('That saved song is not currently available for playback.');
        return;
      }

      finishPlayback('play_partial');
      setCurrentAd(null);
      setIsAdPlaying(false);
      pendingAdNextSongRef.current = null;
      setActiveShuffleQueue([]);
      setActiveShuffleIndex(0);
      setActiveShuffleSourceKey('');
      setIsShuffleQueueActive(false);
      setShuffleNotice('');
      setPlayerMessage('Playing "' + getSongTitle(track) + '" from ' + (detail.source === 'history' ? 'Listening History' : 'Favorites') + '.');
      console.log('[account song playback] started', {
        source: detail.source || 'account',
        song_key: track.songKey || track.song_key,
        title: getSongTitle(track)
      });
      selectTrack(track, {
        autoStart: true,
        preferVideo: isVideoOnlyTrack(track) || !track.hasAudio,
        startSource: detail.source === 'history' ? 'account_history' : 'account_favorite'
      });
    };

    window.addEventListener(STASHBOX_ACCOUNT_SONG_PLAY_EVENT, handleAccountSongPlay);
    return () => window.removeEventListener(STASHBOX_ACCOUNT_SONG_PLAY_EVENT, handleAccountSongPlay);
  }, [tracks, finishPlayback]);

`;
  app = replaceExact(
    app,
    "  function resolveAdjacentPlayableSong(direction, song = selectedSong, { allowWrap = true } = {}) {",
    `${accountSongEffect}  function resolveAdjacentPlayableSong(direction, song = selectedSong, { allowWrap = true } = {}) {`,
    'account song playback listener insertion'
  );
}

if (!loader.includes('account-song-lists.js')) {
  loader = replaceExact(
    loader,
    "    .then(() => loadScript('./account-playlist-ui.js?v=20260720-playlist1'))\n",
    "    .then(() => loadScript('./account-playlist-ui.js?v=20260720-playlist1'))\n    .then(() => loadScript('./account-song-lists.js?v=20260720-songlists2'))\n",
    'load favorite and history song enhancer'
  );
} else {
  loader = loader.replace(/account-song-lists\.js\?v=[^'\"]+/, 'account-song-lists.js?v=20260720-songlists2');
}

write(APP_PATH, app);
write(LOADER_PATH, loader);

const checks = [
  [app, "const STASHBOX_ACCOUNT_SONG_PLAY_EVENT = 'stashbox:account-song-play';", 'account song event constant'],
  [app, '[account song playback] started', 'React player account song handler'],
  [loader, 'account-song-lists.js?v=20260720-songlists2', 'account song list loader']
];
for (const [source, needle, label] of checks) {
  if (!source.includes(needle)) throw new Error(`Post-patch verification failed: ${label}.`);
}

console.log('Corrected DEV Favorites and Listening History playback patch applied successfully.');
