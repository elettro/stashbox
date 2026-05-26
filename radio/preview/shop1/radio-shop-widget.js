(function () {
  'use strict';

  const PRODUCT_MAP_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwCczmnIAXramvgZhmc1lsxWeU449_Q3hjh3OLS0oEPXi4d6OOv9hrLYESWJJH7JrQcFQ/exec?type=productMap';
  const DESKTOP_MOUNT = 'stashbox-radio-shop-desktop';
  const MOBILE_MOUNT = 'stashbox-radio-shop-mobile';

  let productMapItems = [];
  let productMapReady = false;
  let currentTrack = null;

  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };

  function shopDebugPanel(message, data) {
    let box = document.getElementById('shop-debug-panel');
    if (!box) {
      box = document.createElement('div');
      box.id = 'shop-debug-panel';
      box.style.cssText = 'margin:12px 0;padding:10px;border:1px solid #f0a500;color:#f0a500;background:#111;font:12px monospace;white-space:pre-wrap;';
      const mount = document.getElementById('radio-shop-desktop') || document.getElementById('stashbox-radio-shop-desktop') || document.getElementById('dp');
      if (mount) mount.prepend(box);
    }

    box.textContent = message + (data ? '\n' + JSON.stringify(data, null, 2) : '');
  }

  function injectStyles() {
    if (document.getElementById('stashbox-radio-shop-widget-style')) return;
    const style = document.createElement('style');
    style.id = 'stashbox-radio-shop-widget-style';
    style.textContent = `.radio-shop-preview{margin-top:12px;padding:14px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.02)}.radio-shop-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.radio-shop-card{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--border);border-radius:12px;background:#14141a;color:inherit;text-decoration:none}.radio-shop-img-wrap{aspect-ratio:1/1;border-radius:10px;overflow:hidden;background:#0f0f12;display:flex;align-items:center;justify-content:center}.radio-shop-img{width:100%;height:100%;object-fit:cover}.radio-shop-img-fallback{font-weight:800;color:var(--accent)}.radio-shop-card-title{font:700 13px/1.3 var(--fb);color:var(--text)}.radio-shop-card-price{font:700 12px var(--fb);color:var(--muted)}.radio-shop-compare{text-decoration:line-through;opacity:.7;margin-right:6px}.radio-shop-card-cta{margin-top:auto;height:32px;border-radius:999px;border:1px solid rgba(240,165,0,.35);background:rgba(240,165,0,.12);color:var(--accent);display:flex;align-items:center;justify-content:center;font:800 11px var(--fb)}.mobile-shop-drawer{margin:10px 0}.mobile-shop-toggle{width:100%;height:34px;border-radius:999px;border:1px solid rgba(240,165,0,.3);background:rgba(240,165,0,.12);color:var(--accent);display:flex;justify-content:space-between;align-items:center;padding:0 12px;font:800 11px var(--fb)}.mobile-shop-panel{margin-top:8px;border:1px solid var(--border);border-radius:12px;background:rgba(15,15,18,.94);padding:10px}.mobile-shop-list{display:grid;grid-template-columns:1fr;gap:10px}@media (max-width:1024px){.radio-shop-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}@media (max-width:767px){#stashbox-radio-shop-desktop{display:none}}@media (min-width:768px){#stashbox-radio-shop-mobile{display:none}}`;
    document.head.appendChild(style);
  }

  function slugifyProductKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function findStaticProductMapRow(mapType, mapKey) {
    if (!Array.isArray(productMapItems)) return null;

    return productMapItems
      .filter(item => item && item.active !== false)
      .filter(item => String(item.mapType || '').toLowerCase() === mapType)
      .filter(item => String(item.mapKey || '').toLowerCase() === mapKey)
      .sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999))[0] || null;
  }

  function getMatchedProductRows(track) {
    if (!Array.isArray(productMapItems) || !productMapItems.length) return [];

    const songKey = slugifyProductKey(track?.title);
    const artistKey = slugifyProductKey(track?.artist);
    const albumKey = slugifyProductKey(track?.album);
    const genreKey = slugifyProductKey(track?.genre || track?.sectionKey);

    const candidates = [
      { mapType: 'song', mapKey: songKey },
      { mapType: 'artist', mapKey: artistKey },
      { mapType: 'album', mapKey: albumKey },
      { mapType: 'genre', mapKey: genreKey },
      { mapType: 'page', mapKey: 'radio' },
      { mapType: 'general', mapKey: 'radio-general' }
    ];

    console.log('[shop1 merch] match candidates:', candidates);

    const rows = [];

    candidates.forEach(candidate => {
      productMapItems
        .filter(item => item && item.active !== false)
        .filter(item => String(item.mapType || '').toLowerCase() === candidate.mapType)
        .filter(item => String(item.mapKey || '').toLowerCase() === candidate.mapKey)
        .sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999))
        .forEach(item => rows.push(item));
    });

    console.log('[shop1 merch] matched rows:', rows);
    return rows;
  }

  function mergeProductRowsToLinks(rows, limit) {
    const seen = new Set();
    const merged = [];

    rows.forEach(row => {
      const links = Array.isArray(row.productLinks)
        ? row.productLinks
        : String(row.productLinks || '').split(/\s*\|\s*|\n|,/);

      links.forEach(link => {
        const cleanLink = String(link || '').trim();
        if (!cleanLink) return;

        const cleanForHandle = cleanLink.split('?')[0];
        const match = cleanForHandle.match(/\/products\/([^/?#]+)/i);
        const handle = match && match[1] ? decodeURIComponent(match[1]).trim() : cleanLink;

        if (seen.has(handle)) return;

        seen.add(handle);
        merged.push({
          link: cleanLink,
          handle: handle,
          sourceRow: row
        });
      });
    });

    return merged.slice(0, limit || 4);
  }

  async function buildProductsFromEntries(entries) {
    const products = await Promise.all(entries.map(async entry => {
      const fallbackTitle = entry.handle
        ? entry.handle.replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
        : 'Stashbox Product';

      const fallbackProduct = {
        title: fallbackTitle,
        url: entry.link || `https://stashbox.ai/products/${entry.handle}`,
        handle: entry.handle,
        image: '',
        price: '',
        compareAtPrice: ''
      };

      try {
        const res = await fetch(`https://stashbox.ai/products/${entry.handle}.js`, {
          method: 'GET',
          cache: 'no-store'
        });

        if (!res.ok) throw new Error('Shopify product fetch failed: ' + res.status);

        const data = await res.json();
        const variant = Array.isArray(data.variants) && data.variants.length ? data.variants[0] : null;

        return {
          title: data.title || fallbackProduct.title,
          url: entry.link || `https://stashbox.ai/products/${entry.handle}`,
          handle: entry.handle,
          image: data.featured_image || (Array.isArray(data.images) && data.images[0]) || '',
          price: variant && variant.price ? formatShopifyPrice(variant.price) : '',
          compareAtPrice: variant && variant.compare_at_price ? formatShopifyPrice(variant.compare_at_price) : ''
        };
      } catch (err) {
        console.warn('[shop1 merch] Shopify image/data fetch failed, fallback card used:', entry.handle, err);
        return fallbackProduct;
      }
    }));

    return products.filter(Boolean).slice(0, 4);
  }

  function formatShopifyPrice(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return '$' + number.toFixed(2);
  }

  function renderProductCardHtml(product, productRow) {
    const title = escapeHtml(product.title || 'Stashbox Product');
    const url = escapeHtml(product.url || '#');
    const image = product.image ? escapeHtml(product.image) : '';
    const price = escapeHtml(product.price || '');
    const compareAtPrice = escapeHtml(product.compareAtPrice || '');
    const cta = escapeHtml(productRow?.merchCtaText || 'Shop Now');
    const hasSale = price && compareAtPrice && price !== compareAtPrice;

    return `
      <a class="radio-shop-card" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Open product: ${title}">
        <div class="radio-shop-img-wrap">
          ${image ? `<img class="radio-shop-img" src="${image}" alt="${title}" loading="lazy">` : `<div class="radio-shop-img-fallback">SB</div>`}
        </div>
        <div class="radio-shop-card-body">
          <div class="radio-shop-card-title">${title}</div>
          <div class="radio-shop-card-price">
            ${hasSale ? `<span class="radio-shop-compare">${compareAtPrice}</span>` : ''}
            ${price ? `<strong>${price}</strong>` : '<span class="radio-shop-no-price">Shop on Stashbox.ai</span>'}
          </div>
          <span class="radio-shop-card-cta">${cta}</span>
        </div>
      </a>
    `;
  }

  function renderDesktopShop(productRow, products) {
    let section = document.getElementById('radio-shop-desktop') || document.getElementById('stashbox-radio-shop-desktop');

    if (!section) {
      section = document.createElement('section');
      section.id = 'radio-shop-desktop';
      section.className = 'radio-shop-preview radio-shop-desktop';

      const dp = document.getElementById('dp');
      if (dp) {
        dp.appendChild(section);
      } else {
        document.body.appendChild(section);
      }
    }

    section.innerHTML = `
      <div class="radio-shop-head">
        <div>
          <div class="radio-shop-kicker">STASHBOX SHOP</div>
          <h2 class="radio-shop-title">${escapeHtml(productRow.merchHeadline || 'Shop This Track')}</h2>
          <p class="radio-shop-subtitle">Products are independent from radio playback.</p>
        </div>
      </div>
      <div class="radio-shop-grid">
        ${products.map(product => renderProductCardHtml(product, productRow)).join('')}
      </div>
    `;

    section.hidden = false;
    section.style.display = 'block';

    shopDebugPanel('desktop shop rendered', {
      count: products.length,
      titles: products.map(p => p.title)
    });
  }


  function renderMobileShop(productRow, products) {
    const mount = document.getElementById(MOBILE_MOUNT);
    if (!mount) return;
    mount.innerHTML = `<section class="mobile-shop-drawer open">
      <button class="mobile-shop-toggle" type="button" aria-disabled="true"><span>SHOP</span><strong>${products.length}</strong></button>
      <div class="mobile-shop-panel" style="display:block"><div class="mobile-shop-head"><div><div class="mobile-shop-kicker">STASHBOX MERCH</div><h3>${escapeHtml(productRow.merchHeadline || 'Shop This Track')}</h3></div></div>
      <div class="mobile-shop-list">${products.map((product) => renderProductCardHtml(product, productRow)).join('')}</div></div>
    </section>`;
  }

  function renderEmergencyFallbackMerch() {
    const fallbackRow = { merchHeadline: 'Shop This Track', merchCtaText: 'Shop Now' };
    const fallbackProduct = [{ title: 'Stashbox Product', url: 'https://stashbox.ai/products/unisex-heavy-cotton-tee-2', image: '', price: '', compareAtPrice: '' }];
    renderDesktopShop(fallbackRow, fallbackProduct);
    renderMobileShop(fallbackRow, fallbackProduct);
  }

  async function renderDefaultRadioMerch() {
    try {
      const productRow =
        findStaticProductMapRow('page', 'radio') ||
        findStaticProductMapRow('general', 'radio-general') ||
        productMapItems[0];

      console.log('[shop1 merch] default product row:', productRow);

      if (!productRow) {
        renderEmergencyFallbackMerch();
        return;
      }

      const selectedEntries = mergeProductRowsToLinks([productRow], 4);
      const products = await buildProductsFromEntries(selectedEntries);

      console.log('[shop1 merch] default products:', products);

      if (!products.length) {
        renderEmergencyFallbackMerch();
        return;
      }

      renderDesktopShop(productRow, products);
      renderMobileShop(productRow, products);
    } catch (err) {
      console.warn('[shop1 merch] renderDefaultRadioMerch failed:', err);
      renderEmergencyFallbackMerch();
    }
  }

  async function updateRadioMerch(track) {
    try {
      shopDebugPanel('updateRadioMerch started', {
        title: track?.title,
        slug: slugifyProductKey(track?.title),
        productMapReady,
        productMapCount: Array.isArray(productMapItems) ? productMapItems.length : 0
      });

      if (!Array.isArray(productMapItems) || !productMapItems.length) {
        await fetchProductMap();
      }

      if (!Array.isArray(productMapItems) || !productMapItems.length) {
        shopDebugPanel('ERROR: productMap still empty after fetch');
        return;
      }

      const rows = getMatchedProductRows(track);
      shopDebugPanel('matched product rows', rows.map(row => ({
        rowNumber: row.rowNumber,
        mapType: row.mapType,
        mapKey: row.mapKey,
        productLinks: row.productLinks,
        merchHeadline: row.merchHeadline
      })));

      const selectedEntries = mergeProductRowsToLinks(rows, 4);
      shopDebugPanel('selected product entries', selectedEntries);

      if (!selectedEntries.length) {
        shopDebugPanel('ERROR: no selected product entries');
        return;
      }

      const displayRow = rows[0] || {
        merchHeadline: 'Official Stashbox Merch',
        merchCtaText: 'Shop Now'
      };

      const products = await buildProductsFromEntries(selectedEntries);
      shopDebugPanel('products built', products.map(product => ({
        title: product.title,
        url: product.url,
        image: product.image,
        price: product.price
      })));

      renderDesktopShop(displayRow, products);
      renderMobileShop(displayRow, products);

    } catch (err) {
      console.error('[shop1 merch] updateRadioMerch failed:', err);
      shopDebugPanel('ERROR updateRadioMerch failed', {
        message: err.message,
        stack: err.stack
      });
    }
  }


  async function fetchProductMap() {
    const res = await fetch(PRODUCT_MAP_ENDPOINT, {
      method: 'GET',
      cache: 'no-store'
    });

    if (!res.ok) {
      throw new Error('productMap fetch failed: ' + res.status);
    }

    const data = await res.json();

    console.log('[shop1 merch] endpoint data:', data);

    productMapItems = Array.isArray(data.items) ? data.items : [];
    productMapReady = true;

    console.log('[shop1 merch] productMap loaded count:', productMapItems.length);
    shopDebugPanel('productMap loaded', {
      count: productMapItems.length,
      first: productMapItems[0],
      allKeys: productMapItems.map(item => `${item.mapType}:${item.mapKey}`)
    });

    if (!productMapItems.length) {
      renderEmergencyFallbackMerch();
      return [];
    }

    if (window.currentTrack || currentTrack) {
      updateRadioMerch(window.currentTrack || currentTrack);
    } else {
      renderDefaultRadioMerch();
    }

    return productMapItems;
  }


  window.shopDebugPanel = shopDebugPanel;
  window.slugifyProductKey = slugifyProductKey;
  window.updateRadioMerch = updateRadioMerch;

  async function init() {
    injectStyles();

    try {
      await fetchProductMap();
    } catch (e) {
      productMapItems = [];
      productMapReady = false;
      console.warn('[shop1 merch] productMap fetch failed:', e);
      renderEmergencyFallbackMerch();
    }

    window.addEventListener('stashbox:trackchange', function (event) {
      safe(async () => {
        currentTrack = (event && event.detail && event.detail.track) || null;
        if (!productMapReady) return;
        await updateRadioMerch(currentTrack);
      });
    });
  }

  safe(init);
})();
