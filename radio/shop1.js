(function () {
  'use strict';

  const BUILD = 'shop5-fix-002';
  console.log('[shop4] BUILD ' + BUILD + ' loaded');

  const PRODUCT_MAP_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwCczmnIAXramvgZhmc1lsxWeU449_Q3hjh3OLS0oEPXi4d6OOv9hrLYESWJJH7JrQcFQ/exec?type=productMap';
  const TRACKING_ENDPOINT    = 'https://script.google.com/macros/s/AKfycbwCczmnIAXramvgZhmc1lsxWeU449_Q3hjh3OLS0oEPXi4d6OOv9hrLYESWJJH7JrQcFQ/exec';
  const DESKTOP_MOUNT = 'stashbox-radio-shop-desktop';
  const MOBILE_MOUNT  = 'stashbox-radio-shop-mobile';

  let productMapItems   = [];
  let productMapReady   = false;
  let currentTrack      = null;
  let allStoreProducts  = null; // cached once per session
  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };

  // ── Product tracking ─────────────────────────────────────────────
  const viewedRows  = new Set(); // prevent double-counting views per page load
  const clickedRows = new Set(); // prevent double-counting clicks per page load

  function sendTrackingEvent(type, rowNumber) {
    if (!rowNumber) return;
    const key = type + ':' + rowNumber;
    if (type === 'view'  && viewedRows.has(key))  return;
    if (type === 'click' && clickedRows.has(key)) return;
    if (type === 'view')  viewedRows.add(key);
    if (type === 'click') clickedRows.add(key);
    // Use GET with URL params — POST bodies are dropped by Google's 302 redirect
    const url = TRACKING_ENDPOINT + '?type=product_' + encodeURIComponent(type) + '&rowNumber=' + encodeURIComponent(rowNumber);
    fetch(url, { method: 'GET', cache: 'no-store', keepalive: true }).catch(() => {});
    console.log('[shop5] tracked', type, 'row', rowNumber);
  }

  function setupDesktopTracking(mount) {
    const cards = mount ? mount.querySelectorAll('.radio-shop-card[data-row]') : [];
    if (!cards.length) return;

    // IntersectionObserver — fire "view" once card is 50% visible
    if (window.IntersectionObserver) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            sendTrackingEvent('view', entry.target.dataset.row);
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.5 });
      cards.forEach(card => observer.observe(card));
    }

    // Click tracking
    cards.forEach(card => {
      card.addEventListener('click', function () {
        sendTrackingEvent('click', this.dataset.row);
      }, { once: true });
    });
  }

  // ── Diagnostic panel ──────────────────────────────────────────────
  // Inserted as a SIBLING after the mount (not inside it) so innerHTML
  // wipes on the mount never destroy it.
  function renderDiag(data) {
    let box = document.getElementById('shop4-diag');
    if (!box) {
      box = document.createElement('div');
      box.id = 'shop4-diag';
      box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#0a1628;border-top:2px solid #f0a500;font:11px/1.6 monospace;color:#f0a500;';
      // Toggle button
      const btn = document.createElement('button');
      btn.id = 'shop4-diag-toggle';
      btn.textContent = '▲ DIAG';
      btn.style.cssText = 'position:absolute;top:-28px;right:8px;background:#0a1628;border:1px solid #f0a500;color:#f0a500;font:700 10px monospace;padding:3px 8px;cursor:pointer;border-bottom:none;';
      let collapsed = false;
      const body = document.createElement('div');
      body.id = 'shop4-diag-body';
      body.style.cssText = 'max-height:35vh;overflow-y:auto;padding:10px 14px;white-space:pre-wrap;word-break:break-all;';
      btn.addEventListener('click', () => {
        collapsed = !collapsed;
        body.style.display = collapsed ? 'none' : 'block';
        btn.textContent = collapsed ? '▼ DIAG' : '▲ DIAG';
      });
      box.appendChild(btn);
      box.appendChild(body);
      document.body.appendChild(box);
    }
    const body = document.getElementById('shop4-diag-body');
    if (!body) return;
    body.textContent = [
      'BUILD: ' + BUILD,
      'spreadsheet rows: ' + data.totalRows,
      'general pool size: ' + data.poolSize,
      'track: "' + data.trackTitle + '"',
      'seed: "' + data.seed + '"',
      'offset: ' + data.offset + ' (of ' + data.poolSize + ')',
      'selected handles:',
      data.selected.map((h, i) => '  ' + (i+1) + '. ' + h).join('\n'),
      '─── all pool handles ───',
      data.pool.map((h, i) => '  ' + (i+1) + '. ' + h).join('\n'),
    ].join('\n');
  }

  // ── Hash & rotate ─────────────────────────────────────────────────
  function hashSeed(seed) {
    let s = 0;
    const str = String(seed || '');
    for (let i = 0; i < str.length; i++) s = ((s << 5) - s + str.charCodeAt(i)) | 0;
    return (s >>> 0) || 1;
  }

  function rotateByOffset(arr, seed) {
    if (!arr.length) return arr;
    const offset = hashSeed(seed) % arr.length;
    return arr.slice(offset).concat(arr.slice(0, offset));
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function slugifyProductKey(value) {
    return String(value || '').trim().toLowerCase()
      .replace(/['"]/g, '').replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  const escapeHtml = v => String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

  function extractLinksFromRow(row) {
    const raw = row.productLinks;
    const links = Array.isArray(raw) ? raw.slice() : String(raw || '').split(/\s*\|\s*|\n|,/);
    const out = [];
    links.forEach(link => {
      const cleanLink = String(link || '').trim();
      if (!cleanLink) return;
      // Accept full URLs with /products/ path
      const urlMatch = cleanLink.split('?')[0].match(/\/products\/([^/?#\s]+)/i);
      if (urlMatch && urlMatch[1]) {
        out.push({ link: cleanLink, handle: decodeURIComponent(urlMatch[1]).trim(), sourceRow: row });
        return;
      }
      // Also accept bare handles (no URL path) — anything without a slash
      const bareHandle = cleanLink.replace(/^https?:\/\/[^/]+\//, '').trim();
      if (bareHandle && !bareHandle.includes('/')) {
        out.push({ link: `https://stashbox.ai/products/${bareHandle}`, handle: bareHandle, sourceRow: row });
      }
    });
    return out;
  }

  // Expose globals synchronously
  window.shopDebugPanel    = function () {};
  window.slugifyProductKey = slugifyProductKey;
  window.updateRadioMerch  = function (track) { safe(async () => { await updateRadioMerch(track); }); };

  // ── Styles ────────────────────────────────────────────────────────
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
      .radio-shop-img-wrap{aspect-ratio:1/1;min-height:130px;border-radius:10px;overflow:hidden;background:#0f0f12;display:flex;align-items:center;justify-content:center}
      .radio-shop-img{width:100%;height:100%;object-fit:cover;display:block}
      .radio-shop-img-fallback{display:none;font-weight:800;font-size:14px;color:var(--accent)}
      .radio-shop-img-wrap:not(:has(img)) .radio-shop-img-fallback{display:flex}
      .radio-shop-img-wrap.image-failed .radio-shop-img-fallback{display:flex}
      .radio-shop-card-title{font-size:13px;font-weight:600;line-height:1.3;color:var(--text)}
      .radio-shop-card-price{font-size:12px;font-weight:700;color:var(--muted);margin-top:2px}
      .radio-shop-compare{text-decoration:line-through;opacity:.7;margin-right:6px}
      .radio-shop-no-price{font-weight:400;font-size:11px}
      .radio-shop-card-cta{margin-top:auto;height:30px;border-radius:999px;border:1px solid rgba(240,165,0,.35);background:rgba(240,165,0,.12);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;letter-spacing:.04em}
      .mobile-shop-section{margin:18px 16px calc(28px + var(--safe-b));padding:14px 0 4px;border-top:1px solid var(--border)}
      .mobile-shop-headline{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:0 2px 12px}
      .mobile-shop-kicker{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
      .mobile-shop-headline h3{font-family:var(--fh);font-size:24px;line-height:1;letter-spacing:.04em;color:var(--text);margin-top:4px}
      .mobile-shop-headline span{color:var(--accent);font-size:12px;font-weight:800;white-space:nowrap}
      .mobile-shop-carousel{display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:0 2px 10px;scrollbar-width:none}
      .mobile-shop-carousel::-webkit-scrollbar{display:none}
      .mobile-shop-carousel .radio-shop-card{flex:0 0 calc(50% - 6px);scroll-snap-align:start;min-width:calc(50% - 6px)}
      .radio-shop-card{min-height:100%}
      @media(max-width:767px){#stashbox-radio-shop-desktop{display:none!important}}
      @media(min-width:768px){#stashbox-radio-shop-mobile{display:none!important}}
    `;
    document.head.appendChild(style);
  }

  // ── Core selection logic ──────────────────────────────────────────
  function selectProducts(track, limit) {
    const max     = limit || 4;
    const seed    = slugifyProductKey(track?.title || '');
    const specificTypes = new Set(['song', 'artist', 'album', 'genre']);

    // Specific matches for this track (song/artist/album/genre)
    const songKey   = slugifyProductKey(track?.title);
    const artistKey = slugifyProductKey(track?.artist);
    const albumKey  = slugifyProductKey(track?.album);
    const genreKey  = slugifyProductKey(track?.genre || track?.sectionKey);
    const candidates = [
      { mapType:'song',   mapKey:songKey   },
      { mapType:'artist', mapKey:artistKey },
      { mapType:'album',  mapKey:albumKey  },
      { mapType:'genre',  mapKey:genreKey  },
    ];

    const specificEntries = [];
    const specificSeen = new Set();
    candidates.forEach(c => {
      productMapItems
        .filter(item => item && item.active !== false)
        .filter(item => String(item.mapType||'').toLowerCase() === c.mapType && String(item.mapKey||'').toLowerCase() === c.mapKey)
        .sort((a, b) => (Number(a.priority)||999) - (Number(b.priority)||999))
        .forEach(item => extractLinksFromRow(item).forEach(e => {
          if (!specificSeen.has(e.handle)) { specificSeen.add(e.handle); specificEntries.push(e); }
        }));
    });

    // General pool = ALL non-specific rows flattened
    const rawPool = [];
    productMapItems
      .filter(item => item && item.active !== false)
      .filter(item => !specificTypes.has(String(item.mapType||'').toLowerCase()))
      .forEach(item => extractLinksFromRow(item).forEach(e => rawPool.push(e)));

    // Deduplicate the raw pool
    const poolSeen = new Set();
    const dedupedPool = [];
    rawPool.forEach(e => {
      if (!poolSeen.has(e.handle)) { poolSeen.add(e.handle); dedupedPool.push(e); }
    });

    // Rotate pool by song-title seed so different songs start at different positions
    const rotatedPool = seed && dedupedPool.length > 1 ? rotateByOffset(dedupedPool, seed) : dedupedPool;
    const offset = (seed && dedupedPool.length > 1) ? hashSeed(seed) % dedupedPool.length : 0;

    // Build final list: specifics first, then fill from rotated pool
    const finalSeen = new Set(specificEntries.map(e => e.handle));
    const merged = specificEntries.slice(0, max);
    for (const entry of rotatedPool) {
      if (merged.length >= max) break;
      if (finalSeen.has(entry.handle)) continue;
      finalSeen.add(entry.handle);
      merged.push(entry);
    }

    // Diagnostic data
    const diagData = {
      totalRows:  productMapItems.length,
      poolSize:   dedupedPool.length,
      trackTitle: track?.title || '(none)',
      seed,
      offset,
      pool:     dedupedPool.map(e => e.handle),
      selected: merged.map(e => e.handle),
    };
    console.log('[shop4] selectProducts diag:', diagData);
    renderDiag(diagData);

    return { entries: merged, displayRow: merged[0]?.sourceRow || { merchHeadline:'Shop This Track', merchCtaText:'Shop Now' } };
  }

  // ── Shopify product fetch ─────────────────────────────────────────
  function fmt(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const n = Number(raw);
    if (!Number.isFinite(n)) return '';
    const normalized = /^-?\d+$/.test(raw) ? n / 100 : n;
    return '$' + normalized.toFixed(2);
  }

  async function buildProductsFromEntries(entries) {
    const products = await Promise.all(entries.slice(0, 4).map(async entry => {
      const cleanHandle = String(entry.handle || '').trim();
      const url = entry.link || `https://stashbox.ai/products/${cleanHandle}`;
      const fallback = {
        title: cleanHandle ? cleanHandle.replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : 'Stashbox Product',
        url, handle: cleanHandle, image: '', price: '', compareAtPrice: ''
      };
      try {
        const res = await fetch(`https://stashbox.ai/products/${encodeURIComponent(cleanHandle)}.js`, { method:'GET', cache:'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data    = await res.json();
        const variant = Array.isArray(data.variants) && data.variants.length ? data.variants[0] : null;
        let image = '';
        if (typeof data.featured_image === 'string') image = data.featured_image;
        else if (data.featured_image?.src) image = data.featured_image.src;
        else if (Array.isArray(data.images) && data.images.length) image = typeof data.images[0] === 'string' ? data.images[0] : (data.images[0]?.src || '');
        else if (data.image?.src) image = data.image.src;
        if (image && image.startsWith('//')) image = 'https:' + image;
        return { title: data.title || fallback.title, url, handle: cleanHandle, image, price: variant?.price ? fmt(variant.price) : '', compareAtPrice: variant?.compare_at_price ? fmt(variant.compare_at_price) : '' };
      } catch (err) {
        console.warn('[shop4] Shopify .js failed:', cleanHandle, err);
        return fallback;
      }
    }));
    return products.filter(Boolean);
  }

  // ── Render ────────────────────────────────────────────────────────
  function renderProductCardHtml(product, productRow) {
    const title = escapeHtml(product.title || 'Stashbox Product');
    const url   = escapeHtml(product.url || '#');
    const image = product.image ? escapeHtml(product.image) : '';
    const price = escapeHtml(product.price || '');
    const cap   = escapeHtml(product.compareAtPrice || '');
    const cta   = escapeHtml(productRow?.merchCtaText || 'Shop Now');
    const sale  = price && cap && price !== cap;
    const rowAttr = productRow?.rowNumber ? ` data-row="${productRow.rowNumber}"` : '';
    return `<a class="radio-shop-card" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Open product: ${title}"${rowAttr}>
      <div class="radio-shop-img-wrap">
        ${image ? `<img class="radio-shop-img" src="${image}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('image-failed');">` : ''}
        <div class="radio-shop-img-fallback">SB</div>
      </div>
      <div class="radio-shop-card-title">${title}</div>
      <div class="radio-shop-card-price">
        ${sale ? `<span class="radio-shop-compare">${cap}</span>` : ''}
        ${price ? `<strong>${price}</strong>` : '<span class="radio-shop-no-price">Shop on Stashbox.ai</span>'}
      </div>
      <span class="radio-shop-card-cta">${cta}</span>
    </a>`;
  }

  function renderDesktopShop(displayRow, products) {
    const mount = document.getElementById(DESKTOP_MOUNT);
    if (!mount) return;
    mount.innerHTML = `<div class="radio-shop-preview">
      <div class="radio-shop-kicker">STASHBOX SHOP</div>
      <div class="radio-shop-title">${escapeHtml(displayRow.merchHeadline || 'Shop This Track')}</div>
      <div class="radio-shop-subtitle">Products open in a new tab — playback keeps going.</div>
      <div class="radio-shop-grid">${products.map(p => renderProductCardHtml(p, displayRow)).join('')}</div>
    </div>`;
    mount.hidden = false;
    setupDesktopTracking(mount);
  }

  // Legacy function — always delegates to full store carousel now
  function renderMobileShop() {
    getStoreProducts().then(storeProducts => {
      renderMobileShopFromStore(currentTrack, storeProducts);
    });
  }

  // ── Shopify store: fetch all products for mobile carousel ─────────
  async function getStoreProducts() {
    if (allStoreProducts) return allStoreProducts;
    try {
      const res = await fetch('https://stashbox.ai/products.json?limit=250', { cache: 'default' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      allStoreProducts = Array.isArray(data.products) ? data.products : [];
    } catch (err) {
      console.warn('[shop4] getStoreProducts failed:', err);
      allStoreProducts = [];
    }
    return allStoreProducts;
  }

  function renderMobileProductCard(p) {
    const title = escapeHtml(p.title || 'Stashbox Product');
    const url   = escapeHtml('https://stashbox.ai/products/' + (p.handle || ''));
    const img   = p.images && p.images[0] ? escapeHtml(String(p.images[0].src || '')) : '';
    const v     = p.variants && p.variants[0];
    const price = v && v.price   ? '$' + parseFloat(v.price).toFixed(2)           : '';
    const comp  = v && v.compare_at_price ? '$' + parseFloat(v.compare_at_price).toFixed(2) : '';
    const sale  = price && comp && price !== comp;
    return `<a class="radio-shop-card" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Open product: ${title}">
      <div class="radio-shop-img-wrap">
        ${img ? `<img class="radio-shop-img" src="${img}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('image-failed');">` : ''}
        <div class="radio-shop-img-fallback">SB</div>
      </div>
      <div class="radio-shop-card-title">${title}</div>
      <div class="radio-shop-card-price">
        ${sale ? `<span class="radio-shop-compare">${escapeHtml(comp)}</span>` : ''}
        ${price ? `<strong>${escapeHtml(price)}</strong>` : '<span class="radio-shop-no-price">Shop on Stashbox.ai</span>'}
      </div>
      <span class="radio-shop-card-cta">Shop Now</span>
    </a>`;
  }

  function renderMobileShopFromStore(track, storeProducts) {
    const mount = document.getElementById(MOBILE_MOUNT);
    if (!mount) return;
    if (!storeProducts.length) return; // leave whatever was there
    const seed    = slugifyProductKey(track?.title || '');
    const rotated = seed && storeProducts.length > 1 ? rotateByOffset(storeProducts, seed) : storeProducts;
    mount.innerHTML = `<section class="mobile-shop-section">
      <div class="mobile-shop-headline">
        <div>
          <div class="mobile-shop-kicker">STASHBOX MERCH</div>
          <h3>Shop This Track</h3>
        </div>
        <span>${rotated.length} items</span>
      </div>
      <div class="mobile-shop-carousel">
        ${rotated.map(p => renderMobileProductCard(p)).join('')}
      </div>
    </section>`;
  }

  // ── Desktop-only fallback — NEVER touches mobile ─────────────────
  // Mobile always uses getStoreProducts() → renderMobileShopFromStore()
  function renderFallback() {
    const fallbackEntries = [
      { link:'https://stashbox.ai/products/unisex-heavy-cotton-tee-stashbox-drinking-fire-001', handle:'unisex-heavy-cotton-tee-stashbox-drinking-fire-001' },
      { link:'https://stashbox.ai/products/stashbox-guitar-design-026',                        handle:'stashbox-guitar-design-026' },
      { link:'https://stashbox.ai/products/stashbox-guitar-design-026-tank-top-no-background',  handle:'stashbox-guitar-design-026-tank-top-no-background' },
      { link:'https://stashbox.ai/products/crusty-gnome-vol-9-stashbox-pint-glass',            handle:'crusty-gnome-vol-9-stashbox-pint-glass' },
    ];
    renderDiag({ totalRows: productMapItems.length, poolSize: 0, trackTitle:'(desktop-fallback)', seed:'', offset:0, pool:[], selected: fallbackEntries.map(e=>e.handle) });
    const row = { merchHeadline:'Shop This Track', merchCtaText:'Shop Now' };
    buildProductsFromEntries(fallbackEntries).then(products => {
      renderDesktopShop(row, products);
      // Mobile NOT touched here — it runs independently via renderMobileShopFromStore
    });
  }

  // ── Main update ───────────────────────────────────────────────────
  async function updateRadioMerch(track) {
    currentTrack = track || window.currentTrack || currentTrack;

    // ── DESKTOP: productMap curated 4 — await this fully before touching mobile
    try {
      if (!Array.isArray(productMapItems) || !productMapItems.length) await fetchProductMap();
      if (!Array.isArray(productMapItems) || !productMapItems.length) {
        renderFallback();
      } else {
        const { entries, displayRow } = selectProducts(currentTrack, 4);
        if (!entries.length) {
          renderFallback();
        } else {
          const products = await buildProductsFromEntries(entries);
          if (!products.length) { renderFallback(); } else { renderDesktopShop(displayRow, products); }
        }
      }
    } catch (err) {
      console.error('[shop5] desktop merch failed:', err);
      renderFallback();
    }

    // ── MOBILE: runs LAST so nothing can overwrite it afterward
    getStoreProducts().then(storeProducts => {
      renderMobileShopFromStore(currentTrack, storeProducts);
    });
  }

  async function fetchProductMap() {
    try {
      console.log('[shop4] fetching productMap...');
      const res = await fetch(PRODUCT_MAP_ENDPOINT, { cache:'no-store' });
      const rawText = await res.text();
      console.log('[shop4] raw response status:', res.status);
      console.log('[shop4] raw response body:', rawText);

      // Show raw API response in diag so we can see exactly what the endpoint returns
      const diagBody = document.getElementById('shop4-diag-body');
      if (diagBody) diagBody.textContent = 'BUILD: ' + BUILD + '\nAPI status: ' + res.status + '\nAPI response:\n' + rawText.slice(0, 2000);

      if (!res.ok) throw new Error('HTTP ' + res.status);
      let data;
      try { data = JSON.parse(rawText); } catch(e) { throw new Error('JSON parse failed: ' + e.message); }
      productMapItems = Array.isArray(data.items) ? data.items : [];
      productMapReady = true;
      console.log('[shop4] productMap loaded. rows:', productMapItems.length);
      if (!productMapItems.length) return renderFallback();
      const track = window.currentTrack || currentTrack;
      if (track) await updateRadioMerch(track);
      else {
        // No track yet — show desktop pool preview, mobile handled separately
        const { entries, displayRow } = selectProducts({}, 4);
        if (entries.length) {
          const products = await buildProductsFromEntries(entries);
          if (products.length) { renderDesktopShop(displayRow, products); return; }
        }
        renderFallback();
      }
    } catch (err) {
      console.warn('[shop4] fetchProductMap failed:', err);
      renderFallback();
    }
  }

  async function init() {
    injectStyles();
    await fetchProductMap();
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
