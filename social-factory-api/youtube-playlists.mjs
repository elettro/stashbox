const YOUTUBE_PLAYLISTS_URL = 'https://www.googleapis.com/youtube/v3/playlists';
const YOUTUBE_PLAYLIST_ITEMS_URL = 'https://www.googleapis.com/youtube/v3/playlistItems';

function uniqueTitles(value) {
  const items = Array.isArray(value) ? value : [];
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const title = String(item || '').trim().slice(0, 150);
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    result.push(title);
    if (result.length >= 10) break;
  }
  return result;
}

async function readPayload(response) {
  return response.json().catch(() => ({}));
}

async function listOwnedPlaylists({ fetchImpl, accessToken }) {
  const playlists = [];
  let pageToken = '';

  do {
    const url = new URL(YOUTUBE_PLAYLISTS_URL);
    url.searchParams.set('part', 'id,snippet');
    url.searchParams.set('mine', 'true');
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      throw new Error(payload?.error?.message || 'youtube_playlist_list_failed');
    }

    for (const item of payload.items || []) {
      const id = String(item?.id || '').trim();
      const title = String(item?.snippet?.title || '').trim();
      if (id && title) playlists.push({ id, title });
    }
    pageToken = String(payload.nextPageToken || '');
  } while (pageToken && playlists.length < 500);

  return playlists;
}

async function insertPlaylistItem({ fetchImpl, accessToken, playlistId, videoId }) {
  const url = new URL(YOUTUBE_PLAYLIST_ITEMS_URL);
  url.searchParams.set('part', 'snippet');
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    body: JSON.stringify({
      snippet: {
        playlistId,
        resourceId: {
          kind: 'youtube#video',
          videoId
        }
      }
    })
  });
  const payload = await readPayload(response);
  if (response.ok) {
    return { status: 'added', playlist_item_id: String(payload.id || '') };
  }

  const reason = String(payload?.error?.errors?.[0]?.reason || '');
  if (reason === 'videoAlreadyInPlaylist') {
    return { status: 'already_present', playlist_item_id: '' };
  }
  throw new Error(payload?.error?.message || reason || 'youtube_playlist_insert_failed');
}

export async function addVideoToNamedPlaylists({
  fetchImpl = globalThis.fetch,
  accessToken,
  videoId,
  playlistTitles = []
} = {}) {
  const titles = uniqueTitles(playlistTitles);
  if (!titles.length) return [];
  if (!fetchImpl || !accessToken || !videoId) {
    return titles.map(title => ({ title, status: 'failed', error: 'youtube_playlist_context_missing' }));
  }

  let playlists;
  try {
    playlists = await listOwnedPlaylists({ fetchImpl, accessToken });
  } catch (error) {
    return titles.map(title => ({
      title,
      status: 'failed',
      error: String(error?.message || error || 'youtube_playlist_list_failed').slice(0, 500)
    }));
  }

  const byTitle = new Map(playlists.map(item => [item.title.toLowerCase(), item]));
  const results = [];
  for (const title of titles) {
    const playlist = byTitle.get(title.toLowerCase());
    if (!playlist) {
      results.push({ title, status: 'playlist_not_found', playlist_id: '' });
      continue;
    }
    try {
      const inserted = await insertPlaylistItem({
        fetchImpl,
        accessToken,
        playlistId: playlist.id,
        videoId
      });
      results.push({ title, playlist_id: playlist.id, ...inserted });
    } catch (error) {
      results.push({
        title,
        playlist_id: playlist.id,
        status: 'failed',
        error: String(error?.message || error || 'youtube_playlist_insert_failed').slice(0, 500)
      });
    }
  }
  return results;
}
