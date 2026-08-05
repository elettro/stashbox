/* Stashbox — shared JS */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Shared legal styles ── */
  (function ensureLegalStyles() {
    if (document.querySelector('link[data-stashbox-legal-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/legal/legal.css';
    link.setAttribute('data-stashbox-legal-styles', 'true');
    document.head.appendChild(link);
  })();

  /* ── Global legal footer links ── */
  (function injectLegalFooterLinks() {
    const legalLinks = [
      ['/legal/terms-of-use/', 'Terms of Use'],
      ['/legal/privacy-policy/', 'Privacy Policy'],
      ['/legal/cookie-policy/', 'Cookie Policy'],
      ['/legal/copyright-dmca/', 'Copyright and DMCA'],
      ['/legal/content-license-release/', 'Content License and Release']
    ];

    document.querySelectorAll('.footer__nav-cols').forEach(container => {
      if (container.querySelector('[data-global-legal-links]')) return;

      const column = document.createElement('div');
      column.className = 'footer__col';
      column.setAttribute('data-global-legal-links', 'true');

      const heading = document.createElement('h4');
      heading.className = 'footer__col-title';
      heading.textContent = 'Legal';

      const list = document.createElement('ul');
      legalLinks.forEach(([href, label]) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = href;
        link.textContent = label;
        if (location.pathname.replace(/index\.html$/, '') === href) {
          link.setAttribute('aria-current', 'page');
        }
        item.appendChild(link);
        list.appendChild(item);
      });

      const preferencesItem = document.createElement('li');
      const preferencesButton = document.createElement('button');
      preferencesButton.type = 'button';
      preferencesButton.className = 'footer__legal-button';
      preferencesButton.textContent = 'Cookie Preferences';
      preferencesButton.setAttribute('data-open-cookie-preferences', 'true');
      preferencesItem.appendChild(preferencesButton);
      list.appendChild(preferencesItem);

      column.appendChild(heading);
      column.appendChild(list);
      container.appendChild(column);
    });
  })();

  /* ── Cookie and privacy preferences ── */
  const StashboxConsent = (function initConsentManager() {
    const STORAGE_KEY = 'stashbox_consent_v1';
    const VERSION = 1;
    const gpcEnabled = navigator.globalPrivacyControl === true;
    let lastFocusedElement = null;

    function defaults() {
      return {
        version: VERSION,
        essential: true,
        analytics: false,
        marketing: false,
        updatedAt: null
      };
    }

    function readStored() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== VERSION) return null;
        return {
          version: VERSION,
          essential: true,
          analytics: parsed.analytics === true,
          marketing: gpcEnabled ? false : parsed.marketing === true,
          updatedAt: parsed.updatedAt || null
        };
      } catch (error) {
        return null;
      }
    }

    let preferences = readStored() || defaults();

    function apply(nextPreferences, persist) {
      preferences = {
        version: VERSION,
        essential: true,
        analytics: nextPreferences.analytics === true,
        marketing: gpcEnabled ? false : nextPreferences.marketing === true,
        updatedAt: persist ? new Date().toISOString() : (nextPreferences.updatedAt || null)
      };

      document.documentElement.dataset.consentAnalytics = String(preferences.analytics);
      document.documentElement.dataset.consentMarketing = String(preferences.marketing);

      document.querySelectorAll('[data-consent-category="analytics"]').forEach(input => {
        input.checked = preferences.analytics;
      });
      document.querySelectorAll('[data-consent-category="marketing"]').forEach(input => {
        input.checked = preferences.marketing;
        input.disabled = gpcEnabled;
        if (gpcEnabled) input.setAttribute('title', 'Disabled because Global Privacy Control is active.');
      });

      if (persist) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
        } catch (error) {
          /* Browser storage may be unavailable. The current page still honors the selection. */
        }
      }

      document.dispatchEvent(new CustomEvent('stashbox:consentchange', {
        detail: { ...preferences }
      }));

      return { ...preferences };
    }

    function save(nextPreferences) {
      return apply(nextPreferences, true);
    }

    function get() {
      return { ...preferences };
    }

    function hasStoredChoice() {
      return readStored() !== null;
    }

    function createBanner() {
      const banner = document.createElement('section');
      banner.className = 'cookie-banner';
      banner.setAttribute('data-cookie-banner', 'true');
      banner.setAttribute('aria-label', 'Cookie and privacy choices');
      banner.innerHTML = `
        <div class="cookie-banner__inner">
          <div class="cookie-banner__copy">
            <h2>Your Privacy Choices</h2>
            <p>Stashbox uses essential browser storage for site operation. Optional analytics and marketing technologies remain off until you choose them. Embedded services may apply their own policies when loaded.</p>
          </div>
          <div class="cookie-banner__actions">
            <button type="button" class="btn btn--accent" data-cookie-accept-all>Accept All</button>
            <button type="button" class="btn btn--outline" data-cookie-essential-only>Essential Only</button>
            <button type="button" class="btn btn--outline" data-cookie-manage>Manage Preferences</button>
            <a class="btn btn--outline" href="/legal/cookie-policy/">Cookie Policy</a>
          </div>
        </div>`;
      document.body.appendChild(banner);
      return banner;
    }

    function createModal() {
      const modal = document.createElement('div');
      modal.className = 'cookie-modal';
      modal.setAttribute('data-cookie-modal', 'true');
      modal.setAttribute('aria-hidden', 'true');
      modal.innerHTML = `
        <button type="button" class="cookie-modal__backdrop" data-cookie-close aria-label="Close privacy preferences"></button>
        <section class="cookie-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-modal-title">
          <div class="cookie-modal__header">
            <div>
              <p class="legal-eyebrow">Privacy Controls</p>
              <h2 id="cookie-modal-title">Cookie Preferences</h2>
            </div>
            <button type="button" class="cookie-modal__close" data-cookie-close aria-label="Close privacy preferences">×</button>
          </div>
          <div class="consent-panel">
            <div class="consent-row">
              <div><h3>Essential</h3><p>Required for core operation, security, playback state, accessibility, and saving your choice.</p></div>
              <input type="checkbox" checked disabled aria-label="Essential cookies are always active">
            </div>
            <div class="consent-row">
              <div><h3>Analytics</h3><p>Helps measure site use, song activity, listening behavior, errors, and performance.</p></div>
              <input type="checkbox" data-consent-category="analytics" aria-label="Allow analytics technologies">
            </div>
            <div class="consent-row">
              <div><h3>Marketing and Personalization</h3><p>Supports campaign measurement, personalized promotion, and advertising features where used.</p></div>
              <input type="checkbox" data-consent-category="marketing" aria-label="Allow marketing and personalization technologies">
            </div>
            <div class="consent-actions">
              <button type="button" class="btn btn--accent" data-consent-save>Save Preferences</button>
              <button type="button" class="btn btn--outline" data-consent-essential>Use Essential Only</button>
              <button type="button" class="btn btn--outline" data-consent-all>Accept All</button>
            </div>
            <p class="consent-status" data-consent-status role="status" aria-live="polite"></p>
          </div>
        </section>`;
      document.body.appendChild(modal);
      return modal;
    }

    const banner = createBanner();
    const modal = createModal();

    function updateStatus(message) {
      document.querySelectorAll('[data-consent-status]').forEach(element => {
        element.textContent = message;
      });
    }

    function hideBanner() {
      banner.classList.remove('is-visible');
    }

    function showBanner() {
      banner.classList.add('is-visible');
    }

    function openModal() {
      lastFocusedElement = document.activeElement;
      apply(preferences, false);
      modal.classList.add('is-visible');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('cookie-modal-open');
      const closeButton = modal.querySelector('.cookie-modal__close');
      if (closeButton) closeButton.focus();
    }

    function closeModal() {
      modal.classList.remove('is-visible');
      modal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('cookie-modal-open');
      if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        lastFocusedElement.focus();
      }
    }

    function selectedFrom(scope) {
      const analytics = scope.querySelector('[data-consent-category="analytics"]');
      const marketing = scope.querySelector('[data-consent-category="marketing"]');
      return {
        analytics: analytics ? analytics.checked : preferences.analytics,
        marketing: marketing ? marketing.checked : preferences.marketing
      };
    }

    function saveAndClose(next, message) {
      save(next);
      updateStatus(message || 'Your privacy preferences were saved.');
      hideBanner();
      closeModal();
    }

    document.addEventListener('click', event => {
      const target = event.target.closest('button, a');
      if (!target) return;

      if (target.matches('[data-open-cookie-preferences], [data-cookie-manage]')) {
        event.preventDefault();
        openModal();
        return;
      }

      if (target.matches('[data-cookie-close]')) {
        event.preventDefault();
        closeModal();
        return;
      }

      if (target.matches('[data-cookie-accept-all], [data-consent-all]')) {
        event.preventDefault();
        saveAndClose({ analytics: true, marketing: true }, gpcEnabled
          ? 'Analytics enabled. Marketing remains off because Global Privacy Control is active.'
          : 'All optional preferences were enabled.');
        return;
      }

      if (target.matches('[data-cookie-essential-only], [data-consent-essential]')) {
        event.preventDefault();
        saveAndClose({ analytics: false, marketing: false }, 'Only essential technologies are active.');
        return;
      }

      if (target.matches('[data-consent-save]')) {
        event.preventDefault();
        const scope = target.closest('[data-cookie-preference-center], .cookie-modal__dialog') || document;
        saveAndClose(selectedFrom(scope), 'Your privacy preferences were saved.');
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && modal.classList.contains('is-visible')) {
        closeModal();
      }
    });

    apply(preferences, false);
    if (!hasStoredChoice()) showBanner();

    return { get, save, open: openModal, close: closeModal, gpcEnabled };
  })();

  window.StashboxConsent = StashboxConsent;

  /* ── Nav: scroll shadow ── */
  const nav = document.getElementById('main-nav');
  if (nav) {
    const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 40);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── Nav: hamburger ── */
  const toggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      toggle.classList.toggle('is-open', !open);
      navLinks.classList.toggle('is-open', !open);
      document.body.style.overflow = !open ? 'hidden' : '';
    });

    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.classList.remove('is-open');
        navLinks.classList.remove('is-open');
        document.body.style.overflow = '';
      });
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && navLinks.classList.contains('is-open')) {
        toggle.setAttribute('aria-expanded', 'false');
        toggle.classList.remove('is-open');
        navLinks.classList.remove('is-open');
        document.body.style.overflow = '';
        toggle.focus();
      }
    });
  }

  /* ── Nav: mark active page ── */
  const normalizePath = path => (path || '/').replace(/index\.html$/, '').replace(/\/+$/, '') || '/';
  const currentPath = normalizePath(location.pathname);
  document.querySelectorAll('.nav__links a').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http') || href.startsWith('#')) return;
    if (normalizePath(href) === currentPath) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    }
  });

  document.querySelectorAll('.legal-toc a').forEach(a => {
    if (normalizePath(a.getAttribute('href')) === currentPath) {
      a.setAttribute('aria-current', 'page');
    }
  });

  /* ── Fade-in on scroll ── */
  const fadeEls = document.querySelectorAll('.fade-in');
  if (fadeEls.length) {
    if (reducedMotion) {
      fadeEls.forEach(el => el.classList.add('is-visible'));
    } else {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            e.target.classList.add('is-visible');
            observer.unobserve(e.target);
          }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -32px 0px' });
      fadeEls.forEach(el => observer.observe(el));
    }
  }

  /* ── Music page tabs ── */
  const tabBtns = document.querySelectorAll('.tabs__btn');
  if (tabBtns.length) {
    function activateTab(btn) {
      tabBtns.forEach(b => {
        b.setAttribute('aria-selected', 'false');
        b.setAttribute('tabindex', '-1');
      });
      document.querySelectorAll('.tabs__panel').forEach(p => { p.hidden = true; });

      btn.setAttribute('aria-selected', 'true');
      btn.setAttribute('tabindex', '0');
      const panel = document.getElementById(btn.getAttribute('aria-controls'));
      if (panel) panel.hidden = false;
    }

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn));
      btn.addEventListener('keydown', e => {
        const all = Array.from(tabBtns);
        const idx = all.indexOf(btn);
        if (e.key === 'ArrowRight') { e.preventDefault(); activateTab(all[(idx + 1) % all.length]); all[(idx + 1) % all.length].focus(); }
        if (e.key === 'ArrowLeft')  { e.preventDefault(); activateTab(all[(idx - 1 + all.length) % all.length]); all[(idx - 1 + all.length) % all.length].focus(); }
        if (e.key === 'Home') { e.preventDefault(); activateTab(all[0]); all[0].focus(); }
        if (e.key === 'End')  { e.preventDefault(); activateTab(all[all.length - 1]); all[all.length - 1].focus(); }
      });
    });
  }

  /* ── Details/accordion: rotate icon ── */
  document.querySelectorAll('.accordion').forEach(el => {
    el.addEventListener('toggle', () => {
      const icon = el.querySelector('.accordion__icon');
      if (icon) icon.textContent = el.open ? '×' : '+';
    });
  });

  /* ── Timed streaming popup ── */
  (function initStreamPopup() {
    if (location.pathname.startsWith('/legal/') || document.body.dataset.noStreamPopup === 'true') return;

    const POPUP_KEY = 'sb_popup_last';
    const POPUP_INTERVAL = 24 * 60 * 60 * 1000;
    const lastShown = parseInt(localStorage.getItem(POPUP_KEY) || '0', 10);
    const isFirstTime = !lastShown;
    const popupDelays = (isFirstTime || Date.now() - lastShown > POPUP_INTERVAL) ? [10000] : [];

    const overlay = document.createElement('div');
    overlay.id = 'stream-popup-overlay';
    overlay.className = 'stream-popup-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="stream-popup-modal" role="dialog" aria-label="Stream Stashbox music">
        <button class="stream-popup-close" type="button" aria-label="Close streaming popup">×</button>
        <div class="stream-popup-image-wrap">
          <img
            src="/images/streamon-horizontal-1.png"
            alt="Stream Stashbox on YouTube, Spotify, Apple Music, and YouTube Music"
            class="stream-popup-image"
          >
          <a class="stream-hotspot hotspot-youtube" href="https://youtube.com/@stashboxband" target="_blank" rel="noopener" aria-label="Open Stashbox on YouTube"></a>
          <a class="stream-hotspot hotspot-spotify" href="https://open.spotify.com/artist/0QMZNPEj7A2MFnT9zJGERa" target="_blank" rel="noopener" aria-label="Open Stashbox on Spotify"></a>
          <a class="stream-hotspot hotspot-apple" href="https://music.apple.com/us/artist/stashbox/1464431398" target="_blank" rel="noopener" aria-label="Open Stashbox on Apple Music"></a>
          <a class="stream-hotspot hotspot-youtube-music" href="https://music.youtube.com/@stashboxband" target="_blank" rel="noopener" aria-label="Open Stashbox on YouTube Music"></a>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const closeButton = overlay.querySelector('.stream-popup-close');

    function showStreamPopup() {
      overlay.classList.add('is-visible');
      overlay.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      localStorage.setItem(POPUP_KEY, Date.now().toString());
    }

    function hideStreamPopup() {
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }

    if (closeButton) {
      closeButton.addEventListener('click', hideStreamPopup);
    }

    overlay.addEventListener('click', event => {
      if (event.target === overlay) {
        hideStreamPopup();
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay.classList.contains('is-visible')) {
        hideStreamPopup();
      }
    });

    popupDelays.forEach(delay => {
      window.setTimeout(showStreamPopup, delay);
    });
  })();

})();
