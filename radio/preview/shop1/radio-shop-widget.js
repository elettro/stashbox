(function () {
  'use strict';

  const PRODUCT_MAP_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwCczmnIAXramvgZhmc1lsxWeU449_Q3hjh3OLS0oEPXi4d6OOv9hrLYESWJJH7JrQcFQ/exec?type=productMap';
  const DESKTOP_MOUNT = 'stashbox-radio-shop-desktop';
  const MOBILE_MOUNT = 'stashbox-radio-shop-mobile';

  let productMapItems = [];
  let productMapReady = false;
  let currentTrack = null;

  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };

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

  function findBestProductMap(track) {
    if (!track || !Array.isArray(productMapItems) || !productMapItems.length) {
      return null;
    }

    const songKey = slugifyProductKey(track.title);
    const artistKey = slugifyProductKey(track.artist);
    const albumKey = slugifyProductKey(track.album);
    const genreKey = slugifyProductKey(track.genre || track.sectionKey);

    const candidates = [
      { mapType: 'song', mapKey: songKey },
      { mapType: 'artist', mapKey: artistKey },
      { mapType: 'album', mapKey: albumKey },
      { mapType: 'genre', mapKey: genreKey },
      { mapType: 'page', mapKey: 'radio' },
      { mapType: 'general', mapKey: 'radio-general' }
    ];

    console.log('[shop1 merch] match candidates:', candidates);

    for (const candidate of candidates) {
      const matches = productMapItems
        .filter(item => item && item.active !== false)
        .filter(item => String(item.mapType || '').toLowerCase() === candidate.mapType)
        .filter(item => String(item.mapKey || '').toLowerCase() === candidate.mapKey)
        .sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999));

      if (matches.length) {
        console.log('[shop1 merch] matched product row:', matches[0]);
        return matches[0];
      }
    }

    const fallback =
      findStaticProductMapRow('page', 'radio') ||
      findStaticProductMapRow('general', 'radio-general') ||
      productMapItems[0];

    console.log('[shop1 merch] fallback product row:', fallback);

    return fallback || null;
  }

  function formatShopifyPrice(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return '$' + number.toFixed(2);
  }

  async function buildProductCards(productRow) {
    try {
      const links = Array.isArray(productRow?.productLinks)
        ? productRow.productLinks
        : String(productRow?.productLinks || '').split(/\s*\|\s*|\n|,/);

      const handles = Array.isArray(productRow?.productHandles)
        ? productRow.productHandles
        : String(productRow?.productHandles || '').split(/\s*\|\s*|\n|,/);

      const entries = [];

      links
        .map(link => String(link || '').trim())
        .filter(Boolean)
        .forEach(link => {
          const cleanUrl = link.split('?')[0];
          const match = cleanUrl.match(/\/products\/([^/?#]+)/i);
          const handle = match && match[1] ? decodeURIComponent(match[1]).trim() : '';

          entries.push({
            url: link,
            handle: handle
          });
        });

      handles
        .map(handle => String(handle || '').trim())
        .filter(Boolean)
        .forEach(handle => {
          if (!entries.find(entry => entry.handle === handle)) {
            entries.push({
              url: `https://stashbox.ai/products/${handle}`,
              handle: handle
            });
          }
        });

      const uniqueEntries = entries
        .filter(entry => entry.url || entry.handle)
        .filter((entry, index, arr) =>
          arr.findIndex(other => other.handle === entry.handle || other.url === entry.url) === index
        )
        .slice(0, 8);

      console.log('[shop1 merch] product entries:', uniqueEntries);

      const products = await Promise.all(uniqueEntries.map(async entry => {
        const fallbackTitle = entry.handle
          ? entry.handle.replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
          : 'Stashbox Product';

        const fallbackProduct = {
          title: fallbackTitle,
          url: entry.url || `https://stashbox.ai/products/${entry.handle}`,
          handle: entry.handle,
          image: '',
          price: '',
          compareAtPrice: '',
          available: true
        };

        if (!entry.handle) {
          return fallbackProduct;
        }

        try {
          const res = await fetch(`https://stashbox.ai/products/${entry.handle}.js`, {
            method: 'GET',
            cache: 'no-store'
          });

          if (!res.ok) {
            throw new Error('Shopify product fetch failed: ' + res.status);
          }

          const data = await res.json();
          const variant = data.variants && data.variants.length ? data.variants[0] : null;

          return {
            title: data.title || fallbackProduct.title,
            url: entry.url || `https://stashbox.ai/products/${entry.handle}`,
            handle: entry.handle,
            image: data.featured_image || (Array.isArray(data.images) && data.images[0]) || '',
            price: variant && variant.price ? formatShopifyPrice(variant.price) : '',
            compareAtPrice: variant && variant.compare_at_price ? formatShopifyPrice(variant.compare_at_price) : '',
            available: variant ? !!variant.available : true
          };
        } catch (err) {
          console.warn('[shop1 merch] Shopify .js failed, using fallback:', entry.handle, err);
          return fallbackProduct;
        }
      }));

      return products;
    } catch (err) {
      console.warn('[shop1 merch] buildProductCards failed:', err);
      return [];
    }
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
    const section = document.getElementById('radio-shop-desktop') || document.getElementById('stashbox-radio-shop-desktop');
    const grid = document.getElementById('radio-shop-grid') || document.querySelector('#stashbox-radio-shop-desktop .radio-shop-grid');

    if (!section) {
      console.warn('[shop1 merch] desktop shop section missing');
      return;
    }

    if (!grid) {
      section.innerHTML = `
        <div class="radio-shop-head">
          <div>
            <div class="radio-shop-kicker">STASHBOX SHOP</div>
            <h2 class="radio-shop-title">${escapeHtml(productRow.merchHeadline || 'Shop This Track')}</h2>
            <p class="radio-shop-subtitle">Products are independent from radio playback.</p>
          </div>
        </div>
        <div class="radio-shop-grid"></div>
      `;
    }

    const finalGrid = document.getElementById('radio-shop-grid') || section.querySelector('.radio-shop-grid');
    const finalTitle = document.getElementById('radio-shop-title') || section.querySelector('.radio-shop-title');
    const finalSubtitle = document.getElementById('radio-shop-subtitle') || section.querySelector('.radio-shop-subtitle');

    if (finalTitle) finalTitle.textContent = productRow.merchHeadline || 'Shop This Track';
    if (finalSubtitle) finalSubtitle.textContent = 'Products are independent from radio playback.';

    finalGrid.innerHTML = products.map(product => renderProductCardHtml(product, productRow)).join('');

    section.hidden = false;
    section.style.display = 'block';

    console.log('[shop1 merch] desktop products rendered:', products.length);
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

      const products = await buildProductCards(productRow);

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
    const productRow = findBestProductMap(track) || findStaticProductMapRow('page', 'radio') || findStaticProductMapRow('general', 'radio-general') || productMapItems[0] || null;
    console.log('[shop1 merch] selected product row:', productRow);

    if (!productRow) {
      renderEmergencyFallbackMerch();
      return;
    }

    const products = await buildProductCards(productRow);
    console.log('[shop1 merch] products to render:', products);

    if (!products.length) {
      renderEmergencyFallbackMerch();
      return;
    }

    renderDesktopShop(productRow, products);
    renderMobileShop(productRow, products);
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

    console.log('[shop1 merch] productMapItems:', productMapItems);
    console.log('[shop1 merch] productMapItems count:', productMapItems.length);

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
