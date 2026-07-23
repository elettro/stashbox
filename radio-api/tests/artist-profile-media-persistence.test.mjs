import assert from 'node:assert/strict';
import test from 'node:test';
import {
  handleArtistProfileMediaRequest,
  isArtistProfileMediaRequest
} from '../artist-profile-media-routes.mjs';

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  };
}

function bodyOf(result) {
  return JSON.parse(result.body || '{}');
}

test('artist vertical banner survives a save followed by a fresh read', async () => {
  const artist = {
    id: 'artist-1',
    artist_key: 'stashbox',
    slug: 'stashbox',
    name: 'Stashbox',
    profile_image_url: 'https://media.example/profile.jpg',
    banner_image_url: 'https://media.example/horizontal.jpg',
    vertical_banner_image_url: '',
    status: 'published',
    updated_at: '2026-07-23T12:00:00.000Z'
  };

  const client = {
    async query(sql, values = []) {
      const normalized = String(sql).replace(/\s+/g, ' ').trim().toLowerCase();
      if (normalized.startsWith('alter table')) return { rowCount: 0, rows: [] };
      if (normalized.includes('select * from') && normalized.includes('artists')) {
        return { rowCount: 1, rows: [{ ...artist }] };
      }
      if (normalized.includes('update') && normalized.includes('set vertical_banner_image_url')) {
        artist.vertical_banner_image_url = values[0] || '';
        artist.updated_at = '2026-07-23T12:01:00.000Z';
        return { rowCount: 1, rows: [{ ...artist }] };
      }
      throw new Error(`Unexpected SQL in artist media test: ${sql}`);
    }
  };

  const deps = {
    client,
    qname: table => `"radio_dev"."${table}"`,
    response,
    parseBody: event => event.body || {},
    getMethod: event => event.method,
    getRouteSegments: event => event.segments,
    getHeader: (event, name) => event.headers?.[String(name).toLowerCase()] || '',
    requireAdmin: async () => {},
    verifyIdentity: async () => null
  };

  const segments = ['radio', 'admin', 'artists', 'stashbox', 'media'];
  assert.equal(isArtistProfileMediaRequest(segments), true);

  const verticalUrl = 'https://stashbox-radio-media-dev-us-east-1.s3.us-east-1.amazonaws.com/artist-profiles/stashbox/vertical-banner.jpg';
  const saved = await handleArtistProfileMediaRequest({
    method: 'PATCH',
    segments,
    headers: { 'x-admin-token': 'test-admin-token' },
    body: { vertical_banner_image_url: verticalUrl }
  }, deps);

  assert.equal(saved.statusCode, 200);
  assert.equal(bodyOf(saved).persisted, true);
  assert.equal(bodyOf(saved).media.vertical_banner_image_url, verticalUrl);

  const reopened = await handleArtistProfileMediaRequest({
    method: 'GET',
    segments,
    headers: { 'x-admin-token': 'test-admin-token' }
  }, deps);

  assert.equal(reopened.statusCode, 200);
  assert.equal(bodyOf(reopened).media.vertical_banner_image_url, verticalUrl);
  assert.equal(artist.vertical_banner_image_url, verticalUrl);
});
