(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const STORE_ORIGIN = 'https://stashbox.ai';
  const PRODUCT_LIST_URL = `${STORE_ORIGIN}/products.json?limit=250`;
  const productRequests = new Map();
  let catalogPromise = null;
  let scanQueued = false;

  const clean = value => String(value ?? '').trim();
  const normalize = value => clean(value).toLowerCase();

  function productHandle(value) {
    try {
      const url = new URL(value, STORE_ORIGIN);
      const parts = url.pathname.split('/').filter(Boolean);
      const productIndex = parts.findIndex(part => part.toLowerCase() === 'products');
      return clean(productIndex >= 0 ? parts[productIndex + 1] : parts.at(-1));
    } catch (_) {
      return clean(String(value || '').split(/[/?#]/).filter(Boolean).at(-1));
    }
  }

  function imageValue(value) {
    if (!value) return '';
    if (typeof value === 'object') {
      return imageValue(
        value.src ??
        value.url ??
        value.original_src ??
        value.originalSrc ??
        value.preview_image ??
        value.previewImage
      );
    }
    const raw = clean(value);
    if (!raw || raw === '[object Object]' || /%5Bobject%20Object%5D/i.test(raw)) return '';
    if (raw.startsWith('//')) return `https:${raw}`;
    try {
      const resolved = new URL(raw, STORE_ORIGIN);
      return ['http:', 'https:'].includes(resolved.protocol) ? resolved.href : '';
    } catch (_) {
      return '';
    }
  }

  function productImage(product = {}) {
    const candidates = [
      product.images?.[0],
      product.image,
      product.featured_image,
      product.featuredImage,
      product.media?.[0]?.preview_image,
      product.media?.[0]?.previewImage
    ];
    for (const candidate of candidates) {
      const url = imageValue(candidate);
      if (url) return url;
    }
    return '';
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }

  async function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetchJson(PRODUCT_LIST_URL)
        .then(body => {
          const products = Array.isArray(body?.products) ? body.products : [];
          return new Map(products.map(product => [normalize(product.handle), product]));
        })
        .catch(() => new Map());
    }
    return catalogPromise;
  }

  async function loadProduct(handle) {
    const key = normalize(handle);
    if (!key) return null;
    if (productRequests.has(key)) return productRequests.get(key);

    const request = (async () => {
      const endpoints = [
        `${STORE_ORIGIN}/products/${encodeURIComponent(handle)}.js`,
        `${STORE_ORIGIN}/products/${encodeURIComponent(handle)}.json`
      ];
      for (const endpoint of endpoints) {
        try {
          const body = await fetchJson(endpoint);
          const product = body?.product || body;
          if (product && (productImage(product) || product.title)) return product;
        } catch (_) {}
      }
      return (await loadCatalog()).get(key) || null;
    })();

    productRequests.set(key, request);
    return request;
  }

  function fallback(holder) {
    if (!holder) return;
    holder.classList.add('is-thumbnail-fallback');
    holder.replaceChildren();
    const label = document.createElement('b');
    label.dataset.vecProductFallback = 'true';
    label.textContent = 'SHOP';
    holder.appendChild(label);
  }

  function renderImage(holder, url, title) {
    if (!holder || !url) return fallback(holder);
    holder.classList.remove('is-thumbnail-fallback');
    holder.replaceChildren();

    const image = document.createElement('img');
    image.dataset.vecProductImage = 'true';
    image.alt = title || 'Shopify product';
    image.loading = 'eager';
    image.decoding = 'async';
    image.addEventListener('error', () => fallback(holder), { once: true });
    holder.appendChild(image);
    image.src = url;
  }

  async function repairCard(card) {
    if (!card || card.dataset.vecThumbnailRepair === 'loading' || card.dataset.vecThumbnailRepair === 'ready') return;
    card.dataset.vecThumbnailRepair = 'loading';

    const holder = card.firstElementChild;
    if (!holder) return;
    const handle = productHandle(card.getAttribute('href') || card.href);
    if (!handle) {
      fallback(holder);
      card.dataset.vecThumbnailRepair = 'ready';
      return;
    }

    const existing = holder.querySelector('img');
    if (existing) existing.addEventListener('error', () => fallback(holder), { once: true });

    try {
      const product = await loadProduct(handle);
      const url = productImage(product || {});
      if (url) renderImage(holder, url, clean(product?.title || card.querySelector(':scope > b')?.textContent));
      else if (!existing || !imageValue(existing.getAttribute('src'))) fallback(holder);
    } catch (_) {
      if (!existing || !imageValue(existing.getAttribute('src'))) fallback(holder);
    } finally {
      card.dataset.vecThumbnailRepair = 'ready';
    }
  }

  function scan() {
    scanQueued = false;
    app.querySelectorAll('[data-vec-clip-commerce] .v2-vec-clip-product').forEach(card => {
      repairCard(card).catch(() => {
        fallback(card.firstElementChild);
        card.dataset.vecThumbnailRepair = 'ready';
      });
    });
  }

  function queueScan() {
    if (scanQueued) return;
    scanQueued = true;
    requestAnimationFrame(scan);
  }

  new MutationObserver(queueScan).observe(app, { childList: true, subtree: true });
  document.addEventListener('error', event => {
    const image = event.target?.closest?.('[data-vec-product-image]');
    if (image) fallback(image.parentElement);
  }, true);
  queueScan();
})();
