import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const mainSource = read('radio/dev/v2/v2-responsive-song-artwork.js');
const mainCss = read('radio/dev/v2/v2-responsive-song-artwork.css');
const artistSource = read('radio/dev/v2/artist/artist-responsive-song-artwork.js');
const mainHtml = read('radio/dev/v2/index.html');
const artistHtml = read('radio/dev/v2/artist/index.html');

test('main V2 player reads prepared artwork from the persistent public recipe', () => {
  assert.match(mainSource, /const RECIPE_URL = `\$\{API\}\/radio\/vec\/recipe`/);
  assert.match(mainSource, /recipe\?\.prepared_artwork_images/);
  assert.doesNotMatch(mainSource, /\/radio\/songs\/\$\{encodeURIComponent\(songKey\)\}\/artwork-images/);
});

test('main V2 selector covers the shared guest and logged-in player surface', () => {
  assert.match(mainSource, /document\.querySelectorAll\('\[data-player\]'\)/);
  assert.match(mainSource, /querySelector\('\[data-backdrop\]'\)/);
  assert.match(mainSource, /querySelector\('\[data-mobile-vec-stage\]'\)/);
  assert.match(mainSource, /stashbox:vec-asset-change/);
});

test('responsive ratio rules use mobile portrait, landscape and ultrawide surfaces', () => {
  for (const source of [mainSource, artistSource]) {
    assert.match(source, /width <= 820 && height >= width \* 1\.15/);
    assert.match(source, /width >= 1440 && aspect >= 1\.9/);
    assert.match(source, /return '9x16'/);
    assert.match(source, /return '21x9'/);
    assert.match(source, /return '16x9'/);
  }
  assert.match(mainSource, /\['9x16', '1x1'\]/);
  assert.match(mainSource, /\['21x9', '16x9', '1x1'\]/);
  assert.match(mainSource, /\['16x9', '1x1'\]/);
  assert.match(artistSource, /\['9x16', '4x5', '3x4', '1x1'\]/);
});

test('main player presents prepared artwork as one layer instead of square over square', () => {
  assert.match(mainSource, /function applySingleArtworkLayer/);
  assert.match(mainSource, /clearBackground\(backdrop\)/);
  assert.match(mainSource, /clearBackground\(stage\)/);
  assert.match(mainSource, /image\.dataset\.responsiveOfficialArtwork = 'true'/);
  assert.match(mainSource, /stage\.dataset\.singleResponsiveArtwork = 'true'/);
  assert.match(mainSource, /player\.classList\.toggle\('has-exact-responsive-artwork'/);
});

test('main player preloads the selected ratio and never exposes temporary square surfaces', () => {
  assert.match(mainSource, /const imagePreloadCache = new Map\(\)/);
  assert.match(mainSource, /function preloadImage/);
  assert.match(mainSource, /await preloadImage\(selected\.url\)/);
  assert.match(mainSource, /document\.addEventListener\('pointerdown'/);
  assert.match(mainSource, /prefetchSongArtwork\(songElement\.dataset\.song\)/);
  assert.match(mainSource, /responsive-artwork-surface-ready/);
  assert.match(mainCss, /\[data-backdrop\]:not\(\.responsive-artwork-surface-ready\)/);
  assert.match(mainCss, /\[data-mobile-vec-stage\]:not\(\.responsive-artwork-surface-ready\)/);
  assert.match(mainCss, /opacity: 0 !important/);
});

test('artist player changes only official song artwork and leaves VEC media alone', () => {
  assert.match(artistSource, /\.artist-realm-player:not\(\[hidden\]\)/);
  assert.match(artistSource, /officialUrlSet/);
  assert.match(artistSource, /img\.artist-realm-media\.is-active/);
  assert.match(artistSource, /if \(!officialUrls\.has\(currentUrl\)/);
  assert.match(artistSource, /image\.dataset\.responsiveArtworkRatio/);
});

test('both player entry pages load cache-busted responsive artwork resources', () => {
  assert.match(mainHtml, /v2-responsive-song-artwork\.css\?v=20260729-no-flash1/);
  assert.match(mainHtml, /v2-responsive-song-artwork\.js\?v=20260729-no-flash4/);
  assert.match(artistHtml, /artist-responsive-song-artwork\.js\?v=20260729-prepared-artwork1/);
  assert.ok(artistHtml.indexOf('artist-realm-player.js') < artistHtml.indexOf('artist-responsive-song-artwork.js'));
});