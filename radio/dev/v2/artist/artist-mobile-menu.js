(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const SHOP_URL = 'https://stashbox.ai/products.json?limit=250';
  const app = document.getElementById('artistApp');
  if (!app) return;

  const params = new URLSearchParams(location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';
  const mobile = window.matchMedia('(max-width: 699px)');
  const mobileOrder = ['website', 'merch', 'youtube', 'facebook', 'spotify', 'instagram', 'x', 'apple-music'];
  const desktopOrder = ['website', 'spotify', 'apple-music', 'youtube', 'instagram', 'x', 'facebook', 'merch'];

  const state = {
    artist: null,
    hasProducts: false,
    hasMerch: false,
    merchUrl: '',
    ready: false
  };

  const icons = {
    website: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.4 3 14.6 0 18M12 3c-3 3.4-3 14.6 0 18"/></svg>',
    merch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/></svg>',
    youtube: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="4"/><path d="m10 9 5 3-5 3Z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h4V3h-4c-4 0-6 2.5-6 6v3H5v5h3v4h5v-4h4l1-5h-5V9c0-.7.3-1 1-1Z"/></svg>',
    spotify: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7 9.2c3.7-1 7.5-.7 10.4.8M7.8 12.3c3-.8 6.2-.5 8.8.7M8.6 15.2c2.2-.5 4.6-.3 6.6.6"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4l14 16M19 4 5 20"/></svg>',
    'apple-music': '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5v11.2M15 7l5-1.2v9.4"/><circle cx="11.5" cy="16.5" r="3.5"/><circle cx="17.5" cy="15.5" r="2.5"/></svg>'
  };

  const normalize = value => String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  function keyForLabel(value) {
    const label = normalize(value);
    if (label === 'apple music') return 'apple-music';
    if (label === 'x' || label === 'twitter') return 'x';
    if (label.includes('website')) return 'website';
    if (label.includes('merch') || label.includes('shop') || label.includes('store')) return 'merch';
    if (label.includes('youtube')) return 'youtube';
    if (label.includes('facebook')) return 'facebook';
    if (label.includes('spotify')) return 'spotify';
    if (label.includes('instagram')) return 'instagram';
    return label.replace(/\s+/g, '-');
  }

  function termsForArtist(artist) {
    return [artist?.name, artist?.artist_key, artist?.slug, identifier]
      .map(normalize)
      .filter(Boolean);
  }

  function productMatchesArtist(product, terms) {
    const tags = Array.isArray(product?.tags) ? product.tags.join(' ') : (product?.tags || '');
    const haystack = normalize([
      product?.title,
      product?.body_html,
      tags,
      product?.product_type,
      product?.vendor,
      product?.handle
    ].filter(Boolean).join(' '));
    return terms.some(term => term && haystack.includes(term));
  }

  function ensureMerchMenuLink(menu) {
    let link = menu.querySelector('a[data-social-key="merch"]');
    if (!state.hasMerch) {
      if (link?.dataset.generatedMerch === '1') link.remove();
      return null;
    }
    if (link) return link;

    link = document.createElement('a');
    link.href = state.merchUrl || '#merch';
    link.textContent = 'Merch';
    link.dataset.socialKey = 'merch';
    link.dataset.generatedMerch = '1';
    if (state.hasProducts) link.dataset.openArtistMerch = '1';
    if (state.merchUrl) {
      link.target = '_blank';
      link.rel = 'noopener';
    }
    menu.appendChild(link);
    return link;
  }

  function decorateMenu() {
    const menu = app.querySelector('.artist-more-menu');
    if (!menu) return;

    [...menu.querySelectorAll('a')].forEach(link => {
      const key = link.dataset.socialKey || keyForLabel(link.textContent);
      link.dataset.socialKey = key;
      if (!link.querySelector('.artist-social-icon') && icons[key]) {
        const icon = document.createElement('span');
        icon.className = 'artist-social-icon';
        icon.innerHTML = icons[key];
        link.prepend(icon);
      }
    });

    const merchLink = ensureMerchMenuLink(menu);
    if (merchLink && !merchLink.querySelector('.artist-social-icon')) {
      const icon = document.createElement('span');
      icon.className = 'artist-social-icon';
      icon.innerHTML = icons.merch;
      merchLink.prepend(icon);
    }

    const order = mobile.matches ? mobileOrder : desktopOrder;
    const links = [...menu.querySelectorAll('a[data-social-key]')];
    const desired = [...links].sort((a, b) => {
      const aIndex = order.indexOf(a.dataset.socialKey);
      const bIndex = order.indexOf(b.dataset.socialKey);
      return (aIndex < 0 ? 99 : aIndex) - (bIndex < 0 ? 99 : bIndex);
    });
    const current = links.map(link => link.dataset.socialKey).join('|');
    const next = desired.map(link => link.dataset.socialKey).join('|');
    if (current !== next) desired.forEach(link => menu.appendChild(link));
  }

  function ensureShopLink() {
    const row = app.querySelector('.artist-link-row');
    if (!row) return;

    let button = row.querySelector('.artist-mobile-shop-link');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'artist-mobile-shop-link';
      button.dataset.artistShopLink = '1';
      button.innerHTML = `${icons.merch}<span>Shop</span>`;
      row.prepend(button);
    }
    button.hidden = !state.hasMerch;
  }

  function enhance() {
    decorateMenu();
    ensureShopLink();
  }

  function openMerch() {
    if (state.hasProducts) {
      const tab = app.querySelector('[data-tab="merch"]');
      if (tab) {
        tab.click();
        return;
      }
    }
    if (state.merchUrl) window.open(state.merchUrl, '_blank', 'noopener');
  }

  document.addEventListener('click', event => {
    const shop = event.target.closest('.artist-mobile-shop-link');
    if (shop) {
      event.preventDefault();
      openMerch();
      return;
    }

    const merch = event.target.closest('.artist-more-menu a[data-social-key="merch"]');
    if (merch && state.hasProducts && (!state.merchUrl || merch.dataset.openArtistMerch === '1')) {
      event.preventDefault();
      openMerch();
    }
  });

  let enhanceTimer = 0;
  const observer = new MutationObserver(() => {
    window.clearTimeout(enhanceTimer);
    enhanceTimer = window.setTimeout(enhance, 20);
  });
  observer.observe(app, { childList: true, subtree: true });

  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', enhance);
  else if (typeof mobile.addListener === 'function') mobile.addListener(enhance);

  Promise.allSettled([
    fetch(`${API_ROOT}/radio/artists/${encodeURIComponent(identifier)}`, { cache: 'no-store', credentials: 'omit' }).then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))),
    fetch(SHOP_URL, { cache: 'no-store', credentials: 'omit' }).then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
  ]).then(([artistResult, shopResult]) => {
    state.artist = artistResult.status === 'fulfilled' ? artistResult.value.artist : null;
    state.merchUrl = String(state.artist?.merch_url || '').trim();
    const products = shopResult.status === 'fulfilled' && Array.isArray(shopResult.value.products) ? shopResult.value.products : [];
    const terms = termsForArtist(state.artist);
    state.hasProducts = products.some(product => productMatchesArtist(product, terms));
    state.hasMerch = Boolean(state.merchUrl || state.hasProducts);
    state.ready = true;
    enhance();
  }).catch(() => enhance());

  enhance();
})();
