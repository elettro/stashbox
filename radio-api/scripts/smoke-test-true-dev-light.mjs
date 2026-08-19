#!/usr/bin/env node

// AWS optimization smoke test — 2026-08-19
// Keeps core TRUE DEV API/CMS health coverage without calling dashboard/stats routes.
// Public listener behavior and event collection are not changed.

const API_BASE = (process.env.TRUE_DEV_API_BASE || 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev').replace(/\/+$/, '');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const TIMEOUT_MS = Number.parseInt(process.env.TRUE_DEV_SMOKE_TIMEOUT_MS || '15000', 10);
const ATTEMPTS = Math.max(1, Number.parseInt(process.env.TRUE_DEV_FETCH_ATTEMPTS || '3', 10));
const RETRY_DELAY_MS = Math.max(0, Number.parseInt(process.env.TRUE_DEV_FETCH_RETRY_DELAY_MS || '1200', 10));
const RETRYABLE = new Set([429, 502, 503, 504]);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJson(pathname, { admin = false } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const headers = { accept: 'application/json' };
    if (admin && ADMIN_TOKEN) headers['x-admin-token'] = ADMIN_TOKEN;

    try {
      const response = await fetch(`${API_BASE}${pathname}`, { method: 'GET', headers, signal: controller.signal });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { preview: text.slice(0, 160) }; }
      last = { ok: response.ok, status: response.status, body, attempt };
      if (!RETRYABLE.has(response.status) || attempt === ATTEMPTS) return last;
    } catch (error) {
      last = { ok: false, status: null, body: null, error, attempt };
      if (attempt === ATTEMPTS) return last;
    } finally {
      clearTimeout(timeout);
    }

    await sleep(RETRY_DELAY_MS);
  }
  return last;
}

const results = [];

function record(name, endpoint, result, pass, reason, { required = true, skipped = false } = {}) {
  results.push({ name, endpoint, status: result?.status ?? null, pass, reason, required, skipped });
}

async function checkSongs() {
  const endpoint = '/radio/songs';
  const result = await fetchJson(endpoint);
  const songs = Array.isArray(result?.body?.songs) ? result.body.songs : Array.isArray(result?.body) ? result.body : [];
  record('radio songs', endpoint, result, result?.status === 200 && songs.length > 0,
    result?.status === 200 ? `${songs.length} visible song(s) returned.` : (result?.error?.message || `HTTP ${result?.status ?? 'n/a'}`));
}

async function checkAdmin(endpoint, name) {
  if (!ADMIN_TOKEN) {
    record(name, endpoint, null, true, 'ADMIN_TOKEN is not set.', { required: false, skipped: true });
    return;
  }
  const result = await fetchJson(endpoint, { admin: true });
  record(name, endpoint, result, result?.status === 200,
    result?.status === 200 ? 'HTTP 200.' : (result?.error?.message || `HTTP ${result?.status ?? 'n/a'}`));
}

await checkSongs();
await checkAdmin('/admin/ads', 'ads CMS');
await checkAdmin('/admin/visuals/folders', 'VEC folders');
await checkAdmin('/admin/video-factory/summary', 'video factory');

// Intentionally omitted: /dashboard/summary and /admin/stats/*.
console.log('TRUE DEV lightweight smoke test');
console.log(`API base: ${API_BASE}`);
console.log('Analytics routes: PAUSED / NOT REQUESTED');
console.log('');
for (const result of results) {
  console.log(`[${result.skipped ? 'SKIP' : result.pass ? 'PASS' : 'FAIL'}] ${result.name}`);
  console.log(`  endpoint: ${result.endpoint}`);
  console.log(`  status: ${result.status ?? 'n/a'}`);
  console.log(`  reason: ${result.reason}`);
}

const failed = results.filter(result => result.required && !result.pass);
process.exit(failed.length ? 1 : 0);
