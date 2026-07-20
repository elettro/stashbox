import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CLIP_PRODUCT_HOLD_MS,
  createClipCommerceState,
  normalizeCommerceProductUrls,
  resolveClipCommerceState
} from '../../radio/dev/clip-commerce.mjs';

const PRODUCT_A = 'https://stashbox.ai/products/product-a';
const PRODUCT_B = 'https://stashbox.ai/products/product-b';
const SONG_PRODUCT = 'https://stashbox.ai/products/song-product';

function transition(state, overrides = {}) {
  return resolveClipCommerceState({
    state,
    songKey: 'song-one',
    asset: { id: 'clip-one', shopify_product_urls: [] },
    songProductUrls: [],
    now: 1_000,
    ...overrides
  });
}

test('normalizes, validates, and deduplicates product URLs', () => {
  assert.deepEqual(
    normalizeCommerceProductUrls([
      PRODUCT_A,
      ` ${PRODUCT_A} `,
      'javascript:alert(1)',
      'not-a-url',
      PRODUCT_B
    ]),
    [`${PRODUCT_A}`, `${PRODUCT_B}`]
  );
});

test('a clip product overrides the current commerce source immediately', () => {
  const state = transition(createClipCommerceState('song-one'), {
    asset: { id: 'clip-a', shopify_product_urls: [PRODUCT_A] },
    songProductUrls: [SONG_PRODUCT]
  });

  assert.equal(state.productSource, 'clip');
  assert.deepEqual(state.productUrls, [PRODUCT_A]);
  assert.equal(state.lastClipId, 'clip-a');
  assert.equal(state.clipProductExpiresAt, 1_000 + CLIP_PRODUCT_HOLD_MS);
});

test('a later clip with no product keeps the previous clip product before 30 seconds', () => {
  const initial = transition(createClipCommerceState('song-one'), {
    asset: { id: 'clip-a', shopify_product_urls: [PRODUCT_A] },
    songProductUrls: [SONG_PRODUCT],
    now: 1_000
  });
  const next = transition(initial, {
    asset: { id: 'clip-b', shopify_product_urls: [] },
    songProductUrls: [SONG_PRODUCT],
    now: 20_000
  });

  assert.equal(next.productSource, 'clip');
  assert.deepEqual(next.productUrls, [PRODUCT_A]);
});

test('after 30 seconds a song product replaces the prior clip product', () => {
  const initial = transition(createClipCommerceState('song-one'), {
    asset: { id: 'clip-a', shopify_product_urls: [PRODUCT_A] },
    songProductUrls: [SONG_PRODUCT],
    now: 1_000
  });
  const next = transition(initial, {
    asset: { id: 'clip-b', shopify_product_urls: [] },
    songProductUrls: [SONG_PRODUCT],
    now: 31_000
  });

  assert.equal(next.productSource, 'song');
  assert.deepEqual(next.productUrls, [SONG_PRODUCT]);
});

test('after 30 seconds the clip product remains when the song has no products', () => {
  const initial = transition(createClipCommerceState('song-one'), {
    asset: { id: 'clip-a', shopify_product_urls: [PRODUCT_A] },
    now: 1_000
  });
  const next = transition(initial, {
    asset: { id: 'clip-b', shopify_product_urls: [] },
    now: 60_000
  });

  assert.equal(next.productSource, 'clip');
  assert.deepEqual(next.productUrls, [PRODUCT_A]);
});

test('random products are eligible only before any clip product appears and no song product exists', () => {
  const state = transition(createClipCommerceState('song-one'));

  assert.equal(state.productSource, 'random');
  assert.deepEqual(state.productUrls, []);
  assert.equal(state.clipProductSeenForSong, false);
});

test('a new clip product overrides song fallback and restarts the hold window', () => {
  const initial = transition(createClipCommerceState('song-one'), {
    asset: { id: 'clip-a', shopify_product_urls: [PRODUCT_A] },
    songProductUrls: [SONG_PRODUCT],
    now: 1_000
  });
  const songFallback = transition(initial, {
    asset: { id: 'clip-b', shopify_product_urls: [] },
    songProductUrls: [SONG_PRODUCT],
    now: 31_000
  });
  const next = transition(songFallback, {
    asset: { id: 'clip-c', shopify_product_urls: [PRODUCT_B] },
    songProductUrls: [SONG_PRODUCT],
    now: 40_000
  });

  assert.equal(next.productSource, 'clip');
  assert.deepEqual(next.productUrls, [PRODUCT_B]);
  assert.equal(next.lastClipId, 'clip-c');
  assert.equal(next.clipProductExpiresAt, 40_000 + CLIP_PRODUCT_HOLD_MS);
});

test('changing songs clears the previous song clip-product state', () => {
  const initial = transition(createClipCommerceState('song-one'), {
    asset: { id: 'clip-a', shopify_product_urls: [PRODUCT_A] },
    now: 1_000
  });
  const next = resolveClipCommerceState({
    state: initial,
    songKey: 'song-two',
    asset: { id: 'clip-z', shopify_product_urls: [] },
    songProductUrls: [SONG_PRODUCT],
    now: 2_000
  });

  assert.equal(next.activeSongKey, 'song-two');
  assert.equal(next.productSource, 'song');
  assert.deepEqual(next.productUrls, [SONG_PRODUCT]);
  assert.deepEqual(next.lastClipProductUrls, []);
  assert.equal(next.clipProductSeenForSong, false);
});
