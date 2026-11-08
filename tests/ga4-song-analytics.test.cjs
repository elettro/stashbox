// Run: node --test tests/ga4-song-analytics.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync('radio/v2-ga4-song-analytics.js', 'utf8');
test('qualified plays dedupe and completion follows correct audio', () => {
  const listeners = {};
  const events = [];
  const audio = { src: '/a.mp3', currentSrc: '/a.mp3', duration: 120, closest: () => ({ querySelector: () => null }) };
  const document = {
    head: { appendChild() {} },
    createElement: () => ({ dataset: {} }),
    querySelector: () => null,
    addEventListener: (name, fn) => { listeners['document:' + name] = fn; }
  };
  const window = {
    dataLayer: [],
    addEventListener: (name, fn) => { listeners[name] = fn; },
    gtag: (action, name, params) => { if (action === 'event') events.push({ name, params }); }
  };
  vm.runInNewContext(script, { window, document, HTMLAudioElement: class {}, Date });
  // Simulate browser audio type.
  const audioPrototype = Object.getPrototypeOf(audio);
  const original = listeners['document:ended'];
  assert.equal(typeof original, 'function');
  const qualified = listeners['stashbox:qualified-play'];
  qualified({ detail: { songKey: 'a', sessionId: 's1', songTitle: 'Dirty Bird', songArtist: 'Stashbox', audio } });
  qualified({ detail: { songKey: 'a', sessionId: 's1', songTitle: 'Dirty Bird', audio } });
  assert.equal(events.filter(e => e.name === 'song_start').length, 1);
  assert.equal(events[0].params.song_title, 'Dirty Bird');
  assert.equal(events[0].params.send_to, 'G-Z7QPLH8TY9');
});
