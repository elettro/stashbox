from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


root = Path(__file__).resolve().parents[2]
commerce_path = root / "radio/dev/clip-commerce.mjs"
player_path = root / "radio/dev/app.js"
state_test_path = root / "radio-api/tests/clip-commerce-state.test.mjs"
integration_test_path = root / "radio-api/tests/clip-shopify-integration-source.test.mjs"

commerce = commerce_path.read_text()
commerce = replace_once(
    commerce,
    """  const replacedSlots = Math.min(clip.length, baseline.length);\n  baseline.slice(replacedSlots).forEach(append);\n""",
    """  baseline.forEach(append);\n""",
    "clip product promotion must retain every baseline product",
)
commerce_path.write_text(commerce)

player = player_path.read_text()
old_use_products = """function useProducts(selected, commerceState = null) {
  const [products, setProducts] = useState([]);
  const productSource = clean(commerceState?.productSource || 'song') || 'song';
  const requestedProductUrls = normalizeCommerceProductUrls(
    commerceState && Array.isArray(commerceState.productUrls)
      ? commerceState.productUrls
      : selected?.specificProductUrls || []
  );
  const songProductUrls = normalizeCommerceProductUrls(selected?.specificProductUrls || []);
  const productRequestKey = `${selected?.idx || ''}|${productSource}|${requestedProductUrls.join('|')}|song:${songProductUrls.join('|')}`;
  useEffect(() => {
    let alive = true;

    async function resolveSpecificProducts(urls, fallback, source) {
      const specific = [];
      for (const [index, url] of urls.entries()) {
        console.log('Specific product URL:', url, 'source:', source);
        const handle = productUrlHandle(url);
        const matchedProduct = findProductInPoolByHandle(fallback, handle)
          || fallback.find(product => normalizeProductUrl(product.url) === normalizeProductUrl(url) || normalizeProductUrl(product.onlineStoreUrl) === normalizeProductUrl(url));
        if (matchedProduct) {
          specific.push({ ...productFromUrl(url, index, matchedProduct), commerceSource: source });
          continue;
        }
        try {
          const fetched = handle ? await fetchSpecificProduct(url, index, handle) : null;
          specific.push({ ...(fetched || productFromUrl(url, index)), commerceSource: source });
        } catch (error) {
          console.log('Specific product resolved from Shopify .js:', null);
          specific.push({ ...productFromUrl(url, index), commerceSource: source });
        }
      }
      return dedupeProductList(specific).slice(0, PRODUCT_POOL_LIMIT);
    }

    async function loadProducts() {
      if (!selected) return [];
      let fallback = [];
      try {
        fallback = rotateBySeed(await fetchFallbackProducts(), selected?.title).slice(0, PRODUCT_POOL_LIMIT);
      } catch (error) {
        console.warn('Unable to load fallback products.', error.message || error);
      }

      const randomProducts = fallback.map(product => ({ ...product, commerceSource: 'random' }));
      const songProducts = await resolveSpecificProducts(songProductUrls, fallback, 'song');
      const baselineProducts = songProducts.length ? songProducts : randomProducts;

      if (productSource === 'clip') {
        const clipProducts = await resolveSpecificProducts(requestedProductUrls, fallback, 'clip');
        return overlayClipProducts(clipProducts, baselineProducts, PRODUCT_POOL_LIMIT);
      }
      if (productSource === 'song') return songProducts.slice(0, PRODUCT_POOL_LIMIT);
      return randomProducts.slice(0, PRODUCT_POOL_LIMIT);
    }

    loadProducts().then(next => { if (alive) setProducts(next); });
    return () => { alive = false; };
  }, [productRequestKey]);
  return products;
}
"""
new_use_products = """function useProducts(selected, commerceState = null) {
  const [products, setProducts] = useState([]);
  const activeProductSongKeyRef = useRef('');
  const productSource = clean(commerceState?.productSource || 'song') || 'song';
  const requestedProductUrls = normalizeCommerceProductUrls(
    commerceState && Array.isArray(commerceState.productUrls)
      ? commerceState.productUrls
      : selected?.specificProductUrls || []
  );
  const songProductUrls = normalizeCommerceProductUrls(selected?.specificProductUrls || []);
  const clipFocusKey = `${commerceState?.lastClipId || ''}:${commerceState?.clipProductShownAt || 0}`;
  const productRequestKey = `${selected?.idx || ''}|${productSource}|${requestedProductUrls.join('|')}|song:${songProductUrls.join('|')}|clip:${clipFocusKey}`;
  useEffect(() => {
    let alive = true;

    async function resolveSpecificProducts(urls, fallback, source) {
      const specific = [];
      for (const [index, url] of urls.entries()) {
        console.log('Specific product URL:', url, 'source:', source);
        const handle = productUrlHandle(url);
        const matchedProduct = findProductInPoolByHandle(fallback, handle)
          || fallback.find(product => normalizeProductUrl(product.url) === normalizeProductUrl(url) || normalizeProductUrl(product.onlineStoreUrl) === normalizeProductUrl(url));
        if (matchedProduct) {
          specific.push({ ...productFromUrl(url, index, matchedProduct), commerceSource: source });
          continue;
        }
        try {
          const fetched = handle ? await fetchSpecificProduct(url, index, handle) : null;
          specific.push({ ...(fetched || productFromUrl(url, index)), commerceSource: source });
        } catch (error) {
          console.log('Specific product resolved from Shopify .js:', null);
          specific.push({ ...productFromUrl(url, index), commerceSource: source });
        }
      }
      return dedupeProductList(specific).slice(0, PRODUCT_POOL_LIMIT);
    }

    async function loadProducts() {
      if (!selected) return { mode: 'replace', products: [] };
      let fallback = [];
      try {
        fallback = rotateBySeed(await fetchFallbackProducts(), selected?.title).slice(0, PRODUCT_POOL_LIMIT);
      } catch (error) {
        console.warn('Unable to load fallback products.', error.message || error);
      }

      const randomProducts = fallback.map(product => ({ ...product, commerceSource: 'random' }));
      const songProducts = await resolveSpecificProducts(songProductUrls, fallback, 'song');
      const baselineProducts = songProducts.length ? songProducts : randomProducts;

      if (productSource === 'clip') {
        const clipProducts = await resolveSpecificProducts(requestedProductUrls, fallback, 'clip');
        return { mode: 'promote', products: clipProducts, baselineProducts };
      }
      if (productSource === 'song') {
        return { mode: 'promote', products: songProducts, baselineProducts: songProducts };
      }
      return { mode: 'replace', products: randomProducts };
    }

    loadProducts().then(result => {
      if (!alive) return;
      const selectedKey = clean(selected?.idx || selected?.songKey || selected?.song_key);
      setProducts(current => {
        const sameSong = activeProductSongKeyRef.current === selectedKey;
        activeProductSongKeyRef.current = selectedKey;
        const currentForSong = sameSong ? current : [];
        if (result.mode === 'promote') {
          const baseline = currentForSong.length ? currentForSong : result.baselineProducts;
          return overlayClipProducts(result.products, baseline, PRODUCT_POOL_LIMIT);
        }
        return result.products.slice(0, PRODUCT_POOL_LIMIT);
      });
    });
    return () => { alive = false; };
  }, [productRequestKey]);
  return products;
}
"""
player = replace_once(player, old_use_products, new_use_products, "stateful front queue useProducts")

old_carousel_effect = """  useEffect(() => {
    updateScrollState();
    const carousel = carouselRef.current;
    if (!carousel) return undefined;

    carousel.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);

    let resizeObserver = null;
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(updateScrollState);
      resizeObserver.observe(carousel);
    }

    const stateFrame = window.requestAnimationFrame(updateScrollState);
    return () => {
      carousel.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
      if (resizeObserver) resizeObserver.disconnect();
      window.cancelAnimationFrame(stateFrame);
    };
  }, [updateScrollState, visibleProducts.length]);
"""
new_carousel_effect = old_carousel_effect + """
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel || !visibleProducts.length) return undefined;
    carousel.scrollTo({ left: 0, behavior: 'smooth' });
    const focusFrame = window.requestAnimationFrame(updateScrollState);
    return () => window.cancelAnimationFrame(focusFrame);
  }, [products, updateScrollState, visibleProducts.length]);
"""
player = replace_once(player, old_carousel_effect, new_carousel_effect, "carousel pole-position reset")
player_path.write_text(player)

state_test = state_test_path.read_text()
state_test = replace_once(
    state_test,
    """test('one clip product replaces only the first baseline slot', () => {
  const baseline = [
    { id: 'baseline-a', handle: 'baseline-a' },
    { id: 'baseline-b', handle: 'baseline-b' },
    { id: 'baseline-c', handle: 'baseline-c' },
    { id: 'baseline-d', handle: 'baseline-d' }
  ];
  const clip = [{ id: 'clip-a', handle: 'clip-a' }];

  assert.deepEqual(
    overlayClipProducts(clip, baseline, 4).map(product => product.id),
    ['clip-a', 'baseline-b', 'baseline-c', 'baseline-d']
  );
});

""",
    """test('one clip product moves to pole position and shifts every baseline product right', () => {
  const baseline = [
    { id: 'baseline-a', handle: 'baseline-a' },
    { id: 'baseline-b', handle: 'baseline-b' },
    { id: 'baseline-c', handle: 'baseline-c' },
    { id: 'baseline-d', handle: 'baseline-d' }
  ];
  const clip = [{ id: 'clip-a', handle: 'clip-a' }];

  assert.deepEqual(
    overlayClipProducts(clip, baseline, 5).map(product => product.id),
    ['clip-a', 'baseline-a', 'baseline-b', 'baseline-c', 'baseline-d']
  );
});

""",
    "single product front queue test",
)
state_test = replace_once(
    state_test,
    """test('multiple clip products replace the same number of baseline slots', () => {
  const baseline = [
    { id: 'baseline-a', handle: 'baseline-a' },
    { id: 'baseline-b', handle: 'baseline-b' },
    { id: 'baseline-c', handle: 'baseline-c' },
    { id: 'baseline-d', handle: 'baseline-d' }
  ];
  const clip = [
    { id: 'clip-a', handle: 'clip-a' },
    { id: 'clip-b', handle: 'clip-b' }
  ];

  assert.deepEqual(
    overlayClipProducts(clip, baseline, 4).map(product => product.id),
    ['clip-a', 'clip-b', 'baseline-c', 'baseline-d']
  );
});

""",
    """test('multiple clip products take the first positions and preserve baseline order behind them', () => {
  const baseline = [
    { id: 'baseline-a', handle: 'baseline-a' },
    { id: 'baseline-b', handle: 'baseline-b' },
    { id: 'baseline-c', handle: 'baseline-c' },
    { id: 'baseline-d', handle: 'baseline-d' }
  ];
  const clip = [
    { id: 'clip-a', handle: 'clip-a' },
    { id: 'clip-b', handle: 'clip-b' }
  ];

  assert.deepEqual(
    overlayClipProducts(clip, baseline, 6).map(product => product.id),
    ['clip-a', 'clip-b', 'baseline-a', 'baseline-b', 'baseline-c', 'baseline-d']
  );
});

test('each later clip batch is prepended while prior clip products shift right', () => {
  const baseline = [
    { id: 'song-a', handle: 'song-a' },
    { id: 'song-b', handle: 'song-b' }
  ];
  const first = overlayClipProducts([{ id: 'clip-a', handle: 'clip-a' }], baseline, 10);
  const second = overlayClipProducts([
    { id: 'clip-b', handle: 'clip-b' },
    { id: 'clip-c', handle: 'clip-c' }
  ], first, 10);

  assert.deepEqual(
    second.map(product => product.id),
    ['clip-b', 'clip-c', 'clip-a', 'song-a', 'song-b']
  );
});

test('a repeated product moves to the front without creating a duplicate card', () => {
  const current = [
    { id: 'clip-a', handle: 'clip-a' },
    { id: 'song-a', handle: 'song-a' }
  ];

  assert.deepEqual(
    overlayClipProducts([{ id: 'song-a', handle: 'song-a' }], current, 10).map(product => product.id),
    ['song-a', 'clip-a']
  );
});

""",
    "multi product front queue tests",
)
state_test_path.write_text(state_test)

integration = integration_test_path.read_text()
integration = replace_once(
    integration,
    """  assert.match(player, /overlayClipProducts/);
  assert.match(player, /commerceSource/);
""",
    """  assert.match(player, /overlayClipProducts/);
  assert.match(player, /activeProductSongKeyRef/);
  assert.match(player, /currentForSong\.length \? currentForSong : result\.baselineProducts/);
  assert.match(player, /clipProductShownAt/);
  assert.match(player, /carousel\.scrollTo\(\{ left: 0, behavior: 'smooth' \}\)/);
  assert.match(player, /commerceSource/);
""",
    "integration assertions for front queue and carousel reset",
)
integration_test_path.write_text(integration)
