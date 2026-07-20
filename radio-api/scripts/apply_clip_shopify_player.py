from pathlib import Path
import re

ROOT = Path('.')


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, content):
    (ROOT / path).write_text(content, encoding='utf-8')
    print(f'updated {path}')


def replace_once(source, old, new, label):
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 match, found {count}')
    return source.replace(old, new, 1)


def regex_once(source, pattern, replacement, label, flags=0):
    updated, count = re.subn(pattern, replacement, source, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly 1 regex match, found {count}')
    return updated


player_path = 'radio/dev/app.js'
player = read(player_path)

if "from './clip-commerce.mjs'" not in player:
    player = replace_once(
        player,
        "import { flushSync } from 'https://esm.sh/react-dom@18.3.1';\n",
        "import { flushSync } from 'https://esm.sh/react-dom@18.3.1';\nimport { createClipCommerceState, normalizeCommerceProductUrls, resolveClipCommerceState } from './clip-commerce.mjs';\n",
        'import clip commerce controller',
    )

if 'const shopifyProductUrls = normalizeCommerceProductUrls' not in player:
    player = replace_once(
        player,
        "  const status = clean(asset.status).toLowerCase();\n  if (['hidden', 'deleted', 'archived', 'inactive'].includes(status) || bool(asset.hidden) || bool(asset.deleted)) return null;\n  if (!url) return null;\n  return {",
        "  const status = clean(asset.status).toLowerCase();\n  if (['hidden', 'deleted', 'archived', 'inactive'].includes(status) || bool(asset.hidden) || bool(asset.deleted)) return null;\n  if (!url) return null;\n  const shopifyProductUrls = normalizeCommerceProductUrls(asset.shopify_product_urls ?? asset.shopifyProductUrls ?? asset.shopify_product_url ?? asset.shopifyProductUrl ?? []);\n  return {",
        'normalize player clip Shopify URLs',
    )
    player = replace_once(
        player,
        "    folderId: clean(asset.folder_id || asset.folderId || asset.source_folder_id || asset.sourceFolderId || asset.source),\n    folderName: clean(asset.folder_name || asset.folderName || asset.source_folder_name || asset.sourceFolderName || asset.source)\n  };",
        "    folderId: clean(asset.folder_id || asset.folderId || asset.source_folder_id || asset.sourceFolderId || asset.source),\n    folderName: clean(asset.folder_name || asset.folderName || asset.source_folder_name || asset.sourceFolderName || asset.source),\n    shopifyProductUrls,\n    shopify_product_urls: shopifyProductUrls\n  };",
        'attach clip Shopify URLs to normalized VEC assets',
    )

if 'const productJsonUrl = `${productOrigin}/products/' not in player:
    fetch_specific = r'''async function fetchSpecificProduct(url, index, handle) {
  let productOrigin = 'https://stashbox.ai';
  try { productOrigin = new URL(clean(url)).origin || productOrigin; } catch (_) {}
  const cacheKey = `${productOrigin.toLowerCase()}|${productHandleKey(handle)}`;
  if (!productHandleKey(handle)) return null;
  if (!specificProductCache.has(cacheKey)) {
    const productJsonUrl = `${productOrigin}/products/${encodeURIComponent(handle)}.js`;
    specificProductCache.set(cacheKey, fetch(productJsonUrl).then(async res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const productJson = await res.json();
      console.log('Specific product resolved from Shopify .js:', productJson);
      const rawImage = productJson.featured_image || productJson.images?.[0];
      const image = normalizeShopifyImage(rawImage);
      const price = formatShopifyPrice(productJson.price, { cents: true });
      return {
        id: productJson.id || handle,
        handle: clean(productJson.handle) || handle,
        title: clean(productJson.title) || 'Stashbox Product',
        url: clean(url),
        image,
        price,
        specific: true,
        unresolved: false
      };
    }).catch(error => {
      specificProductCache.delete(cacheKey);
      throw error;
    }));
  }
  const product = await specificProductCache.get(cacheKey);
  console.log('Specific product resolved from Shopify .js:', product || null);
  return product ? { ...product, id: `specific-${index}-${product.id || handle || clean(url)}`, url: clean(url) || product.url, specific: true } : null;
}'''
    player = regex_once(
        player,
        r'async function fetchSpecificProduct\(url, index, handle\) \{.*?\n\}\n\nasync function fetchFallbackProducts',
        fetch_specific + '\n\nasync function fetchFallbackProducts',
        'replace specific Shopify product loader',
        re.S,
    )

if 'function useProducts(selected, commerceState = null)' not in player:
    use_products = r'''function useProducts(selected, commerceState = null) {
  const [products, setProducts] = useState([]);
  const productSource = clean(commerceState?.productSource || 'song') || 'song';
  const requestedProductUrls = normalizeCommerceProductUrls(
    commerceState && Array.isArray(commerceState.productUrls)
      ? commerceState.productUrls
      : selected?.specificProductUrls || []
  );
  const productRequestKey = `${selected?.idx || ''}|${productSource}|${requestedProductUrls.join('|')}`;
  useEffect(() => {
    let alive = true;
    setProducts([]);
    async function loadProducts() {
      if (!selected) return [];
      let fallback = [];
      try {
        fallback = rotateBySeed(await fetchFallbackProducts(), selected?.title).slice(0, PRODUCT_POOL_LIMIT);
      } catch (error) {
        console.warn('Unable to load fallback products.', error.message || error);
      }
      if (productSource === 'random') return fallback;
      const specific = [];
      for (const [index, url] of requestedProductUrls.entries()) {
        console.log('Specific product URL:', url, 'source:', productSource);
        const handle = productUrlHandle(url);
        const matchedProduct = findProductInPoolByHandle(fallback, handle)
          || fallback.find(product => normalizeProductUrl(product.url) === normalizeProductUrl(url) || normalizeProductUrl(product.onlineStoreUrl) === normalizeProductUrl(url));
        if (matchedProduct) {
          specific.push(productFromUrl(url, index, matchedProduct));
          continue;
        }
        try {
          const fetched = handle ? await fetchSpecificProduct(url, index, handle) : null;
          specific.push(fetched || productFromUrl(url, index));
        } catch (error) {
          console.log('Specific product resolved from Shopify .js:', null);
          specific.push(productFromUrl(url, index));
        }
      }
      return dedupeProductList(specific).slice(0, PRODUCT_POOL_LIMIT);
    }
    loadProducts().then(next => { if (alive) setProducts(next); });
    return () => { alive = false; };
  }, [productRequestKey]);
  return products;
}'''
    player = regex_once(
        player,
        r'function useProducts\(selected\) \{.*?\n\}\n\nfunction formatPlayCount',
        use_products + '\n\nfunction formatPlayCount',
        'replace player product hook',
        re.S,
    )

if 'const [clipCommerceState, setClipCommerceState]' not in player:
    old = "  const handledAdEndRef = useRef(false);\n  const products = useProducts(currentAd ? null : selected);\n\n  const selectedSong = selected || tracks[0] || null;"
    new = r'''  const handledAdEndRef = useRef(false);
  const [clipCommerceState, setClipCommerceState] = useState(() => createClipCommerceState(''));
  const activeVisualCommerceRef = useRef(null);
  const selectedSong = selected || tracks[0] || null;
  const handleActiveVisualChange = useCallback((asset) => {
    const clipUrls = normalizeCommerceProductUrls(asset?.shopifyProductUrls ?? asset?.shopify_product_urls ?? []);
    if (clipUrls.length) activeVisualCommerceRef.current = asset;
    const songKey = clean(selectedSong?.songKey || selectedSong?.song_key || selectedSong?.idx);
    setClipCommerceState(state => resolveClipCommerceState({
      state,
      songKey,
      asset,
      songProductUrls: selectedSong?.specificProductUrls || [],
      now: Date.now()
    }));
  }, [selectedSong?.idx, selectedSong?.songKey]);
  const products = useProducts(currentAd ? null : selectedSong, currentAd ? null : clipCommerceState);'''
    player = replace_once(player, old, new, 'add App clip commerce state')

if "resetClipCommerceStateForSong" not in player:
    effects = r'''
  useEffect(() => {
    const songKey = clean(selectedSong?.songKey || selectedSong?.song_key || selectedSong?.idx);
    activeVisualCommerceRef.current = null;
    setClipCommerceState(resolveClipCommerceState({
      state: createClipCommerceState(songKey),
      songKey,
      asset: null,
      songProductUrls: selectedSong?.specificProductUrls || [],
      now: Date.now()
    }));
  }, [selectedSong?.idx, selectedSong?.songKey]); // resetClipCommerceStateForSong

  useEffect(() => {
    const songProductUrls = normalizeCommerceProductUrls(selectedSong?.specificProductUrls || []);
    if (clipCommerceState.productSource !== 'clip' || !clipCommerceState.clipProductExpiresAt || !songProductUrls.length) return undefined;
    const switchToSongProducts = () => {
      const songKey = clean(selectedSong?.songKey || selectedSong?.song_key || selectedSong?.idx);
      setClipCommerceState(state => resolveClipCommerceState({ state, songKey, asset: null, songProductUrls, now: Date.now() }));
    };
    const remaining = clipCommerceState.clipProductExpiresAt - Date.now();
    if (remaining <= 0) {
      switchToSongProducts();
      return undefined;
    }
    const timer = window.setTimeout(switchToSongProducts, remaining);
    return () => window.clearTimeout(timer);
  }, [clipCommerceState.productSource, clipCommerceState.clipProductExpiresAt, selectedSong?.idx, selectedSong?.songKey, (selectedSong?.specificProductUrls || []).join('|')]);
'''
    player = replace_once(
        player,
        "  }, [selectedSong]);\n\n  useEffect(() => {\n    updateMediaSessionMetadata(selectedSong);",
        "  }, [selectedSong]);\n" + effects + "\n  useEffect(() => {\n    updateMediaSessionMetadata(selectedSong);",
        'add clip commerce reset and expiry effects',
    )

if 'product_source: clipCommerceState.productSource' not in player:
    player = replace_once(
        player,
        "  function handleProductClick(product) { sendTrackingEvent(selectedSong, 'product_click', sessionId, { product_url: product?.url || '' }); }",
        "  function handleProductClick(product) { sendTrackingEvent(selectedSong, 'product_click', sessionId, { product_url: product?.url || '', product_source: clipCommerceState.productSource || 'random', visual_asset_id: clipCommerceState.productSource === 'clip' ? (clipCommerceState.lastClipId || '') : '', visual_folder_id: clipCommerceState.productSource === 'clip' ? (activeVisualCommerceRef.current?.folderId || '') : '' }); }",
        'track clip product source',
    )

if 'onActiveVisualChange, onAdStarted' not in player:
    player = replace_once(
        player,
        'onPlaybackStatusChange, autoPlayRequest, onAdStarted,',
        'onPlaybackStatusChange, autoPlayRequest, onActiveVisualChange, onAdStarted,',
        'add active visual callback to Player signature',
    )

if 'onActiveVisualChange: handleActiveVisualChange' not in player:
    player = replace_once(
        player,
        'products, playerMessage, onPrevious:',
        'products, playerMessage, onActiveVisualChange: handleActiveVisualChange, onPrevious:',
        'pass active visual callback into Player',
    )

if 'onActiveVisualChange?.(activeVisualIsClip ? activeVisualAsset : null)' not in player:
    effect = r'''
  useEffect(() => {
    onActiveVisualChange?.(activeVisualIsClip ? activeVisualAsset : null);
  }, [activeVisualKey, activeVisualIsClip, onActiveVisualChange]);
'''
    player = replace_once(
        player,
        "  const playbackStartMs = useMemo(() => Date.now(), [selected?.idx, mediaMode, activeVideoEmbedUrl]);\n\n  useEffect(() => { onPlaybackStatusChange?.(isVideoMode ? isVideoPlaying : isPlaying);",
        "  const playbackStartMs = useMemo(() => Date.now(), [selected?.idx, mediaMode, activeVideoEmbedUrl]);\n" + effect + "\n  useEffect(() => { onPlaybackStatusChange?.(isVideoMode ? isVideoPlaying : isPlaying);",
        'notify App when active VEC clip changes',
    )

write(player_path, player)

test_path = ROOT / 'radio-api/tests/clip-shopify-integration-source.test.mjs'
test_path.write_text(r'''import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const api = fs.readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
const cms = fs.readFileSync(new URL('../../radio/visual-experience/dev/index.html', import.meta.url), 'utf8');
const player = fs.readFileSync(new URL('../../radio/dev/app.js', import.meta.url), 'utf8');

test('folder asset API persists and returns clip Shopify URLs', () => {
  assert.match(api, /shopify_product_urls/);
  assert.match(api, /normalizeClipShopifyProductUrls/);
  assert.match(api, /Shopify Product URLs must contain valid HTTP or HTTPS URLs/);
  assert.match(api, /product_source: body\.product_source/);
});

test('Visual Experience CMS exposes clip product editing and verified save', () => {
  assert.match(cms, /Shopify Product URLs/);
  assert.match(cms, /data-field="shopify_product_urls"/);
  assert.match(cms, /data-save-details/);
  assert.match(cms, /Asset details saved and verified/);
});

test('DEV player isolates clip commerce from media playback', () => {
  assert.match(player, /from '\.\/clip-commerce\.mjs'/);
  assert.match(player, /onActiveVisualChange/);
  assert.match(player, /clipCommerceState/);
  assert.match(player, /product_source: clipCommerceState\.productSource/);
  assert.doesNotMatch(player, /handleActiveVisualChange[\s\S]{0,600}(audioRef|setMediaMode|setVisualIndex|pause\(|play\()/);
});
''', encoding='utf-8')
print(f'updated {test_path}')
