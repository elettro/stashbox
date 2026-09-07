(() => {
  'use strict';

  const API = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
  const TOKEN_KEY = 'stashbox_admin_token_dev';
  const CORE_FILES = [
    '/radio/dev/v2/v2-boot-guard.js',
    '/radio/dev/v2/v2-health.js',
    '/radio/dev/v2/v2-recovery.js'
  ];

  const els = {
    token: document.getElementById('adminToken'),
    saveToken: document.getElementById('saveToken'),
    clearToken: document.getElementById('clearToken'),
    runChecks: document.getElementById('runChecks'),
    lastChecked: document.getElementById('lastChecked'),
    overall: document.querySelector('.health-overall'),
    overallStatus: document.getElementById('overallStatus'),
    frame: document.getElementById('v2HealthFrame')
  };

  const sleep = ms => new Promise(resolve => window.setTimeout(resolve, ms));
  const token = () => String(localStorage.getItem(TOKEN_KEY) || '').trim();
  const card = key => document.querySelector(`[data-check-card="${key}"]`);

  function setField(key, name, value) {
    const field = card(key)?.querySelector(`[data-field="${name}"]`);
    if (field) field.textContent = value ?? '—';
  }

  function setCard(key, state, status, message) {
    const target = card(key);
    if (!target) return;
    target.dataset.state = state;
    const statusElement = target.querySelector('.health-status');
    const messageElement = target.querySelector('.health-message');
    if (statusElement) statusElement.textContent = status;
    if (messageElement && message) messageElement.textContent = message;
  }

  function setAllChecking() {
    document.querySelectorAll('[data-check-card]').forEach(target => {
      target.dataset.state = 'checking';
      const status = target.querySelector('.health-status');
      if (status) status.textContent = 'Checking';
    });
    els.overall.dataset.overall = 'checking';
    els.overallStatus.textContent = 'Checking';
    els.runChecks.disabled = true;
    els.runChecks.textContent = 'Running Checks…';
  }

  function updateOverall() {
    const states = [...document.querySelectorAll('[data-check-card]')].map(target => target.dataset.state);
    if (states.includes('fail')) {
      els.overall.dataset.overall = 'failed';
      els.overallStatus.textContent = 'Action Needed';
    } else if (states.includes('warn') || states.includes('checking')) {
      els.overall.dataset.overall = 'degraded';
      els.overallStatus.textContent = 'Partially Verified';
    } else {
      els.overall.dataset.overall = 'healthy';
      els.overallStatus.textContent = 'Healthy';
    }
    els.lastChecked.textContent = `Last checked ${new Date().toLocaleString()}`;
    els.runChecks.disabled = false;
    els.runChecks.textContent = 'Run All Checks';
  }

  async function fetchTimed(url, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    const started = performance.now();
    try {
      const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        signal: controller.signal
      });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      return {
        ok: response.ok,
        status: response.status,
        body,
        latency: Math.round(performance.now() - started)
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function checkCoreFiles() {
    const key = 'core-files';
    const list = card(key).querySelector('[data-file-list]');
    list.innerHTML = CORE_FILES.map(file => `<div class="health-file-row" data-file="${file}" data-state="checking"><i></i><strong>${file.split('/').pop()}</strong><span>Checking</span></div>`).join('');

    try {
      const htmlResult = await fetchTimed(`/radio/dev/v2/?system_health_static=${Date.now()}`);
      if (!htmlResult.ok || typeof htmlResult.body !== 'string') throw new Error(`V2 HTML returned HTTP ${htmlResult.status}.`);
      const documentCopy = new DOMParser().parseFromString(htmlResult.body, 'text/html');
      const build = documentCopy.querySelector('meta[name="stashbox-v2-build"]')?.content || 'missing';
      const referenced = [...documentCopy.querySelectorAll('script[src]')].map(script => new URL(script.src, location.origin).pathname);
      const failures = [];

      for (const file of CORE_FILES) {
        const row = list.querySelector(`[data-file="${file}"]`);
        const label = row.querySelector('span');
        if (!referenced.includes(file)) {
          row.dataset.state = 'fail';
          label.textContent = 'Not referenced';
          failures.push(`${file.split('/').pop()} is missing from index.html`);
          continue;
        }
        try {
          const response = await fetch(`${file}?health=${Date.now()}`, { cache: 'no-store' });
          row.dataset.state = response.ok ? 'pass' : 'fail';
          label.textContent = `HTTP ${response.status}`;
          if (!response.ok) failures.push(`${file.split('/').pop()} returned ${response.status}`);
        } catch (error) {
          row.dataset.state = 'fail';
          label.textContent = 'Request failed';
          failures.push(error.message);
        }
      }

      if (failures.length) setCard(key, 'fail', 'Failed', `${build}. ${failures.join('. ')}`);
      else setCard(key, 'pass', 'Healthy', `Build ${build}. All required startup files are referenced and reachable.`);
    } catch (error) {
      setCard(key, 'fail', 'Failed', error.message);
    }
  }

  async function checkV2Browser() {
    const key = 'v2-browser';
    setField(key, 'build', 'Checking');
    setField(key, 'songs', 'Checking');
    setField(key, 'startup', 'Checking');
    setField(key, 'catalog', 'Checking');

    try {
      const loaded = new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('V2 iframe did not load within 15 seconds.')), 15000);
        els.frame.onload = () => {
          window.clearTimeout(timer);
          resolve();
        };
      });
      els.frame.src = `/radio/dev/v2/?system_health_browser=${Date.now()}`;
      await loaded;

      const deadline = Date.now() + 35000;
      let health = null;
      while (Date.now() < deadline) {
        try { health = els.frame.contentWindow?.STASHBOX_HEALTH || null; } catch {}
        if (health?.status === 'ready') break;
        await sleep(500);
      }

      const frameDocument = els.frame.contentDocument;
      const build = frameDocument?.querySelector('meta[name="stashbox-v2-build"]')?.content || health?.build || 'missing';
      const songs = Number(health?.songCount || frameDocument?.querySelectorAll('[data-song]').length || 0);
      setField(key, 'build', build);
      setField(key, 'songs', String(songs));
      setField(key, 'startup', health?.startupMs != null ? `${health.startupMs} ms` : 'Not reported');
      setField(key, 'catalog', health?.catalogSource || 'unknown');

      if (health?.status === 'ready' && songs > 0 && health.playerReady && health.mediaReady) {
        setCard(key, 'pass', 'Healthy', 'The live page rendered songs and initialized its player and media element.');
      } else {
        const detail = health?.errors?.map(item => item.message).filter(Boolean).join(' | ');
        setCard(key, 'fail', 'Failed', detail || `The live browser flow ended with status ${health?.status || 'missing'}.`);
      }
    } catch (error) {
      setCard(key, 'fail', 'Failed', error.message);
    }
  }

  async function checkPublicApi(key, pathname, inspect) {
    try {
      const result = await fetchTimed(`${API}${pathname}`);
      setField(key, 'http', String(result.status));
      setField(key, 'latency', `${result.latency} ms`);
      const detail = inspect(result.body);
      for (const [name, value] of Object.entries(detail.fields || {})) setField(key, name, value);
      if (result.ok && detail.pass) setCard(key, 'pass', 'Healthy', detail.message);
      else setCard(key, 'fail', 'Failed', detail.message || `HTTP ${result.status}`);
    } catch (error) {
      setCard(key, 'fail', 'Failed', error.name === 'AbortError' ? 'Request timed out.' : error.message);
    }
  }

  async function checkProtectedApi(key, pathname, inspect) {
    const adminToken = token();
    if (!adminToken) {
      setField(key, 'http', 'Token needed');
      setField(key, 'count', 'Not checked');
      setField(key, 'latency', '—');
      setCard(key, 'warn', 'Token Needed', 'Save the DEV admin token to include this protected read-only route.');
      return;
    }

    try {
      const result = await fetchTimed(`${API}${pathname}`, {
        headers: { 'x-admin-token': adminToken, accept: 'application/json' }
      });
      setField(key, 'http', String(result.status));
      setField(key, 'latency', `${result.latency} ms`);
      const detail = inspect(result.body);
      for (const [name, value] of Object.entries(detail.fields || {})) setField(key, name, value);
      if (result.ok && detail.pass) setCard(key, 'pass', 'Healthy', detail.message);
      else setCard(key, 'fail', 'Failed', detail.message || `HTTP ${result.status}`);
    } catch (error) {
      setCard(key, 'fail', 'Failed', error.name === 'AbortError' ? 'Request timed out.' : error.message);
    }
  }

  async function runChecks() {
    setAllChecking();
    await Promise.allSettled([
      checkV2Browser(),
      checkCoreFiles(),
      checkPublicApi('songs-api', '/radio/songs', body => {
        const songs = Array.isArray(body?.songs) ? body.songs : Array.isArray(body) ? body : [];
        return { pass: songs.length > 0, fields: { count: String(songs.length) }, message: songs.length ? `${songs.length} visible songs returned.` : 'No visible songs were returned.' };
      }),
      checkPublicApi('dashboard-api', '/dashboard/summary', body => {
        const valid = body?.success === true && Object.prototype.hasOwnProperty.call(body?.summary || {}, 'total_events') && Array.isArray(body?.event_types) && Array.isArray(body?.top_songs_by_plays);
        return { pass: valid, fields: { events: String(body?.summary?.total_events ?? 'missing') }, message: valid ? 'Dashboard totals and breakdowns are present.' : 'Dashboard response is missing required reporting fields.' };
      }),
      checkProtectedApi('ads-api', '/admin/ads', body => {
        const rows = Array.isArray(body?.ads) ? body.ads : Array.isArray(body) ? body : [];
        return { pass: Array.isArray(rows), fields: { count: String(rows.length) }, message: `Ads route returned ${rows.length} record(s).` };
      }),
      checkProtectedApi('vec-api', '/admin/visuals/folders', body => {
        const rows = Array.isArray(body?.folders) ? body.folders : [];
        return { pass: Array.isArray(rows), fields: { count: String(rows.length) }, message: `VEC route returned ${rows.length} folder(s).` };
      }),
      checkProtectedApi('video-factory-api', '/admin/video-factory/summary', body => {
        const total = body?.summary?.total_jobs;
        return { pass: total !== undefined, fields: { count: String(total ?? 'missing') }, message: total !== undefined ? `Video Factory reports ${total} total job(s).` : 'Video Factory summary is missing total_jobs.' };
      })
    ]);
    updateOverall();
  }

  els.token.value = token();
  els.saveToken.addEventListener('click', () => {
    localStorage.setItem(TOKEN_KEY, els.token.value.trim());
    runChecks();
  });
  els.clearToken.addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY);
    els.token.value = '';
    runChecks();
  });
  els.runChecks.addEventListener('click', runChecks);

  runChecks();
})();
