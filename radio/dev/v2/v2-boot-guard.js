(() => {
  'use strict';

  const app = document.getElementById('v2App');
  if (!app) return;

  const nativeFetch = window.fetch.bind(window);
  const guardedHosts = new Set([
    'd21fbe6u80.execute-api.us-east-1.amazonaws.com',
    'stashbox.ai'
  ]);

  window.fetch = (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    let host = '';
    try { host = new URL(rawUrl, location.href).hostname; } catch (_) {}
    if (!guardedHosts.has(host) || init.signal) return nativeFetch(input, init);

    const controller = new AbortController();
    const timeoutMs = host === 'stashbox.ai' ? 10000 : 20000;
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    return nativeFetch(input, { ...init, signal: controller.signal })
      .finally(() => window.clearTimeout(timer));
  };

  const showFailure = message => {
    if (app.querySelector('[data-song], .v2-load-error')) return;
    const meter = app.querySelector('[data-v2-boot-status]');
    if (meter) {
      meter.classList.add('v2-load-error');
      meter.innerHTML = `
        <strong>Live catalog did not finish loading</strong>
        <p>${String(message || 'The request timed out.').replace(/[<>]/g, '')}</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
          <button type="button" data-v2-retry style="border:0;border-radius:999px;padding:10px 16px;background:#ff9f0a;color:#111;font-weight:900">Retry</button>
          <a href="/radio/dev/" style="border:1px solid rgba(255,255,255,.15);border-radius:999px;padding:10px 16px;color:#fff;text-decoration:none;font-weight:800">Open Existing DEV</a>
        </div>`;
      meter.querySelector('[data-v2-retry]')?.addEventListener('click', () => location.reload());
    }
  };

  window.addEventListener('error', event => {
    if (!app.querySelector('[data-song]')) showFailure(event.message || 'A startup script failed.');
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason;
    showFailure(reason?.message || String(reason || 'A startup request failed.'));
  });

  window.setTimeout(() => {
    if (!app.querySelector('[data-song]')) showFailure('The songs API did not respond within 20 seconds.');
  }, 22000);
})();