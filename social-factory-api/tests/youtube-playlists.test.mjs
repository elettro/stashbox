import test from 'node:test';
import assert from 'node:assert/strict';
import { addVideoToNamedPlaylists } from '../youtube-playlists.mjs';

test('adds an uploaded video to the exact named owned playlist', async () => {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    calls.push({ url, options });
    if (url.startsWith('https://www.googleapis.com/youtube/v3/playlists')) {
      return {
        ok: true,
        async json() {
          return {
            items: [{
              id: 'PL-STASHBOX-RADIO',
              snippet: { title: 'Stashbox Radio - Video Library - Stashbox' }
            }]
          };
        }
      };
    }
    if (url.startsWith('https://www.googleapis.com/youtube/v3/playlistItems')) {
      return {
        ok: true,
        async json() { return { id: 'PLI-123' }; }
      };
    }
    assert.fail(`Unexpected URL ${url}`);
  };

  const result = await addVideoToNamedPlaylists({
    fetchImpl,
    accessToken: 'token',
    videoId: 'video-123',
    playlistTitles: ['Stashbox Radio - Video Library - Stashbox']
  });

  assert.equal(result[0].status, 'added');
  assert.equal(result[0].playlist_id, 'PL-STASHBOX-RADIO');
  assert.equal(calls.length, 2);
  const inserted = JSON.parse(calls[1].options.body);
  assert.equal(inserted.snippet.resourceId.videoId, 'video-123');
});

test('reports a missing playlist without failing the completed video upload', async () => {
  const result = await addVideoToNamedPlaylists({
    fetchImpl: async () => ({ ok: true, async json() { return { items: [] }; } }),
    accessToken: 'token',
    videoId: 'video-123',
    playlistTitles: ['Missing Playlist']
  });

  assert.equal(result[0].status, 'playlist_not_found');
});
