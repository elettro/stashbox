(function () {
  'use strict';
  console.log('[shop2 merch] BUILD shop2-products-4-images-001 loaded');

  const PRODUCT_MAP_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwCczmnIAXramvgZhmc1lsxWeU449_Q3hjh3OLS0oEPXi4d6OOv9hrLYESWJJH7JrQcFQ/exec?type=productMap';
  const DESKTOP_MOUNT = 'stashbox-radio-shop-desktop';
  const MOBILE_MOUNT = 'stashbox-radio-shop-mobile';
  const DEBUG_MERCH = new URLSearchParams(window.location.search).get('debugMerch') === '1';

  function merchLog() { if (DEBUG_MERCH) console.log.apply(console, ['[shop2 merch]'].concat(Array.from(arguments))); }
  let productMapItems = [];
  let productMapReady = false;
  let currentTrack = null;
  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };

  function shopDebugPanel(message, data) {
    let box = document.getElementById('shop-debug-panel');
    if (!box) {
      box = document.createElement('div'); box.id = 'shop-debug-panel';
      box.style.cssText = 'margin:12px 0;padding:10px;border:1px solid #f0a500;color:#f0a500;background:#111;font:12px monospace;white-space:pre-wrap;border-radius:8px;';
      const mount = document.getElementById(DESKTOP_MOUNT) || document.getElementById('dp');
      if (mount) mount.prepend(box); else document.body.prepend(box);
    }
    box.textContent = message + (data ? '\n' + JSON.stringify(data, null, 2) : '');
  }

  function slugifyProductKey(value) {
    return String(value || '').trim().toLowerCase().replace(/['"]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  window.shopDebugPanel = shopDebugPanel;
  window.slugifyProductKey = slugifyProductKey;
  window.updateRadioMerch = function (track) { safe(async () => { await updateRadioMerch(track); }); };

  function showBuildBadge(message) {
    let badge = document.getElementById('shop2-build-badge');
    if (!badge) {
      badge = document.createElement('div');
      badge.id = 'shop2-build-badge';
      badge.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;background:#111;color:#f0a500;border:1px solid #f0a500;border-radius:10px;padding:8px 10px;font:12px monospace;';
      document.body.appendChild(badge);
    }
    badge.textContent = message;
  }

  function injectStyles() {
    if (document.getElementById('stashbox-radio-shop-widget-style')) return;
    const style = document.createElement('style');
    style.id = 'stashbox-radio-shop-widget-style';
    style.textContent = `.radio-shop-preview{margin-top:12px;padding:14px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.02)}.radio-shop-kicker{font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);margin-bottom:4px}.radio-shop-title{font-family:var(--fh);font-size:20px;letter-spacing:.04em;color:var(--text);margin-bottom:2px}.radio-shop-subtitle{font-size:11px;color:var(--muted);margin-bottom:12px}.radio-shop-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.radio-shop-card{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--border);border-radius:12px;background:#14141a;color:inherit;text-decoration:none;transition:border-color .15s}.radio-shop-card:hover{border-color:var(--border-h)}.radio-shop-img-wrap{aspect-ratio:1/1;min-height:130px;border-radius:10px;overflow:hidden;background:#0f0f12;display:flex;align-items:center;justify-content:center}.radio-shop-img{width:100%;height:100%;object-fit:cover;display:block}.radio-shop-img-fallback{display:none;font-weight:800;font-size:14px;color:var(--accent)}.radio-shop-img-wrap:not(:has(img)) .radio-shop-img-fallback{display:flex}.radio-shop-img-wrap.image-failed .radio-shop-img-fallback{display:flex}.radio-shop-card-title{font-size:13px;font-weight:600;line-height:1.3;color:var(--text)}.radio-shop-card-price{font-size:12px;font-weight:700;color:var(--muted);margin-top:2px}.radio-shop-compare{text-decoration:line-through;opacity:.7;margin-right:6px}.radio-shop-no-price{font-weight:400;font-size:11px}.radio-shop-card-cta{margin-top:auto;height:30px;border-radius:999px;border:1px solid rgba(240,165,0,.35);background:rgba(240,165,0,.12);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;letter-spacing:.04em}.mobile-shop-section{margin:18px 16px calc(28px + var(--safe-b));padding:14px 0 4px;border-top:1px solid var(--border)}.mobile-shop-headline{display:flex;align-items:end;justify-content:space-between;gap:12px;padding:0 2px 12px}.mobile-shop-kicker{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}.mobile-shop-headline h3{font-family:var(--fh);font-size:24px;line-height:1;letter-spacing:.04em;color:var(--text);margin-top:4px}.mobile-shop-headline span{color:var(--accent);font-size:12px;font-weight:800;white-space:nowrap}.mobile-shop-carousel{display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;padding:0 2px 10px;scrollbar-width:none}.mobile-shop-carousel::-webkit-scrollbar{display:none}.mobile-shop-carousel .radio-shop-card{flex:0 0 calc(50% - 6px);scroll-snap-align:start;min-width:calc(50% - 6px)}.mobile-shop-carousel .radio-shop-card-title{font-size:12px;line-height:1.25}.mobile-shop-carousel .radio-shop-card-cta{height:28px;font-size:10px}.mobile-shop-carousel .radio-shop-img-wrap{min-height:0;aspect-ratio:1 / 1}.radio-shop-card{min-height:100%}@media(max-width:1024px){.radio-shop-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}@media(max-width:767px){#stashbox-radio-shop-desktop{display:none!important}}@media(min-width:768px){#stashbox-radio-shop-mobile{display:none!important}}`;
    document.head.appendChild(style);
  }

  const escapeHtml = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  function getProductRowsForFourCards(track) { /* exact */
    if (!Array.isArray(productMapItems) || !productMapItems.length) return [];
    const songKey = slugifyProductKey(track?.title), artistKey = slugifyProductKey(track?.artist), albumKey = slugifyProductKey(track?.album), genreKey = slugifyProductKey(track?.genre || track?.sectionKey);
    const candidates = [{ mapType: 'song', mapKey: songKey }, { mapType: 'artist', mapKey: artistKey }, { mapType: 'album', mapKey: albumKey }, { mapType: 'genre', mapKey: genreKey }, { mapType: 'page', mapKey: 'radio' }, { mapType: 'general', mapKey: 'radio-general' }];
    const rows = []; const seen = new Set();
    candidates.forEach(candidate => { productMapItems.filter(item => item && item.active !== false).filter(item => String(item.mapType || '').toLowerCase() === candidate.mapType).filter(item => String(item.mapKey || '').toLowerCase() === candidate.mapKey).sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999)).forEach(item => { const key = `${item.rowNumber || ''}:${item.mapType}:${item.mapKey}`; if (seen.has(key)) return; seen.add(key); rows.push(item); }); });
    if (rows.length < 2) { productMapItems.filter(item => item && item.active !== false).sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999)).forEach(item => { const key = `${item.rowNumber || ''}:${item.mapType}:${item.mapKey}`; if (seen.has(key)) return; seen.add(key); rows.push(item); }); }
    return rows;
  }

  function mergeProductRowsToLinks(rows, limit) { const seen = new Set(), merged = [], max = limit || 4; rows.forEach(row => { const links = Array.isArray(row.productLinks) ? row.productLinks : String(row.productLinks || '').split(/\s*\|\s*|\n|,/); links.forEach(link => { const cleanLink = String(link || '').trim(); if (!cleanLink) return; const match = cleanLink.split('?')[0].match(/\/products\/([^/?#]+)/i); const handle = match && match[1] ? decodeURIComponent(match[1]).trim() : ''; if (!handle || seen.has(handle)) return; seen.add(handle); merged.push({ link: cleanLink, handle, sourceRow: row }); }); }); merchLog('merged product entries', merged); return merged.slice(0, max); }

  function fmt(value) { const n = Number(value); return Number.isFinite(n) ? '$' + n.toFixed(2) : ''; }

  async function buildProductsFromEntries(entries) {
    const products = await Promise.all(entries.slice(0, 4).map(async entry => {
      const cleanHandle = String(entry.handle || '').trim();
      const url = entry.link || `https://stashbox.ai/products/${cleanHandle}`;
      const fallback = { title: cleanHandle ? cleanHandle.replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) : 'Stashbox Product', url, handle: cleanHandle, image: '', price: '', compareAtPrice: '' };
      try {
        const res = await fetch(`https://stashbox.ai/products/${encodeURIComponent(cleanHandle)}.js`, { method: 'GET', cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json(); const variant = Array.isArray(data.variants) && data.variants.length ? data.variants[0] : null; let image = '';
        if (typeof data.featured_image === 'string') image = data.featured_image; else if (data.featured_image && data.featured_image.src) image = data.featured_image.src; else if (Array.isArray(data.images) && data.images.length) image = typeof data.images[0] === 'string' ? data.images[0] : data.images[0]?.src || ''; else if (data.image && data.image.src) image = data.image.src;
        if (image && image.startsWith('//')) image = 'https:' + image;
        return { title: data.title || fallback.title, url, handle: cleanHandle, image, price: variant && variant.price ? fmt(variant.price) : '', compareAtPrice: variant && variant.compare_at_price ? fmt(variant.compare_at_price) : '' };
      } catch (err) { console.warn('[shop2 merch] Shopify .js failed:', cleanHandle, err); return fallback; }
    }));
    return products.filter(Boolean);
  }

  function renderProductCardHtml(product, productRow) { const title = escapeHtml(product.title || 'Stashbox Product'), url = escapeHtml(product.url || '#'), image = product.image ? escapeHtml(product.image) : '', price = escapeHtml(product.price || ''), compareAtPrice = escapeHtml(product.compareAtPrice || ''), cta = escapeHtml(productRow?.merchCtaText || 'Shop Now'), hasSale = price && compareAtPrice && price !== compareAtPrice; return `<a class="radio-shop-card" href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Open product: ${title}"><div class="radio-shop-img-wrap">${image ? `<img class="radio-shop-img" src="${image}" alt="${title}" loading="lazy" onerror="this.style.display='none';this.parentElement.classList.add('image-failed');">` : ''}<div class="radio-shop-img-fallback">SB</div></div><div class="radio-shop-card-title">${title}</div><div class="radio-shop-card-price">${hasSale ? `<span class="radio-shop-compare">${compareAtPrice}</span>` : ''}${price ? `<strong>${price}</strong>` : '<span class="radio-shop-no-price">Shop on Stashbox.ai</span>'}</div><span class="radio-shop-card-cta">${cta}</span></a>`; }
  function renderDesktopShop(productRow, products) { const mount = document.getElementById(DESKTOP_MOUNT); if (!mount) return; mount.innerHTML = `<div class="radio-shop-preview"><div class="radio-shop-kicker">STASHBOX SHOP</div><div class="radio-shop-title">${escapeHtml(productRow.merchHeadline || 'Shop This Track')}</div><div class="radio-shop-subtitle">Products open in a new tab — playback keeps going.</div><div class="radio-shop-grid">${products.map(p => renderProductCardHtml(p, productRow)).join('')}</div></div>`; mount.hidden = false; }
  function renderMobileShop(productRow, products) { const mount = document.getElementById(MOBILE_MOUNT); if (!mount) return; mount.innerHTML = `<section class="mobile-shop-section"><div class="mobile-shop-headline"><div><div class="mobile-shop-kicker">STASHBOX MERCH</div><h3>${escapeHtml(productRow.merchHeadline || 'Shop This Track')}</h3></div><span>${products.length} items</span></div><div class="mobile-shop-carousel">${products.map(p => renderProductCardHtml(p, productRow)).join('')}</div></section>`; }

  function renderHardcodedFourProductFallback() { const fallbackEntries = [{ link: 'https://stashbox.ai/products/unisex-heavy-cotton-tee-stashbox-drinking-fire-001', handle: 'unisex-heavy-cotton-tee-stashbox-drinking-fire-001' }, { link: 'https://stashbox.ai/products/stashbox-guitar-design-026', handle: 'stashbox-guitar-design-026' }, { link: 'https://stashbox.ai/products/stashbox-guitar-design-026-tank-top-no-background', handle: 'stashbox-guitar-design-026-tank-top-no-background' }, { link: 'https://stashbox.ai/products/crusty-gnome-vol-9-stashbox-pint-glass', handle: 'crusty-gnome-vol-9-stashbox-pint-glass' }]; const row = { merchHeadline: 'Shop This Track', merchCtaText: 'Shop Now' }; buildProductsFromEntries(fallbackEntries).then(products => { renderDesktopShop(row, products); renderMobileShop(row, products); showBuildBadge('shop2 fallback rendered: ' + products.length); }); }
  function renderFallback() { renderHardcodedFourProductFallback(); }

  async function updateRadioMerch(track) { try { currentTrack = track || window.currentTrack || currentTrack; if (!Array.isArray(productMapItems) || !productMapItems.length) await fetchProductMap(); const rows = getProductRowsForFourCards(currentTrack); const entries = mergeProductRowsToLinks(rows, 4); console.log('[shop2 merch] selected rows for 4 cards:', rows); console.log('[shop2 merch] selected entries for 4 cards:', entries); if (!entries.length) return renderHardcodedFourProductFallback(); const products = await buildProductsFromEntries(entries); console.log('[shop2 merch] products rendered:', products); if (!products.length) return renderHardcodedFourProductFallback(); const displayRow = rows[0] || { merchHeadline: 'Official Stashbox Merch', merchCtaText: 'Shop Now' }; renderDesktopShop(displayRow, products.slice(0, 4)); renderMobileShop(displayRow, products.slice(0, 4)); showBuildBadge('shop2 rendered products: ' + products.length); } catch (err) { console.error('[shop2 merch] updateRadioMerch failed:', err); renderHardcodedFourProductFallback(); } }

  async function renderDefaultRadioMerch() { try { const rows = getProductRowsForFourCards(currentTrack || window.currentTrack || {}); const entries = mergeProductRowsToLinks(rows, 4); const products = await buildProductsFromEntries(entries.length ? entries : [{ link: 'https://stashbox.ai/products/unisex-heavy-cotton-tee-stashbox-drinking-fire-001', handle: 'unisex-heavy-cotton-tee-stashbox-drinking-fire-001' }]); if (!products.length) return renderFallback(); const productRow = rows[0] || { merchHeadline: 'Official Stashbox Merch', merchCtaText: 'Shop Now' }; renderDesktopShop(productRow, products.slice(0, 4)); renderMobileShop(productRow, products.slice(0, 4)); } catch (err) { console.warn('[shop2 merch] renderDefaultRadioMerch failed:', err); renderFallback(); } }

  async function fetchProductMap() { try { const res = await fetch(PRODUCT_MAP_ENDPOINT, { cache: 'no-store' }); if (!res.ok) throw new Error('HTTP ' + res.status); const data = await res.json(); productMapItems = Array.isArray(data.items) ? data.items : []; console.log('[shop2 merch] productMap raw data:', data); console.log('[shop2 merch] productMap count:', productMapItems.length); showBuildBadge('productMap loaded: ' + productMapItems.length); productMapReady = true; if (!productMapItems.length) return renderFallback(); const track = window.currentTrack || currentTrack; if (track) await updateRadioMerch(track); else await renderDefaultRadioMerch(); } catch (err) { console.warn('[shop1] fetchProductMap failed:', err); renderFallback(); } }

  async function init() { injectStyles(); showBuildBadge('shop2 widget loaded: 4 images build'); await fetchProductMap(); window.addEventListener('stashbox:trackchange', function (e) { safe(async () => { currentTrack = e?.detail?.track || null; if (!productMapReady) return; await updateRadioMerch(currentTrack); }); }); }

  safe(init);
})();
