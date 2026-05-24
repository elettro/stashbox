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

})();
