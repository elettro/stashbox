import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOverlayFilter, escapeDrawtext } from '../src/ffmpeg.mjs';

test('drawtext escaping protects filter separators', () => {
  assert.equal(escapeDrawtext("Dean's: Song, 100%"), "Dean\\'s\\: Song\\, 100\\%");
});

test('overlay filter contains intro, outro, and persistent Stashbox branding', () => {
  const filter = buildOverlayFilter({
    width: 1920,
    height: 1080,
    song_title: 'Space Jam',
    artist: 'Stashbox',
    album_name: 'Cosmic Vibes',
    overlays: {
      intro_enabled: true,
      outro_enabled: true,
      corner_bug_enabled: true,
      intro_duration_seconds: 4,
      outro_duration_seconds: 5,
      include_song: true,
      include_artist: true,
      include_album: true
    },
    metadata: {
      title: 'Space Jam',
      artist: 'Stashbox',
      album: 'Cosmic Vibes'
    }
  }, 180);

  assert.match(filter, /Space Jam/);
  assert.match(filter, /Stashbox/);
  assert.match(filter, /Cosmic Vibes/);
  assert.match(filter, /STASHBOX RADIO/);
  assert.match(filter, /between\(t\\,0\.000\\,4\.000\)/);
  assert.match(filter, /between\(t\\,175\.000\\,180\.000\)/);
});

test('overlay filter respects disabled identity blocks', () => {
  const filter = buildOverlayFilter({
    overlays: {
      intro_enabled: false,
      outro_enabled: false,
      corner_bug_enabled: true
    }
  }, 30);
  assert.equal((filter.match(/drawtext/g) || []).length, 1);
  assert.match(filter, /STASHBOX RADIO/);
});
