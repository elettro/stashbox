/* Stashbox — shared JS */
(function () {
  'use strict';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
