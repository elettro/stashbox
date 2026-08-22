(() => {
  'use strict';

  const API_ROOT = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const app = document.getElementById('artistApp');
  if (!app) return;

  const params = new URLSearchParams(location.search);
  const identifier = params.get('artist') || params.get('slug') || 'stashbox';
  const mobile = window.matchMedia('(max-width: 699px)');
  let media = null;
  let scheduled = false;

  function cssUrl(value) {
    return value ? `url(${JSON.stringify(value)})` : '';
  }

  function apply() {
    scheduled = false;
    const hero = app.querySelector('.artist-hero');
    if (!hero) return;
    if (!hero.dataset.horizontalBannerStyle) {
      hero.dataset.horizontalBannerStyle = hero.style.getPropertyValue('--artist-banner') || '';
    }
    const horizontal = media?.horizontal_banner_image_url || '';
    const vertical = media?.vertical_banner_image_url || '';
    const desired = mobile.matches && vertical
      ? cssUrl(vertical)
      : horizontal
        ? cssUrl(horizontal)
        : hero.dataset.horizontalBannerStyle;
    if (desired) hero.style.setProperty('--artist-banner', desired);
  }

  function queueApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(apply);
  }

  fetch(`${API_ROOT}/radio/artists/${encodeURIComponent(identifier)}/media`, {
    cache: 'no-store',
    credentials: 'omit'
  }).then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then(body => {
      media = body.media || null;
      queueApply();
    })
    .catch(() => {});

  if (typeof mobile.addEventListener === 'function') mobile.addEventListener('change', queueApply);
  else if (typeof mobile.addListener === 'function') mobile.addListener(queueApply);

  new MutationObserver(queueApply).observe(app, { childList: true, subtree: true });
  queueApply();
})();
