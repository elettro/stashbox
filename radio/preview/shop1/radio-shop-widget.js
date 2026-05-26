(function () {
  'use strict';

  const PRODUCT_MAP_URL = 'https://script.google.com/macros/s/AKfycbwCczmnIAXramvgZhmc1lsxWeU449_Q3hjh3OLS0oEPXi4d6OOv9hrLYESWJJH7JrQcFQ/exec?type=productMap';
  const DESKTOP_MOUNT = 'stashbox-radio-shop-desktop';
  const MOBILE_MOUNT = 'stashbox-radio-shop-mobile';
  const DEBUG = new URLSearchParams(window.location.search).get('debugMerch') === '1';

  let productMapItems = [];

  const log = (...args) => DEBUG && console.log('[stashbox merch]', ...args);
  const safe = (fn, fallback = null) => { try { return fn(); } catch (_) { return fallback; } };
  const esc = (v) => String(v || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const slug = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');


  function injectStyles() {
    if (document.getElementById('stashbox-radio-shop-widget-style')) return;
    const style = document.createElement('style');
    style.id = 'stashbox-radio-shop-widget-style';
    style.textContent = `.radio-shop-preview{margin-top:12px;padding:14px;border:1px solid var(--border);border-radius:14px;background:rgba(255,255,255,.02)}.radio-shop-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.radio-shop-card{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--border);border-radius:12px;background:#14141a;color:inherit;text-decoration:none}.radio-shop-img-wrap{aspect-ratio:1/1;border-radius:10px;overflow:hidden;background:#0f0f12;display:flex;align-items:center;justify-content:center}.radio-shop-img{width:100%;height:100%;object-fit:cover}.radio-shop-img-fallback{font-weight:800;color:var(--accent)}.radio-shop-name{font:700 13px/1.3 var(--fb);color:var(--text)}.radio-shop-price{font:700 12px var(--fb);color:var(--muted)}.radio-shop-btn{margin-top:auto;height:32px;border-radius:999px;border:1px solid rgba(240,165,0,.35);background:rgba(240,165,0,.12);color:var(--accent);display:flex;align-items:center;justify-content:center;font:800 11px var(--fb)}.mobile-shop-drawer{margin:10px 0}.mobile-shop-toggle{width:100%;height:34px;border-radius:999px;border:1px solid rgba(240,165,0,.3);background:rgba(240,165,0,.12);color:var(--accent);display:flex;justify-content:space-between;align-items:center;padding:0 12px;font:800 11px var(--fb)}.mobile-shop-panel{margin-top:8px;border:1px solid var(--border);border-radius:12px;background:rgba(15,15,18,.94);padding:10px}.mobile-shop-list{display:grid;grid-template-columns:1fr;gap:10px}@media (max-width:1024px){.radio-shop-grid{grid-template-columns:repeat(3,minmax(0,1fr));}}@media (max-width:767px){#stashbox-radio-shop-desktop{display:none}}@media (min-width:768px){#stashbox-radio-shop-mobile{display:none}}`;
    document.head.appendChild(style);
  }

  function normalizeLinks(links) {
    if (!links) return [];
    if (Array.isArray(links)) return links.map(String).map((x) => x.trim()).filter(Boolean);
    return String(links).split(/[\n,|]/).map((x) => x.trim()).filter(Boolean);
  }

  function extractHandle(url) {
    const m = String(url || '').match(/\/products\/([^/?#]+)/i);
    return m ? m[1] : '';
  }

  function pickRow(track) {
    const candidates = [
      ['song', slug(track && track.title)],
      ['artist', slug(track && track.artist)],
      ['album', slug(track && track.album)],
      ['genre', slug((track && (track.genre || track.sectionKey)) || '')],
      ['page', 'radio'],
      ['general', 'radio-general']
    ];

    for (const [mapType, mapKey] of candidates) {
      const row = productMapItems
        .filter((item) => item && item.active !== false)
        .filter((item) => String(item.mapType || '').toLowerCase() === mapType)
        .filter((item) => String(item.mapKey || '').toLowerCase() === mapKey)
        .sort((a, b) => (Number(a.priority) || 999) - (Number(b.priority) || 999))[0];
      if (row) return row;
    }
    return null;
  }

  async function fetchShopifyProduct(handle) {
    if (!handle) return null;
    const url = `https://stashbox.ai/products/${encodeURIComponent(handle)}.js`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return res.json();
  }

  function productCard(p, href) {
    const img = p.image || p.featured_image || '';
    const title = p.title || 'Stashbox Product';
    const price = p.priceText || '';
    return `<a class="radio-shop-card" href="${esc(href || p.url || '#')}" target="_blank" rel="noopener">
      <div class="radio-shop-img-wrap">${img ? `<img class="radio-shop-img" src="${esc(img)}" alt="${esc(title)}">` : '<div class="radio-shop-img radio-shop-img-fallback">SB</div>'}</div>
      <div class="radio-shop-name">${esc(title)}</div>
      <div class="radio-shop-price">${esc(price)}</div>
      <div class="radio-shop-btn">SHOP NOW</div>
    </a>`;
  }

  function fallbackProducts() {
    return [1, 2, 3].map((i) => ({ title: `Featured Merch ${i}`, priceText: 'Shop on Stashbox.ai', image: '' }));
  }

  function renderDesktop(products) {
    const mount = document.getElementById(DESKTOP_MOUNT);
    if (!mount) return;
    mount.innerHTML = `<section class="radio-shop-preview radio-shop-desktop">
      <div class="radio-shop-head"><div><div class="radio-shop-kicker">STASHBOX SHOP</div><h2>Shop This Track</h2><p class="radio-shop-subtitle">Products are independent from radio playback.</p></div></div>
      <div class="radio-shop-grid">${products.map((p) => productCard(p.product, p.link)).join('')}</div>
    </section>`;
    log('desktop rendered');
  }

  function renderMobile(products) {
    const mount = document.getElementById(MOBILE_MOUNT);
    if (!mount) return;
    mount.innerHTML = `<section class="mobile-shop-drawer open">
      <button class="mobile-shop-toggle" type="button" aria-disabled="true"><span>SHOP</span><strong>${products.length}</strong></button>
      <div class="mobile-shop-panel" style="display:block"><div class="mobile-shop-head"><div><div class="mobile-shop-kicker">STASHBOX MERCH</div><h3>Shop This Track</h3></div></div>
      <div class="mobile-shop-list">${products.map((p) => productCard(p.product, p.link)).join('')}</div></div>
    </section>`;
    log('mobile rendered');
  }

  async function renderForTrack(track) {
    const row = pickRow(track) || null;
    log('selected row', row);
    const links = normalizeLinks(row && row.productLinks);
    const handles = links.map(extractHandle).filter(Boolean);
    log('product handles', handles);

    let products = [];
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const handle = extractHandle(link);
      if (!handle) {
        products.push({ link, product: { title: 'Stashbox Product', priceText: 'View details', image: '' } });
        continue;
      }
      try {
        const p = await fetchShopifyProduct(handle);
        products.push({
          link,
          product: {
            title: p.title,
            image: p.featured_image,
            priceText: typeof p.price === 'number' ? `$${(p.price / 100).toFixed(2)}` : 'View details',
            url: p.url
          }
        });
      } catch (e) {
        log('Shopify fetch failures', handle, e && e.message ? e.message : e);
        products.push({ link, product: { title: handle.replace(/-/g, ' '), priceText: 'View on Stashbox.ai', image: '' } });
      }
    }

    if (!products.length) {
      products = fallbackProducts().map((p) => ({ link: 'https://stashbox.ai', product: p }));
    }

    renderDesktop(products);
    renderMobile(products);
  }

  async function init() {
    log('widget loaded');
    injectStyles();
    try {
      const res = await fetch(PRODUCT_MAP_URL, { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error('productMap fetch failed');
      const data = await res.json();
      productMapItems = Array.isArray(data.items) ? data.items : [];
      log('productMap loaded', productMapItems.length);
    } catch (e) {
      productMapItems = [];
      log('productMap loaded', 'fallback mode');
    }

    renderForTrack(null).catch(() => {
      renderDesktop(fallbackProducts().map((p) => ({ link: 'https://stashbox.ai', product: p })));
      renderMobile(fallbackProducts().map((p) => ({ link: 'https://stashbox.ai', product: p })));
    });

    window.addEventListener('stashbox:trackchange', function (event) {
      safe(() => renderForTrack((event && event.detail && event.detail.track) || null));
    });
  }

  safe(init);
})();
