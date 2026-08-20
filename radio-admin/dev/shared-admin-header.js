(() => {
  'use strict';

  const HEADER_ID = 'stashboxDevAdminHeader';
  const STYLE_ID = 'stashboxDevAdminHeaderStyles';
  const MOBILE_BREAKPOINT = 700;

  const navigation = [
    { key: 'songs', label: 'Songs', href: '/radio-admin/songs/dev/' },
    { key: 'video-library', label: 'Video Library', href: '/radio/visual-experience/dev/' },
    { key: 'vec', label: 'VEC Lab', href: '/radio-admin/dev/vec/' },
    { key: 'vec-audit', label: 'VEC AUDIT', href: 'https://stashbox.com/radio/dev/v2/vec-audit/' },
    { key: 'video-factory', label: 'Video Factory', href: '/radio-admin/dev/video-factory/' },
    { key: 'social-factory', label: 'Social Factory', href: '/radio-admin/dev/social-factory/' },
    { key: 'scheduled-posts', label: 'Scheduled Posts', href: '/radio-admin/dev/social-factory/scheduled/' },
    { key: 'scheduled-calendar', label: 'Schedule Calendar', href: '/radio-admin/dev/social-factory/scheduled/calendar/' },
    { key: 'ads', label: 'Ads', href: '/radio-admin/ads/dev/' },
    { key: 'artists', label: 'Artists', href: '/radio-admin/artists/dev/' },
    { key: 'notifications', label: 'Notifications', href: '/radio-admin/notifications/dev/' },
    { key: 'bugs', label: 'Bug Base', href: '/radio-admin/dev/bugs/' },
    { key: 'dashboard', label: 'Dashboard', href: '/radio/dashboard/dev/' },
    { key: 'system-health', label: 'System Health', href: 'https://stashbox.com/radio-admin/dev/system-health/' },
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
    if (path.includes('/radio/dev/v2/vec-audit/')) return { key: 'vec-audit', title: 'VEC AUDIT' };
    if (path.includes('/radio-admin/dev/vec/')) return { key: 'vec', title: 'VEC Lab' };
    if (path.includes('/radio-admin/dev/video-factory/')) return { key: 'video-factory', title: 'Video Factory' };
    if (path.includes('/radio-admin/dev/social-factory/scheduled/calendar/')) return { key: 'scheduled-calendar', title: 'Social Factory · Schedule Calendar' };
    if (path.includes('/radio-admin/dev/social-factory/scheduled/')) return { key: 'scheduled-posts', title: 'Social Factory · Scheduled Posts' };
    if (path.includes('/radio-admin/dev/social-factory/')) return { key: 'social-factory', title: 'Social Factory · Content Review' };
    if (path.includes('/radio-admin/ads/dev/') || path.includes('/radio-admin/dev/ads/')) return { key: 'ads', title: 'Ads CMS' };
    if (path.includes('/radio-admin/notifications/dev/')) return { key: 'notifications', title: 'Notifications CMS' };
    if (path.includes('/radio-admin/dev/bugs/')) return { key: 'bugs', title: 'Bug Base' };
    if (path.includes('/radio-admin/dev/system-health/')) return { key: 'system-health', title: 'System Health' };
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
      #${HEADER_ID} .sbra-admin-top-row {
        display: flex !important;
        align-items: center !important;
        justify-content: space-between !important;
        gap: 14px !important;
        width: 100% !important;
      }
      #${HEADER_ID} .sbra-admin-brand {
        display: inline-flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 1px !important;
        min-width: 0 !important;
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
      #${HEADER_ID} .sbra-admin-menu-toggle {
        display: none !important;
        flex: 0 0 auto !important;
        width: 44px !important;
        height: 44px !important;
        margin: 0 !important;
        padding: 10px !important;
        border: 1px solid #3a4049 !important;
        border-radius: 10px !important;
        background: #101317 !important;
        color: #f7f7f5 !important;
        cursor: pointer !important;
        box-shadow: none !important;
      }
      #${HEADER_ID} .sbra-admin-menu-toggle:hover,
      #${HEADER_ID} .sbra-admin-menu-toggle:focus-visible {
        border-color: #f0a500 !important;
        background: #18130b !important;
        outline: none !important;
      }
      #${HEADER_ID} .sbra-admin-menu-lines {
        display: grid !important;
        gap: 5px !important;
        width: 100% !important;
      }
      #${HEADER_ID} .sbra-admin-menu-lines span {
        display: block !important;
        width: 100% !important;
        height: 2px !important;
        border-radius: 999px !important;
        background: currentColor !important;
        transform-origin: center !important;
        transition: transform .18s ease, opacity .18s ease !important;
      }
      #${HEADER_ID}.sbra-mobile-nav-open .sbra-admin-menu-lines span:nth-child(1) {
        transform: translateY(7px) rotate(45deg) !important;
      }
      #${HEADER_ID}.sbra-mobile-nav-open .sbra-admin-menu-lines span:nth-child(2) {
        opacity: 0 !important;
      }
      #${HEADER_ID}.sbra-mobile-nav-open .sbra-admin-menu-lines span:nth-child(3) {
        transform: translateY(-7px) rotate(-45deg) !important;
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
      @media (max-width: ${MOBILE_BREAKPOINT}px) {
        #${HEADER_ID} {
          padding: 9px 10px !important;
        }
        #${HEADER_ID} .sbra-admin-kicker {
          font-size: 9px !important;
          letter-spacing: .07em !important;
        }
        #${HEADER_ID} .sbra-admin-title {
          max-width: calc(100vw - 82px) !important;
          overflow: hidden !important;
          font-size: 18px !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }
        #${HEADER_ID} .sbra-admin-menu-toggle {
          display: grid !important;
          place-items: center !important;
        }
        #${HEADER_ID} .sbra-admin-nav {
          display: none !important;
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          gap: 8px !important;
          margin: 10px 0 2px !important;
          padding: 10px 0 1px !important;
          border-top: 1px solid #242a31 !important;
        }
        #${HEADER_ID}.sbra-mobile-nav-open .sbra-admin-nav {
          display: grid !important;
        }
        #${HEADER_ID} .sbra-admin-nav a {
          width: 100% !important;
          min-height: 40px !important;
          padding: 9px 8px !important;
          font-size: 12px !important;
          white-space: normal !important;
        }
      }
      @media (max-width: 390px) {
        #${HEADER_ID} .sbra-admin-nav {
          grid-template-columns: 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function installPageEnhancements(configuration) {
    if (configuration.key !== 'video-library') return;
    const scriptId = 'stashboxVideoLibraryDuplicateManager';
    if (document.getElementById(scriptId)) return;
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = '/radio/visual-experience/dev/duplicate-upload-manager.js?v=20260724-duplicate1';
    script.async = true;
    document.head.appendChild(script);
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

  function setMobileMenuState(header, toggle, open) {
    const nextOpen = Boolean(open);
    header.classList.toggle('sbra-mobile-nav-open', nextOpen);
    toggle.setAttribute('aria-expanded', String(nextOpen));
    toggle.setAttribute('aria-label', nextOpen ? 'Close DEV admin navigation' : 'Open DEV admin navigation');
  }

  function installMobileMenuBehavior(header, toggle, nav) {
    toggle.addEventListener('click', event => {
      event.stopPropagation();
      setMobileMenuState(header, toggle, !header.classList.contains('sbra-mobile-nav-open'));
    });

    nav.addEventListener('click', event => {
      if (event.target.closest('a')) setMobileMenuState(header, toggle, false);
    });

    document.addEventListener('click', event => {
      if (window.innerWidth > MOBILE_BREAKPOINT) return;
      if (!header.classList.contains('sbra-mobile-nav-open')) return;
      if (!header.contains(event.target)) setMobileMenuState(header, toggle, false);
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && header.classList.contains('sbra-mobile-nav-open')) {
        setMobileMenuState(header, toggle, false);
        toggle.focus();
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > MOBILE_BREAKPOINT) setMobileMenuState(header, toggle, false);
    });
  }

  function buildHeader(configuration) {
    const header = document.createElement('header');
    header.id = HEADER_ID;
    header.setAttribute('data-active-tool', configuration.key);

    const topRow = document.createElement('div');
    topRow.className = 'sbra-admin-top-row';

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

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'sbra-admin-menu-toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'stashboxDevAdminNavigation');
    toggle.setAttribute('aria-label', 'Open DEV admin navigation');
    toggle.innerHTML = `
      <span class="sbra-admin-menu-lines" aria-hidden="true">
        <span></span><span></span><span></span>
      </span>
    `;

    const nav = document.createElement('nav');
    nav.id = 'stashboxDevAdminNavigation';
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
    topRow.append(brand, toggle);
    header.append(topRow, nav, compat);
    installMobileMenuBehavior(header, toggle, nav);
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
    installPageEnhancements(configuration);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderSharedHeader, { once: true });
  } else {
    renderSharedHeader();
  }
})();