// node --test tests/ga4-song-metadata.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('radio/v2-ga4-song-analytics.js', 'utf8');
function harness() {
  const listeners = {};
  const calls = [];
  class Audio { constructor(src) { this.src = src; this.currentSrc = src; this.duration = 90; } closest(selector) { return selector === '#v2App' ? {} : null; } }
  const document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { appendChild: () => {} },
    addEventListener: (type, callback) => { listeners['document:' + type] = callback; }
  };
  const window = {
    dataLayer: [],
    gtag: (kind, name, params) => { if (kind === 'event') calls.push({ name, params }); },
    addEventListener: (type, callback) => { listeners[type] = callback; },
    dispatchEvent: () => {}
  };
  vm.runInNewContext(code, { window, document, HTMLAudioElement: Audio, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } }, Date, Number, String, console });
  return {
    calls,
    audio: src => new Audio(src),
    qualify: (detail) => listeners['stashbox:qualified-play']({ detail }),
    end: audio => listeners['document:ended']({ target: audio })
  };
}
test('canonical artist and title beat changed player UI and completion keeps attribution', () => {
  const h = harness(), audio = h.audio('one.mp3');
  audio.closest = selector => selector === '[data-player]' ? { querySelector: key => ({ textContent: key === '[data-ptitle]' ? 'Wrong Next Song' : 'Wrong Artist' }) } : {};
  h.qualify({ songKey: 'one', sessionId: 's1', songTitle: 'Dirty Bird', songArtist: 'The Ras Box', audio });
  h.end(audio);
  assert.deepEqual(h.calls.map(e => e.name), ['song_start', 'song_complete']);
  for (const call of h.calls) { assert.equal(call.params.song_title, 'Dirty Bird'); assert.equal(call.params.song_artist, 'The Ras Box'); }
  assert.equal(h.calls[0].params.send_to, 'G-Z7QPLH8TY9');
});
test('missing artist never gets fabricated, and qualified play remains counted', () => {
  const h = harness(), audio = h.audio('two.mp3');
  h.qualify({ song_id: 'two', session_id: 's2', song_title: 'Unknown Artist Song', song_artist: '', audio });
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].params.song_artist, '');
});
test('deduplicates starts even after natural completion', () => {
  const h = harness(), audio = h.audio('one.mp3');
  const detail = { songKey: 'one', sessionId: 's1', songTitle: 'Song A', songArtist: 'Artist A', audio };
  h.qualify(detail); h.qualify(detail); h.end(audio); h.end(audio); h.qualify(detail);
  assert.deepEqual(h.calls.map(e => e.name), ['song_start', 'song_complete']);
});
test('rapid transitions do not count an old song completion for reused audio', () => {
  const h = harness(), audio = h.audio('one.mp3');
  h.qualify({ songKey: 'one', sessionId: 's1', songTitle: 'Song A', songArtist: 'Artist A', audio });
  audio.src = 'two.mp3'; audio.currentSrc = 'two.mp3';
  h.qualify({ songKey: 'two', sessionId: 's2', songTitle: 'Song B', songArtist: 'Artist B', audio });
  h.end(audio);
  assert.deepEqual(h.calls.map(e => e.name), ['song_start', 'song_start', 'song_complete']);
  assert.equal(h.calls[2].params.song_artist, 'Artist B');
});
test('event payload supplies asynchronous catalog resolution without UI dependency', () => {
  const h = harness(), audio = h.audio('three.mp3');
  const data = { songKey: 'three', sessionId: 's3', songTitle: 'Song C', audio };
  data.songArtist = 'Artist C';
  h.qualify(data);
  assert.equal(h.calls[0].params.song_artist, 'Artist C');
});
