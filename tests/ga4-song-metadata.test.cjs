// node --test tests/ga4-song-metadata.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('radio/v2-ga4-song-analytics.js', 'utf8');
function harness(catalog = {}) {
  const listeners = {}, calls = [], diagnostics = [], timers = new Map();
  let timerId = 0;
  class Audio {
    constructor(src) { this.src = this.currentSrc = src; this.duration = 90; }
    closest(selector) { return selector === '#v2App' ? {} : null; }
  }
  const document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild() {} },
    addEventListener: (type, fn) => { listeners['doc:' + type] = fn; }
  };
  const window = {
    dataLayer: [],
    StashboxV2PlayTracker: { getSongMetadata: id => catalog[id] || null },
    gtag: (kind, name, params) => { if (kind === 'event') calls.push({ name, params }); },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    dispatchEvent: event => { diagnostics.push(event); }
  };
  vm.runInNewContext(code, {
    window, document, HTMLAudioElement: Audio, Date, console,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id)
  });
  return {
    catalog, calls, diagnostics,
    audio: src => new Audio(src),
    qualify: detail => listeners['stashbox:qualified-play']({ detail }),
    end: audio => listeners['doc:ended']({ target: audio }),
    catalogReady: () => listeners['stashbox:catalog-ready'](),
    expire: () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } }
  };
}
const song = (id, title, artist) => ({ song_id: id, song_title: title, song_artist: artist });
test('Dirty Bird uses canonical artist even when event metadata disagrees', () => {
  const h = harness({ dirty: song('dirty', 'Dirty Bird', 'Stashbox') });
  const audio = h.audio('dirty.mp3');
  h.qualify({ songKey: 'dirty', sessionId: '1', songTitle: 'Next Track', songArtist: 'Wrong Artist', audio });
  h.end(audio);
  assert.deepEqual(h.calls.map(c => c.name), ['song_start', 'song_complete']);
  for (const c of h.calls) {
    assert.equal(c.params.song_title, 'Dirty Bird');
    assert.equal(c.params.song_artist, 'Stashbox');
    assert.equal(c.params.send_to, 'G-Z7QPLH8TY9');
  }
});
test('Marie-Claude (French) and The Ras Box preserve canonical names', () => {
  const h = harness({
    marie: song('marie', 'Marie-Claude (French)', 'Stashbox'),
    ras: song('ras', 'Ras Song', 'The Ras Box')
  });
  h.qualify({ songKey: 'marie', sessionId: 'm', audio: h.audio('m.mp3') });
  h.qualify({ songKey: 'ras', sessionId: 'r', audio: h.audio('r.mp3') });
  assert.deepEqual(h.calls.map(c => c.params.song_artist), ['Stashbox', 'The Ras Box']);
});
test('catalog metadata arrives after qualification without losing or duplicating play', () => {
  const h = harness(), audio = h.audio('delayed.mp3');
  const detail = { song_id: 'delayed', session_id: 's1', song_title: 'Delayed Song', audio };
  h.qualify(detail); h.qualify(detail);
  assert.equal(h.calls.length, 0);
  h.catalog.delayed = song('delayed', 'Delayed Song', 'Later Artist');
  h.catalogReady(); h.expire();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].params.song_artist, 'Later Artist');
});
test('genuinely missing artist is diagnosed after bounded wait, legitimate play retained', () => {
  const h = harness({ blank: song('blank', 'No Artist Yet', '') });
  h.qualify({ songKey: 'blank', sessionId: 's2', audio: h.audio('blank.mp3') });
  assert.equal(h.calls.length, 0);
  h.expire();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].params.song_artist, '');
  assert.equal(h.diagnostics[0].type, 'stashbox:ga4-metadata-missing');
});
test('rapid switch and automatic transition count original starts and only correct completion', () => {
  const h = harness({ a: song('a', 'First', 'Stashbox'), b: song('b', 'Second', 'The Ras Box') });
  const audio = h.audio('a.mp3');
  h.qualify({ songKey: 'a', sessionId: 's1', audio });
  audio.src = audio.currentSrc = 'b.mp3';
  h.qualify({ songKey: 'b', sessionId: 's2', audio });
  h.qualify({ songKey: 'b', sessionId: 's2', audio });
  h.end(audio); h.end(audio);
  assert.deepEqual(h.calls.map(c => c.name), ['song_start', 'song_start', 'song_complete']);
  assert.equal(h.calls[2].params.song_artist, 'The Ras Box');
});
test('completion before late metadata sends start first, then completion with same artist', () => {
  const h = harness(), audio = h.audio('wait.mp3');
  h.qualify({ songKey: 'wait', sessionId: 's3', songTitle: 'Wait', audio });
  h.end(audio);
  h.catalog.wait = song('wait', 'Wait', 'Stashbox');
  h.catalogReady();
  assert.deepEqual(h.calls.map(c => c.name), ['song_start', 'song_complete']);
  assert.equal(h.calls[0].params.song_artist, h.calls[1].params.song_artist);
});
test('repeat playback of same song uses a new session and sends another qualified start', () => {
  const h = harness({ a: song('a', 'First', 'Stashbox') });
  const audio = h.audio('a.mp3');
  h.qualify({ songKey: 'a', sessionId: 'first', audio }); h.end(audio);
  h.qualify({ songKey: 'a', sessionId: 'second', audio }); h.end(audio);
  assert.deepEqual(h.calls.map(c => c.name), ['song_start', 'song_complete', 'song_start', 'song_complete']);
});
test('qualification threshold stays 10 seconds in player', () => {
  const player = fs.readFileSync('radio/v2-play-tracker.js', 'utf8');
  assert.match(player, /const QUALIFY_SECONDS = 10;/);
  assert.match(player, /state\.listenedSeconds >= QUALIFY_SECONDS/);
});
