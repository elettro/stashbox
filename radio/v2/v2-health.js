(() => {
  'use strict';

  const started = performance.now();
  const build = document.querySelector('meta[name="stashbox-v2-build"]')?.content || 'unknown';
  const existing = window.STASHBOX_HEALTH && typeof window.STASHBOX_HEALTH === 'object'
    ? window.STASHBOX_HEALTH
    : {};

  const health = Object.assign(existing, {
    status: 'loading',
    environment: 'dev',
    build,
    songCount: 0,
    playerReady: false,
    mediaReady: false,
    catalogSource: 'unknown',
    startupMs: null,
    checkedAt: new Date().toISOString(),
    errors: Array.isArray(existing.errors) ? existing.errors : []
  });

  window.STASHBOX_HEALTH = health;

  const publish = () => {
    health.checkedAt = new Date().toISOString();
    window.dispatchEvent(new CustomEvent('stashbox:v2-healthchange', {
      detail: { ...health, errors: [...health.errors] }
    }));
  };

  const recordError = (type, message) => {
    health.errors.push({
      type,
      message: String(message || 'Unknown error').slice(0, 500),
      at: new Date().toISOString()
    });
    health.errors = health.errors.slice(-10);
    if (health.status !== 'ready') health.status = 'error';
    publish();
  };

  const detectCatalogSource = () => {
    const names = performance.getEntriesByType('resource').map(entry => entry.name);
    if (names.some(name => name.includes('je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2/radio/songs'))) return 'production';
    if (names.some(name => name.includes('je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2/radio/songs'))) return 'production-fallback';
    return health.catalogSource || 'unknown';
  };

  const inspect = () => {
    const app = document.getElementById('v2App');
    if (!app) return false;

    const songCount = app.querySelectorAll('[data-song]').length;
    const player = app.querySelector('[data-player]');
    const audio = app.querySelector('[data-audio], audio');

    health.songCount = songCount;
    health.playerReady = Boolean(player);
    health.mediaReady = Boolean(audio);
    health.catalogSource = detectCatalogSource();

    if (songCount > 0 && player && audio) {
      health.status = 'ready';
      health.startupMs = Math.round(performance.now() - started);
      publish();
      return true;
    }

    return false;
  };

  health.markReady = details => {
    Object.assign(health, details || {}, {
      status: 'ready',
      startupMs: Math.round(performance.now() - started)
    });
    publish();
  };

  health.markFailure = message => recordError('application', message);

  window.addEventListener('error', event => {
    recordError('javascript', event.message || event.error?.message || 'JavaScript error');
  });

  window.addEventListener('unhandledrejection', event => {
    recordError('promise', event.reason?.message || String(event.reason || 'Unhandled promise rejection'));
  });

  if (!inspect()) {
    const observer = new MutationObserver(() => {
      if (inspect()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.setTimeout(() => {
      if (health.status !== 'ready') {
        health.status = health.errors.length ? 'error' : 'timeout';
        health.startupMs = Math.round(performance.now() - started);
        health.catalogSource = detectCatalogSource();
        publish();
      }
      observer.disconnect();
    }, 32000);
  }

  publish();
})();
