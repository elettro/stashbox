import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOverlayFilter, escapeDrawtext, segmentVideoFilter } from '../src/ffmpeg.mjs';

test('drawtext escaping protects filter separators', () => {
  assert.equal(
    escapeDrawtext("Dean's: Song, 100%"),
    String.raw`Dean\'s\: Song\, 100\%`
  );
});

test('overlay filter contains valid drawtext syntax, intro, outro, and branding', () => {
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

  assert.match(filter, /^drawtext=fontfile=/);
  assert.doesNotMatch(filter, /drawtext:fontfile/);
  assert.match(filter, /Space Jam/);
  assert.match(filter, /Stashbox/);
  assert.match(filter, /Cosmic Vibes/);
  assert.match(filter, /STASHBOX RADIO/);
  assert.match(filter, /between\(t\\,0\.000\\,4\.000\)/);
  assert.match(filter, /between\(t\\,175\.000\\,180\.000\)/);
});

test('song identity copy is left-aligned in the lower-left third', () => {
  const filter = buildOverlayFilter({
    width: 1920,
    height: 1080,
    metadata: {
      title: 'Dub Reggae 01',
      artist: 'Stashbox',
      album: 'Stashbox Radio'
    },
    overlays: {
      intro_enabled: true,
      outro_enabled: false,
      corner_bug_enabled: false
    }
  }, 60);

  assert.equal((filter.match(/x=w\*0\.05/g) || []).length, 3);
  assert.match(filter, /text='Stashbox'.*x=w\*0\.05:y=h\*0\.67/);
  assert.match(filter, /text='Dub Reggae 01'.*x=w\*0\.05:y=h\*0\.75/);
  assert.match(filter, /text='Stashbox Radio'.*x=w\*0\.05:y=h\*0\.86/);
  assert.doesNotMatch(filter, /\(w-text_w\)\/2/);
});

test('Ken Burns filter uses subtle zoompan motion only when enabled', () => {
  const animated = segmentVideoFilter({
    width: 1920, height: 1080, fps: 30, duration: 3,
    segment: { type: 'image', motion: { enabled: true, direction: 'left-to-right', zoom_mode: 'in', max_zoom: 1.08 } }
  });
  assert.match(animated, /zoompan=/);
  assert.match(animated, /1\+0\.0800\*on\/89/);
  assert.match(animated, /iw-iw\/zoom/);
  const staticFilter = segmentVideoFilter({ width: 1920, height: 1080, fps: 30, duration: 3, segment: { type: 'image', motion: null } });
  assert.doesNotMatch(staticFilter, /zoompan=/);
});

test('overlay filter respects disabled identity blocks', () => {
  const filter = buildOverlayFilter({
    overlays: {
      intro_enabled: false,
      outro_enabled: false,
      corner_bug_enabled: true
    }
  }, 30);
  assert.equal((filter.match(/drawtext=/g) || []).length, 1);
  assert.match(filter, /STASHBOX RADIO/);
});
