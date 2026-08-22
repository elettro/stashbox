(() => {
  'use strict';

  const app = document.getElementById('artistApp');
  if (!app) return;

  const API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
  const SONGS_URL = `${API}/radio/songs`;
  const RECIPE_URL = `${API}/radio/vec/recipe`;
  const params = new URLSearchParams(location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';
  const CACHE_TTL_MS = 15 * 60 * 1000;
  const RECENT_LIMIT = 6;
  const FRESH_WINDOW = 12;
  const CONCURRENCY = 6;

  let feedPromise = null;
  let artistKey = identifier;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase().replace(/\s+/g, ' ');
  const number = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
  const dateStamp = value => {
    const stamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(stamp) ? stamp : 0;
  };
  const songAudio = song => clean(song?.audio_url || song?.audioUrl || song?.mp3_url || song?.stream_url || song?.audio_file_url || song?.file_url);
  const songDate = song => Math.max(
    dateStamp(song?.updated_at),
    dateStamp(song?.created_at),
    dateStamp(song?.release_date)
  );
  const songPlays = song => number(song?.total_plays ?? song?.plays ?? song?.play_count);

  function unwrap(data) {
    if (typeof data?.body === 'string') {
      try { return unwrap(JSON.parse(data.body)); }
      catch (_) { return data; }
    }
    return data;
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

  function rows(data, names) {
    data = unwrap(data);
    if (Array.isArray(data)) return data;
    for (const name of names) if (Array.isArray(data?.[name])) return data[name];
    return [];
  }

  function artistSongs(allSongs, artist) {
    const targetName = normalize(artist?.name);
    const targetKey = normalize(artist?.artist_key || artist?.slug || identifier);
    return (Array.isArray(allSongs) ? allSongs : []).filter(song => {
      const name = normalize(song.artist || song.artist_name);
      const key = normalize(song.artist_key || song.primary_artist_key || song.artist_slug);
      return clean(song.song_key) && songAudio(song) && (name === targetName || (targetKey && key === targetKey));
    });
  }

  function cacheKey() {
    return `stashbox_artist_vec_feed:${normalize(artistKey || identifier)}`;
  }

  function recentKey() {
    return `stashbox_artist_vec_feed_recent:${normalize(artistKey || identifier)}`;
  }

  function readCache(songKeys) {
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey()) || 'null');
      if (!cached || Date.now() - Number(cached.savedAt || 0) > CACHE_TTL_MS) return null;
      const expected = [...songKeys].sort().join('|');
      const actual = [...(cached.songKeys || [])].sort().join('|');
      return expected === actual && Array.isArray(cached.feed) ? cached.feed : null;
    } catch (_) {
      return null;
    }
  }

  function saveCache(songs, feed) {
    try {
      sessionStorage.setItem(cacheKey(), JSON.stringify({
        savedAt: Date.now(),
        songKeys: songs.map(song => song.song_key),
        feed: feed.map(item => ({ songKey: item.song.song_key, vecStamp: item.vecStamp }))
      }));
    } catch (_) {}
  }

  function inflateCached(cached, songs) {
    const byKey = new Map(songs.map(song => [song.song_key, song]));
    return cached.map(item => ({ song: byKey.get(item.songKey), vecStamp: number(item.vecStamp) })).filter(item => item.song);
  }

  function recipeTimestamp(body) {
    body = unwrap(body) || {};
    const recipe = body.recipe && typeof body.recipe === 'object' ? body.recipe : {};
    return Math.max(
      dateStamp(body.updated_at),
      dateStamp(body.updatedAt),
      dateStamp(body.saved_at),
      dateStamp(body.savedAt),
      dateStamp(recipe.updated_at),
      dateStamp(recipe.updatedAt),
      dateStamp(recipe.saved_at),
      dateStamp(recipe.savedAt)
    );
  }

  async function mapWithConcurrency(items, worker, concurrency = CONCURRENCY) {
    const results = new Array(items.length);
    let cursor = 0;
    async function run() {
      while (cursor < items.length) {
        const index = cursor++;
        try { results[index] = await worker(items[index], index); }
        catch (_) { results[index] = null; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
    return results;
  }

  async function buildFeed() {
    const [artistBody, songsBody] = await Promise.all([
      json(`${API}/radio/artists/${encodeURIComponent(identifier)}`),
      json(SONGS_URL)
    ]);
    const artist = artistBody.artist || {};
    artistKey = artist.artist_key || artist.slug || identifier;
    const songs = artistSongs(rows(songsBody, ['songs', 'items', 'data']), artist);
    if (!songs.length) return [];

    const cached = readCache(songs.map(song => song.song_key));
    if (cached) return inflateCached(cached, songs);

    const feed = (await mapWithConcurrency(songs, async song => {
      let vecStamp = 0;
      try {
        const body = await json(`${RECIPE_URL}?song_key=${encodeURIComponent(song.song_key)}`);
        vecStamp = recipeTimestamp(body);
      } catch (_) {}
      return { song, vecStamp };
    })).filter(Boolean);

    feed.sort((a, b) =>
      b.vecStamp - a.vecStamp ||
      songDate(b.song) - songDate(a.song) ||
      songPlays(b.song) - songPlays(a.song) ||
      clean(a.song.song_key).localeCompare(clean(b.song.song_key))
    );
    saveCache(songs, feed);
    return feed;
  }

  function getFeed() {
    if (!feedPromise) feedPromise = buildFeed().catch(error => {
      feedPromise = null;
      throw error;
    });
    return feedPromise;
  }

  function readRecent() {
    try {
      const value = JSON.parse(localStorage.getItem(recentKey()) || '[]');
      return Array.isArray(value) ? value.map(clean).filter(Boolean).slice(0, RECENT_LIMIT) : [];
    } catch (_) {
      return [];
    }
  }

  function remember(songKey) {
    try {
      const next = [songKey, ...readRecent().filter(key => key !== songKey)].slice(0, RECENT_LIMIT);
      localStorage.setItem(recentKey(), JSON.stringify(next));
    } catch (_) {}
  }

  function selectFresh(feed) {
    if (!feed.length) return null;
    const recent = new Set(readRecent());
    const fresh = feed.slice(0, Math.min(FRESH_WINDOW, feed.length));
    const selected = fresh.find(item => !recent.has(item.song.song_key)) || fresh[0] || feed[0];
    remember(selected.song.song_key);
    return selected.song;
  }

  function launchThroughRealm(song) {
    if (!song?.song_key) return false;
    const proxy = document.createElement('button');
    proxy.type = 'button';
    proxy.hidden = true;
    proxy.dataset.playSong = song.song_key;
    proxy.setAttribute('aria-hidden', 'true');
    app.appendChild(proxy);
    proxy.click();
    proxy.remove();
    return true;
  }

  async function intercept(event) {
    const trigger = event.target.closest('#artistApp [data-artist-realm-launch], #artistApp [data-start-radio]');
    if (!trigger) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const original = trigger.innerHTML;
    trigger.disabled = true;
    trigger.setAttribute('aria-busy', 'true');
    const label = trigger.querySelector('span');
    if (label) label.textContent = 'Building Fresh Feed…';
    else trigger.textContent = 'Building Fresh Feed…';

    try {
      const feed = await getFeed();
      const selected = selectFresh(feed);
      if (!launchThroughRealm(selected)) throw new Error('No playable artist songs were found.');
    } catch (error) {
      console.error('[Artist Dynamic VEC Feed]', error);
      trigger.title = error.message || 'The fresh artist feed could not be built.';
    } finally {
      trigger.innerHTML = original;
      trigger.disabled = false;
      trigger.removeAttribute('aria-busy');
    }
  }

  document.addEventListener('click', intercept, true);

  const warm = () => getFeed().catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 3000 });
  else window.setTimeout(warm, 1400);
})();