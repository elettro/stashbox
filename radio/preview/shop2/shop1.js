(function () {
  'use strict';

  const PRODUCT_MAP_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwCczmnIAXramvgZhmc1lsxWeU449_Q3hjh3OLS0oEPXi4d6OOv9hrLYESWJJH7JrQcFQ/exec?type=productMap';
  const DESKTOP_MOUNT = 'stashbox-radio-shop-desktop';
  const MOBILE_MOUNT  = 'stashbox-radio-shop-mobile';

  let productMapItems  = [];
  let productMapReady  = false;
  let currentTrack     = null;

  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };

  // ── Expose globals synchronously so the radio HTML can call them
  //    the moment this script tag executes — before any async work.
  function shopDebugPanel(message, data) {
    let box = document.getElementById('shop-debug-panel');
    if (!box) {
      box = document.createElement('div');
      box.id = 'shop-debug-panel';
      box.style.cssText = 'margin:12px 0;padding:10px;border:1px solid #f0a500;color:#f0a500;background:#111;font:12px monospace;white-space:pre-wrap;border-radius:8px;';
      const mount = document.getElementById(DESKTOP_MOUNT) || document.getElementById('dp');
      if (mount) mount.prepend(box);
      else document.body.prepend(box);
    }
    box.textContent = message + (data ? '\n' + JSON.stringify(data, null, 2) : '');
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

  // Set on window immediately — radio HTML can call these as soon as the
  // script tag runs, regardless of whether fetchProductMap has resolved.
  window.shopDebugPanel    = shopDebugPanel;
  window.slugifyProductKey = slugifyProductKey;
  window.updateRadioMerch  = function (track) {
    // Queues the call; if productMap isn't loaded yet it fetches first.
    safe(async () => { await updateRadioMerch(track); });
  };

  // ────────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('stashbox-radio-shop-widget-style')) return;
    const style = document.createElement('style');
    style.id = 'stashbox-radio-shop-widget-style';
    style.textContent = `
      .radio-shop-preview{margin-top:12px;padding:14px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.02)}
      .radio-shop-kicker{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:4px}
      .radio-shop-title{font-family:var(--fh);font-size:20px;letter-spacing:.04em;color:var(--text);margin-bottom:2px}
      .radio-shop-subtitle{font-size:11px;color:var(--muted);margin-bottom:12px}
      .radio-shop-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .radio-shop-card{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--border);border-radius:12px;background:#14141a;color:inherit;text-decoration:none;transition:border-color .15s}
      .radio-shop-card:hover{border-color:var(--border-h)}
      .radio-shop-img-wrap{aspect-ratio:1/1;border-radius:10px;overflow:hidden;background:#0f0f12;display:flex;align-items:center;justify-content:center}
      .radio-shop-img{width:100%;height:100%;object-fit:cover}
      .radio-shop-img-fallback{font-weight:800;font-size:14px;color:var(--accent)}
      .radio-shop-card-title{font-size:13px;font-weight:600;line-height:1.3;color:var(--text)}
      .radio-shop-card-price{font-size:12px;font-weight:700;color:var(--muted);margin-top:2px}
      .radio-shop-compare{text-decoration:line-through;opacity:.7;margin-right:6px}
      .radio-shop-no-price{font-weight:400;font-size:11px}
      .radio-shop-card-cta{margin-top:auto;height:30px;border-radius:999px;border:1px solid rgba(240,165,0,.35);background:rgba(240,165,0,.12);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;letter-spacing:.04em}
      .mobile-shop-drawer{margin:10px 16px}
      .mobile-shop-toggle{width:100%;height:36px;border-radius:999px;border:1px solid rgba(240,165,0,.3);background:rgba(240,165,0,.12);color:var(--accent);display:flex;justify-content:space-between;align-items:center;padding:0 14px;font-size:11px;font-weight:800;letter-spacing:.06em;cursor:pointer}
      .mobile-shop-panel{margin-top:8px;border:1px solid var(--border);border-radius:12px;background:rgba(15,15,18,.94);padding:12px}
      .mobile-shop-kicker{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:4px}
      .mobile-shop-panel h3{font-family:var(--fh);font-size:18px;letter-spacing:.04em;color:var(--text);margin-bottom:10px}
      .mobile-shop-list{display:grid;grid-template-columns:1fr;gap:10px}
      @media(max-width:1024px){.radio-shop-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:767px){#stashbox-radio-shop-desktop{display:none!important}}
      @media(min-width:768px){#stashbox-radio-shop-mobile{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function getMatchedProductRows(track) {
    if (!Array.isArray(productMapItems) || !productMapItems.length) return [];

    const songKey   = slugifyProductKey(track?.title);
    const artistKey = slugifyProductKey(track?.artist);
    const albumKey  = slugifyProductKey(track?.album);
    const genreKey  = slugifyProductKey(track?.genre || track?.sectionKey);

    const candidates = [
      { mapType: 'song',    mapKey: songKey },
      { mapType: 'artist',  mapKey: artistKey },
      { mapType: 'album',   mapKey: albumKey },
      { mapType: 'genre',   mapKey: genreKey },
      { mapType: 'page',    mapKey: 'radio' },
      { mapType: 'general', mapKey: 'radio-general' },
    ];

    const rows = [];
    candidates.forEach(candidate => {
      productMapItems
        .filter(item => item && item.active !== false)
        .filter(item => String(item.mapType || '').toLowerCase() === candidate.mapType)
        .filter(item => String(item.mapKey  || '').toLowerCase() === candidate.mapKey)
        .sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999))
        .forEach(item => rows.push(item));
    });

    return rows;
  }

  function mergeProductRowsToLinks(rows, limit) {
    const seen   = new Set();
    const merged = [];

    rows.forEach(row => {
      const links = Array.isArray(row.productLinks)
        ? row.productLinks
        : String(row.productLinks || '').split(/\s*\|\s*|\n|,/);

      links.forEach(link => {
        const cleanLink = String(link || '').trim();
        if (!cleanLink) return;
        const cleanForHandle = cleanLink.split('?')[0];
        const match  = cleanForHandle.match(/\/products\/([^/?#]+)/i);
        const handle = match && match[1] ? decodeURIComponent(match[1]).trim() : cleanLink;
        if (seen.has(handle)) return;
        seen.add(handle);
        merged.push({ link: cleanLink, handle, sourceRow: row });
      });
    });

    return merged.slice(0, limit || 4);
  }

  async function buildProductsFromEntries(entries) {
    const products = await Promise.all(entries.map(async entry => {
      const fallbackTitle = entry.handle
        ? entry.handle.replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase())
        : 'Stashbox Product';

      const fallback = {
        title: fallbackTitle,
        url:   entry.link || `https://stashbox.ai/products/${entry.handle}`,
        handle: entry.handle,
        image: '', price: '', compareAtPrice: ''
      };

      try {
        const res = await fetch(`https://stashbox.ai/products/${entry.handle}.js`, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data    = await res.json();
        const variant = Array.isArray(data.variants) && data.variants.length ? data.variants[0] : null;
        return {
          title:          data.title || fallback.title,
          url:            entry.link || `https://stashbox.ai/products/${entry.handle}`,
          handle:         entry.handle,
          image:          data.featured_image || (Array.isArray(data.images) && data.images[0]) || '',
          price:          variant?.price         ? fmt(variant.price)          : '',
          compareAtPrice: variant?.compare_at_price ? fmt(variant.compare_at_price) : ''
        };
      } catch (_) {
        return fallback;
      }
    }));

    return products.filter(Boolean).slice(0, 4);
  }

  function fmt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? '$' + n.toFixed(2) : '';
  }

  function renderProductCardHtml(product, productRow) {
    const title          = escapeHtml(product.title || 'Stashbox Product');
    const url            = escapeHtml(product.url || '#');
    const image          = product.image ? escapeHtml(product.image) : '';
    const price          = escapeHtml(product.price || '');
    const compareAtPrice = escapeHtml(product.compareAtPrice || '');
    const cta            = escapeHtml(productRow?.merchCtaText || 'Shop Now');
    const hasSale        = price && compareAtPrice && price !== compareAtPrice;

    return `<a class="radio-shop-card" href="${url}" target="_blank" rel="noopener noreferrer">
      <div class="radio-shop-img-wrap">
        ${image
          ? `<img class="radio-shop-img" src="${image}" alt="${title}" loading="lazy">`
          : `<div class="radio-shop-img-fallback">SB</div>`}
      </div>
      <div class="radio-shop-card-title">${title}</div>
      <div class="radio-shop-card-price">
        ${hasSale ? `<span class="radio-shop-compare">${compareAtPrice}</span>` : ''}
        ${price ? `<strong>${price}</strong>` : '<span class="radio-shop-no-price">Shop on Stashbox.ai</span>'}
      </div>
      <span class="radio-shop-card-cta">${cta}</span>
    </a>`;
  }

  function renderDesktopShop(productRow, products) {
    const mount = document.getElementById(DESKTOP_MOUNT);
    if (!mount) return;
    mount.innerHTML = `<div class="radio-shop-preview">
      <div class="radio-shop-kicker">STASHBOX SHOP</div>
      <div class="radio-shop-title">${escapeHtml(productRow.merchHeadline || 'Shop This Track')}</div>
      <div class="radio-shop-subtitle">Products open in a new tab — playback keeps going.</div>
      <div class="radio-shop-grid">${products.map(p => renderProductCardHtml(p, productRow)).join('')}</div>
    </div>`;
    mount.hidden = false;
  }

  function renderMobileShop(productRow, products) {
    const mount = document.getElementById(MOBILE_MOUNT);
    if (!mount) return;
    mount.innerHTML = `<div class="mobile-shop-drawer">
      <button class="mobile-shop-toggle" type="button">
        <span>SHOP</span><strong>${products.length} items</strong>
      </button>
      <div class="mobile-shop-panel">
        <div class="mobile-shop-kicker">STASHBOX MERCH</div>
        <h3>${escapeHtml(productRow.merchHeadline || 'Shop This Track')}</h3>
        <div class="mobile-shop-list">${products.map(p => renderProductCardHtml(p, productRow)).join('')}</div>
      </div>
    </div>`;

    // toggle drawer
    const btn   = mount.querySelector('.mobile-shop-toggle');
    const panel = mount.querySelector('.mobile-shop-panel');
    if (btn && panel) {
      btn.addEventListener('click', () => {
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'block';
      });
    }
  }

  function renderFallback() {
    const row     = { merchHeadline: 'Shop This Track', merchCtaText: 'Shop Now' };
    const product = [{ title: 'Stashbox Product', url: 'https://stashbox.ai/products/unisex-heavy-cotton-tee-2', image: '', price: '', compareAtPrice: '' }];
    renderDesktopShop(row, product);
    renderMobileShop(row, product);
  }

  async function updateRadioMerch(track) {
    if (!Array.isArray(productMapItems) || !productMapItems.length) {
      await fetchProductMap();
    }
    if (!Array.isArray(productMapItems) || !productMapItems.length) return;

    const rows    = getMatchedProductRows(track);
    const entries = mergeProductRowsToLinks(rows, 4);
    if (!entries.length) return;

    const displayRow = rows[0] || { merchHeadline: 'Official Stashbox Merch', merchCtaText: 'Shop Now' };
    const products   = await buildProductsFromEntries(entries);
    if (!products.length) return;

    renderDesktopShop(displayRow, products);
    renderMobileShop(displayRow, products);
  }

  async function renderDefaultRadioMerch() {
    const productRow =
      productMapItems.find(i => i.mapType === 'page'    && i.mapKey === 'radio') ||
      productMapItems.find(i => i.mapType === 'general' && i.mapKey === 'radio-general') ||
      productMapItems[0];

    if (!productRow) { renderFallback(); return; }

    const entries  = mergeProductRowsToLinks([productRow], 4);
    const products = await buildProductsFromEntries(entries);
    if (!products.length) { renderFallback(); return; }

    renderDesktopShop(productRow, products);
    renderMobileShop(productRow, products);
  }

  async function fetchProductMap() {
    try {
      const res = await fetch(PRODUCT_MAP_ENDPOINT, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data    = await res.json();
      productMapItems = Array.isArray(data.items) ? data.items : [];
      productMapReady = true;

      if (!productMapItems.length) { renderFallback(); return; }

      // If a track is already playing when the map loads, render for it.
      const track = window.currentTrack || currentTrack;
      if (track) {
        await updateRadioMerch(track);
      } else {
        await renderDefaultRadioMerch();
      }
    } catch (err) {
      console.warn('[shop1] fetchProductMap failed:', err);
      renderFallback();
    }
  }

  // ── Main ──
  async function init() {
    injectStyles();

    await fetchProductMap();

    // Listen for track changes dispatched by the radio HTML.
    window.addEventListener('stashbox:trackchange', function (e) {
      safe(async () => {
        currentTrack = e?.detail?.track || null;
        if (!productMapReady) return;
        await updateRadioMerch(currentTrack);
      });
    });
  }

  safe(init);
})();
