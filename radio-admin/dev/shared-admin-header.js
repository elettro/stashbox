(() => {
  'use strict';

  const HEADER_ID = 'stashboxDevAdminHeader';
  const STYLE_ID = 'stashboxDevAdminHeaderStyles';

  const navigation = [
    { key: 'songs', label: 'Songs', href: '/radio-admin/songs/dev/' },
    { key: 'video-library', label: 'Video Library', href: '/radio/visual-experience/dev/' },
    { key: 'vec', label: 'VEC Lab', href: '/radio-admin/dev/vec/' },
    { key: 'video-factory', label: 'Video Factory', href: '/radio-admin/dev/video-factory/' },
    { key: 'ads', label: 'Ads', href: '/radio-admin/ads/dev/' },
    { key: 'artists', label: 'Artists', href: '/radio-admin/artists/dev/' },
    { key: 'notifications', label: 'Notifications', href: '/radio-admin/notifications/dev/' },
    { key: 'dashboard', label: 'Dashboard', href: '/radio/dashboard/dev/' },
    { key: 'radio', label: 'Radio Dev', href: '/radio/dev/' },
    { key: 'radio-v2', label: 'Radio Dev 2.0', href: 'https://stashbox.com/radio/dev/v2/' }
  ];

  function normalizedPath() {
    const path = String(window.location.pathname || '/').toLowerCase();
    return path.endsWith('/') ? path : `${path}/`;
  }

  function pageConfiguration(path) {
    if (path.includes('/radio-admin/songs/dev/')) return { key: 'songs', title: 'Songs CMS' };
    if (path.includes('/radio-admin/artists/dev/')) return { key: 'artists', title: 'Artist CMS' };
    if (path.includes('/radio/visual-experience/dev/')) return { key: 'video-library', title: 'Video Library' };
    if (path.includes('/radio-admin/dev/vec/')) return { key: 'vec', title: 'VEC Lab' };
    if (path.includes('/radio-admin/dev/video-factory/')) return { key: 'video-factory', title: 'Video Factory' };
    if (path.includes('/radio-admin/ads/dev/') || path.includes('/radio-admin/dev/ads/')) return { key: 'ads', title: 'Ads CMS' };
    if (path.includes('/radio-admin/notifications/dev/')) return { key: 'notifications', title: 'Notifications CMS' };
    if (path.includes('/radio/dashboard/dev/') || path === '/radio-admin/dev/') return { key: 'dashboard', title: 'Dashboard' };
    return null;
  }

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${HEADER_ID} {
        display: block !important;
        position: sticky !important;
        top: 0 !important;
        z-index: 5000 !important;
        width: 100% !important;
        margin: 0 !important;
        padding: 12px 11px 11px !important;
        border: 0 !important;
        border-bottom: 1px solid #2b3038 !important;
        border-radius: 0 !important;
        background: rgba(8, 9, 11, 0.98) !important;
        box-shadow: none !important;
        backdrop-filter: blur(14px) !important;
        color: #f7f7f5 !important;
        font-family: Karla, Arial, sans-serif !important;
        text-align: left !important;
      }
      #${HEADER_ID}, #${HEADER_ID} * { box-sizing: border-box !important; }
      #${HEADER_ID} .sbra-admin-brand {
        display: inline-flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 1px !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
        color: #f7f7f5 !important;
        text-decoration: none !important;
      }
      #${HEADER_ID} .sbra-admin-kicker {
        display: block !important;
        margin: 0 !important;
        color: #f0a500 !important;
        font-size: 11px !important;
        line-height: 1.15 !important;
        font-weight: 900 !important;
        letter-spacing: .08em !important;
        text-transform: uppercase !important;
      }
      #${HEADER_ID} .sbra-admin-title {
        display: block !important;
        margin: 0 !important;
        color: #f7f7f5 !important;
        font-size: 20px !important;
        line-height: 1.15 !important;
        font-weight: 800 !important;
        letter-spacing: 0 !important;
        text-transform: none !important;
      }
      #${HEADER_ID} .sbra-admin-nav {
        display: flex !important;
        flex-wrap: wrap !important;
        align-items: center !important;
        justify-content: flex-start !important;
        gap: 7px !important;
        width: 100% !important;
        max-width: none !important;
        margin: 11px 0 0 !important;
        padding: 0 !important;
        position: static !important;
        border: 0 !important;
        background: transparent !important;
        box-shadow: none !important;
      }
      #${HEADER_ID} .sbra-admin-nav a {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex: 0 0 auto !important;
        width: auto !important;
        min-height: 27px !important;
        margin: 0 !important;
        padding: 6px 10px !important;
        border: 1px solid #2b3038 !important;
        border-radius: 8px !important;
        background: #0b0d10 !important;
        color: #d9dde3 !important;
        font-size: 11px !important;
        line-height: 1.15 !important;
        font-weight: 700 !important;
        letter-spacing: 0 !important;
        text-transform: none !important;
        text-align: center !important;
        text-decoration: none !important;
        white-space: nowrap !important;
        box-shadow: none !important;
      }
      #${HEADER_ID} .sbra-admin-nav a:hover,
      #${HEADER_ID} .sbra-admin-nav a:focus-visible {
        border-color: #7c6730 !important;
        color: #ffd064 !important;
        background: #15130e !important;
        outline: none !important;
      }
      #${HEADER_ID} .sbra-admin-nav a[aria-current='page'] {
        border-color: #f0a500 !important;
        color: #ffd064 !important;
        background: #18130b !important;
      }
      #${HEADER_ID} .sbra-admin-compat-controls {
        display: none !important;
      }
      @media (max-width: 700px) {
        #${HEADER_ID} { padding: 11px 10px 10px !important; }
        #${HEADER_ID} .sbra-admin-title { font-size: 19px !important; }
        #${HEADER_ID} .sbra-admin-nav { gap: 6px !important; }
        #${HEADER_ID} .sbra-admin-nav a {
          min-height: 30px !important;
          padding: 7px 9px !important;
          font-size: 11px !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function isLegacyNavigationHeader(element) {
    if (element.tagName !== 'HEADER' || element.id === HEADER_ID) return false;
    if (element.matches('.topbar, .admin-header, .visuals-admin-header, .radio-admin-macro-header, .stashbox-site-header')) return true;
    return Boolean(element.querySelector(
      'nav.radio-admin-private-nav, nav.radio-admin-macro-nav, nav.admin-nav, nav[aria-label*="admin" i]'
    ));
  }

  function legacyNavigationHeaders() {
    return Array.from(document.body.children).filter(isLegacyNavigationHeader);
  }

  function preserveFunctionalControls(legacyHeaders, compatContainer) {
    const preservedIds = new Set();
    legacyHeaders.forEach(legacyHeader => {
      ['tokenStatus', 'clearTokenButton'].forEach(id => {
        if (preservedIds.has(id)) return;
        const node = legacyHeader.querySelector(`#${id}`);
        if (!node) return;
        preservedIds.add(id);
        compatContainer.appendChild(node);
      });
    });
  }

  function buildHeader(configuration) {
    const header = document.createElement('header');
    header.id = HEADER_ID;
    header.setAttribute('data-active-tool', configuration.key);

    const brand = document.createElement('a');
    brand.className = 'sbra-admin-brand';
    brand.href = '/radio/dev/';
    brand.setAttribute('aria-label', 'Open Stashbox Radio DEV');

    const kicker = document.createElement('span');
    kicker.className = 'sbra-admin-kicker';
    kicker.textContent = 'STASHBOX RADIO · DEV ADMIN';

    const title = document.createElement('strong');
    title.className = 'sbra-admin-title';
    title.textContent = configuration.title;

    const nav = document.createElement('nav');
    nav.className = 'sbra-admin-nav';
    nav.setAttribute('aria-label', 'Stashbox Radio DEV admin tools');

    navigation.forEach(item => {
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      if (item.key === configuration.key) link.setAttribute('aria-current', 'page');
      nav.appendChild(link);
    });

    const compat = document.createElement('div');
    compat.className = 'sbra-admin-compat-controls';
    compat.setAttribute('aria-hidden', 'true');

    brand.append(kicker, title);
    header.append(brand, nav, compat);
    return { header, compat };
  }

  function renderSharedHeader() {
    if (!document.body || document.getElementById(HEADER_ID)) return;
    const configuration = pageConfiguration(normalizedPath());
    if (!configuration) return;

    installStyles();
    const legacyHeaders = legacyNavigationHeaders();
    const { header, compat } = buildHeader(configuration);
    preserveFunctionalControls(legacyHeaders, compat);
    legacyHeaders.forEach(legacyHeader => legacyHeader.remove());
    document.body.insertBefore(header, document.body.firstChild);
    document.body.setAttribute('data-stashbox-dev-admin-header', configuration.key);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSharedHeader, { once: true });
  } else {
    renderSharedHeader();
  }
})();
