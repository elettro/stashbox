(() => {
  'use strict';

  const originalFetch = window.fetch.bind(window);
  const SHOP_PRODUCTS_URL = 'https://stashbox.ai/products.json';
  const HOMEPAGE_ROW_SELECTOR = '.v2-shop-row';
  const HOMEPAGE_CARD_LIMIT = 12;

  const shuffle = items => {
    const list = [...items];
    for (let index = list.length - 1; index > 0; index -= 1) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [list[index], list[randomIndex]] = [list[randomIndex], list[index]];
    }
    return list;
  };

  const escapeHtml = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const normalizeProduct = product => {
    const variant = Array.isArray(product?.variants) ? product.variants[0] : null;
    const imageRaw = product?.images?.[0]?.src || product?.featured_image || product?.image?.src || '';
    const image = String(imageRaw || '').startsWith('//') ? `https:${imageRaw}` : String(imageRaw || '');
    const handle = String(product?.handle || '').trim();
    const title = String(product?.title || 'Stashbox Product').trim();
    const priceNumber = Number(variant?.price);
    return {
      handle,
      title,
      image,
      price: Number.isFinite(priceNumber) ? `$${priceNumber.toFixed(2)}` : '',
      url: handle ? `https://stashbox.ai/products/${encodeURIComponent(handle)}` : ''
    };
  };

  const renderHomepageCard = product => {
    if (!product?.url) return '';
    return `<a class="v2-product-card" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">
      <span class="v2-product-image">${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy" onerror="this.remove()">` : '<b>SB</b>'}</span>
      <strong>${escapeHtml(product.title)}</strong>
      ${product.price ? `<span>${escapeHtml(product.price)}</span>` : ''}
    </a>`;
  };

  async function fetchRandomProducts(limit = HOMEPAGE_CARD_LIMIT) {
    const requestUrl = new URL(SHOP_PRODUCTS_URL, window.location.href);
    requestUrl.searchParams.set('limit', '250');
    requestUrl.searchParams.set('_v2random', `${Date.now()}-${Math.random()}`);
    const response = await originalFetch(requestUrl.toString(), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Shopify products HTTP ${response.status}`);
    const data = await response.json();
    const products = Array.isArray(data?.products) ? data.products : [];
    return shuffle(products).map(normalizeProduct).filter(product => product.handle && product.url).slice(0, limit);
  }

  // Keep every Shopify fallback fetch fresh and shuffled. Specific CMS-assigned
  // song/clip product URLs use their own direct-product resolution and are not
  // changed by this fallback interceptor.
  window.fetch = async (input, init) => {
    const rawUrl = typeof input === 'string' ? input : input?.url;
    if (!rawUrl || !rawUrl.includes('stashbox.ai/products.json')) {
      return originalFetch(input, init);
    }

    const requestUrl = new URL(rawUrl, window.location.href);
    requestUrl.searchParams.set('limit', '250');
    requestUrl.searchParams.set('_v2random', `${Date.now()}-${Math.random()}`);

    const response = await originalFetch(requestUrl.toString(), {
      ...init,
      cache: 'no-store'
    });

    if (!response.ok) return response;

    try {
      const data = await response.json();
      if (Array.isArray(data?.products)) {
        data.products = shuffle(data.products).slice(0, 250);
      }

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (_) {
      return response;
    }
  };

  // The homepage renderer slices the first 12 products from state. Replace only
  // that generic homepage Shop row with a fresh shuffled sample after it mounts.
  // This does not touch song/clip commerce trays, so CMS-assigned URLs keep priority.
  let homepageRefreshInFlight = false;
  let lastHomepageRow = null;

  async function refreshHomepageShopRow() {
    const row = document.querySelector(HOMEPAGE_ROW_SELECTOR);
    if (!row || row === lastHomepageRow || homepageRefreshInFlight) return;
    homepageRefreshInFlight = true;
    lastHomepageRow = row;
    try {
      const products = await fetchRandomProducts(HOMEPAGE_CARD_LIMIT);
      if (products.length && row.isConnected) {
        row.innerHTML = products.map(renderHomepageCard).join('');
        row.dataset.randomizedFallback = 'true';
      }
    } catch (error) {
      console.warn('[v2 shop randomizer] homepage fallback refresh failed', error?.message || error);
    } finally {
      homepageRefreshInFlight = false;
    }
  }

  const observer = new MutationObserver(() => {
    refreshHomepageShopRow();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      refreshHomepageShopRow();
    }, { once: true });
  } else {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    refreshHomepageShopRow();
  }
})();
