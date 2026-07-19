#!/usr/bin/env node

const DEFAULT_TRUE_DEV_API_BASE = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const TRUE_DEV_API_BASE = (process.env.TRUE_DEV_API_BASE || DEFAULT_TRUE_DEV_API_BASE).replace(/\/+$/, '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const TIMEOUT_MS = Number.parseInt(process.env.TRUE_DEV_SMOKE_TIMEOUT_MS || '15000', 10);

if (process.argv.includes('--write')) {
  console.log('Write smoke tests are not implemented yet.');
  process.exit(0);
}

function iconFor(result) {
  if (result.skipped) return 'SKIP';
  return result.pass ? 'PASS' : 'FAIL';
}

function statusText(status) {
  return status === null || status === undefined ? 'n/a' : String(status);
}

async function fetchJson(pathname, { admin = false } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(TIMEOUT_MS) ? TIMEOUT_MS : 15000);
  const headers = { accept: 'application/json' };

  if (admin && ADMIN_TOKEN) {
    headers['x-admin-token'] = ADMIN_TOKEN;
  }

  try {
    const response = await fetch(`${TRUE_DEV_API_BASE}${pathname}`, {
      method: 'GET',
      headers,
      signal: controller.signal
    });
    const text = await response.text();
    let body = null;

    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { parse_error: 'Response was not valid JSON.', preview: text.slice(0, 160) };
    }

    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: null, body: null, error };
  } finally {
    clearTimeout(timeout);
  }
}

function addResult(results, { name, endpoint, status, pass, reason, required = true, skipped = false }) {
  results.push({ name, endpoint, status, pass, reason, required, skipped });
}

async function checkRadioSongs(results) {
  const endpoint = '/radio/songs';
  const result = await fetchJson(endpoint);
  const count = Array.isArray(result.body?.songs) ? result.body.songs.length : Number(result.body?.count || 0);

  addResult(results, {
    name: 'radio songs HTTP 200',
    endpoint,
    status: result.status,
    pass: result.status === 200,
    reason: result.status === 200 ? 'Returned HTTP 200.' : (result.error?.message || `Expected HTTP 200, got ${statusText(result.status)}.`)
  });
  addResult(results, {
    name: 'radio songs success flag',
    endpoint,
    status: result.status,
    pass: result.body?.success === true,
    reason: result.body?.success === true ? 'success is true.' : 'Expected response.success to be true.'
  });
  addResult(results, {
    name: 'radio songs visible count',
    endpoint,
    status: result.status,
    pass: count > 0,
    reason: count > 0 ? `Found ${count} visible song(s).` : 'Expected at least one visible song.'
  });
}

async function checkDashboardSummary(results) {
  const endpoint = '/dashboard/summary';
  const result = await fetchJson(endpoint);

  addResult(results, {
    name: 'dashboard summary HTTP 200',
    endpoint,
    status: result.status,
    pass: result.status === 200,
    reason: result.status === 200 ? 'Returned HTTP 200.' : (result.error?.message || `Expected HTTP 200, got ${statusText(result.status)}.`)
  });
  addResult(results, {
    name: 'dashboard summary success flag',
    endpoint,
    status: result.status,
    pass: result.body?.success === true,
    reason: result.body?.success === true ? 'success is true.' : 'Expected response.success to be true.'
  });
  addResult(results, {
    name: 'dashboard summary total events',
    endpoint,
    status: result.status,
    pass: Object.prototype.hasOwnProperty.call(result.body?.summary || {}, 'total_events'),
    reason: Object.prototype.hasOwnProperty.call(result.body?.summary || {}, 'total_events') ? 'summary.total_events is present.' : 'Expected summary.total_events.'
  });
  addResult(results, {
    name: 'dashboard summary event types',
    endpoint,
    status: result.status,
    pass: Array.isArray(result.body?.event_types),
    reason: Array.isArray(result.body?.event_types) ? 'event_types is present.' : 'Expected event_types array.'
  });
  addResult(results, {
    name: 'dashboard summary top songs',
    endpoint,
    status: result.status,
    pass: Array.isArray(result.body?.top_songs_by_plays),
    reason: Array.isArray(result.body?.top_songs_by_plays) ? 'top_songs_by_plays is present.' : 'Expected top_songs_by_plays array.'
  });
}

async function checkAdminRoute(results, endpoint) {
  if (!ADMIN_TOKEN) {
    addResult(results, {
      name: `${endpoint} admin route`,
      endpoint,
      status: null,
      pass: true,
      required: false,
      skipped: true,
      reason: 'ADMIN_TOKEN is not set.'
    });
    return;
  }

  const result = await fetchJson(endpoint, { admin: true });
  addResult(results, {
    name: `${endpoint} admin route`,
    endpoint,
    status: result.status,
    pass: result.status === 200,
    reason: result.status === 200 ? 'Returned HTTP 200 with ADMIN_TOKEN.' : (result.error?.message || `Expected HTTP 200, got ${statusText(result.status)}.`)
  });
}

function printResults(results) {
  console.log('TRUE DEV smoke test checklist');
  console.log(`API base: ${TRUE_DEV_API_BASE}`);
  console.log(`Admin routes: ${ADMIN_TOKEN ? 'enabled (ADMIN_TOKEN set)' : 'skipped (ADMIN_TOKEN missing)'}`);
  console.log('');

  for (const result of results) {
    console.log(`[${iconFor(result)}] ${result.name}`);
    console.log(`  endpoint: ${result.endpoint}`);
    console.log(`  status: ${statusText(result.status)}`);
    console.log(`  reason: ${result.reason}`);
  }
}

const results = [];
await checkRadioSongs(results);
await checkDashboardSummary(results);
await checkAdminRoute(results, '/admin/ads');
await checkAdminRoute(results, '/admin/visuals/folders');
await checkAdminRoute(results, '/admin/video-factory/summary');

printResults(results);

const failedRequired = results.filter((result) => result.required && !result.pass);
process.exit(failedRequired.length > 0 ? 1 : 0);
