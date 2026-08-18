#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const API = process.env.DEV_RADIO_API || 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const BUCKET = process.env.DEV_MEDIA_BUCKET || 'stashbox-radio-media-dev-us-east-1';
const CDN = process.env.DEV_MEDIA_CDN || 'https://d1ufj7xan6uxy0.cloudfront.net';
const OUTPUT = process.env.BROWSER_AUDIO_MAP_OUTPUT || 'radio/dev/v2/desktop/browser-audio-map.js';
const REPORT_OUTPUT = process.env.BROWSER_AUDIO_REPORT_OUTPUT || '/tmp/browser-audio-derivatives-report.json';
const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.BROWSER_AUDIO_CONCURRENCY || 3)));
const TITLE_FILTER = String(process.env.BROWSER_AUDIO_TITLE_FILTER || '').trim().toLowerCase();
const STRICT = String(process.env.BROWSER_AUDIO_STRICT || '').toLowerCase() === 'true';

const clean = value => String(value ?? '').trim();
const unwrap = value => {
  if (typeof value?.body === 'string') {
    try { return unwrap(JSON.parse(value.body)); } catch (_) { return value; }
  }
  return value;
};
const rows = value => {
  value = unwrap(value);
  if (Array.isArray(value)) return value;
  for (const key of ['songs', 'items', 'data']) if (Array.isArray(value?.[key])) return value[key];
  return [];
};

function audioUrl(song) {
  return clean(song?.audio_url || song?.resolved_audio_url || song?.audioUrl || song?.stream_url || song?.mp3_url);
}

function songTitle(song) {
  return clean(song?.display_title || song?.song_name || song?.title);
}

function s3KeyFromUrl(value) {
  const url = new URL(value);
  return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
}

function targetKey(sourceKey) {
  if (/\.wav$/i.test(sourceKey)) return sourceKey.replace(/\.wav$/i, '.browser.mp3');
  return `${sourceKey}.browser.mp3`;
}

function cdnUrl(key) {
  const encoded = key.split('/').map(part => encodeURIComponent(part)).join('/');
  return `${CDN.replace(/\/$/, '')}/${encoded}`;
}

async function readExistingMap() {
  try {
    const code = await fs.readFile(OUTPUT, 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(code, sandbox, { filename: OUTPUT });
    const map = sandbox.window.STASHBOX_BROWSER_AUDIO_MAP;
    return map && typeof map === 'object' ? { ...map } : {};
  } catch (_) {
    return {};
  }
}

async function exists(key) {
  try {
    await exec('aws', ['s3api', 'head-object', '--bucket', BUCKET, '--key', key], { maxBuffer: 1024 * 1024 });
    return true;
  } catch (_) { return false; }
}

async function downloadMaster(item, destination) {
  if (await exists(item.sourceKey)) {
    await exec('aws', ['s3', 'cp', `s3://${BUCKET}/${item.sourceKey}`, destination, '--only-show-errors'], { maxBuffer: 4 * 1024 * 1024 });
    return 's3';
  }

  try {
    await exec('curl', [
      '--fail', '--location', '--silent', '--show-error',
      '--retry', '2', '--retry-delay', '2',
      '--connect-timeout', '15', '--max-time', '180',
      '--output', destination,
      item.original
    ], { maxBuffer: 4 * 1024 * 1024 });
    const stat = await fs.stat(destination);
    if (stat.size <= 4096) throw new Error(`public-source-too-small:${stat.size}`);
    return 'public-url';
  } catch (error) {
    const missing = new Error(`source-missing:${item.sourceKey}; public-url-unavailable:${clean(error?.stderr || error?.message || error)}`);
    missing.code = 'SOURCE_MISSING';
    throw missing;
  }
}

async function buildOne(item, index) {
  const original = item.original;
  const sourceKey = item.sourceKey;
  const browserKey = targetKey(sourceKey);
  const browser = cdnUrl(browserKey);

  if (await exists(browserKey)) {
    console.log(`[${index + 1}] exists ${browserKey}`);
    return { original, browser, sourceKey, browserKey, title: item.title, status: 'existing', sourceMode: 'existing-derivative' };
  }

  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'stashbox-audio-'));
  const source = path.join(work, 'source.wav');
  const output = path.join(work, 'browser.mp3');
  try {
    console.log(`[${index + 1}] acquire ${sourceKey}`);
    const sourceMode = await downloadMaster(item, source);

    console.log(`[${index + 1}] transcode ${browserKey} from ${sourceMode}`);
    await exec('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-i', source,
      '-vn', '-map_metadata', '-1',
      '-c:a', 'libmp3lame', '-b:a', '256k', '-ar', '44100', '-ac', '2',
      output
    ], { maxBuffer: 4 * 1024 * 1024 });

    await exec('aws', [
      's3', 'cp', output, `s3://${BUCKET}/${browserKey}`,
      '--content-type', 'audio/mpeg',
      '--cache-control', 'public,max-age=31536000,immutable',
      '--only-show-errors'
    ], { maxBuffer: 4 * 1024 * 1024 });

    return { original, browser, sourceKey, browserKey, title: item.title, status: 'created', sourceMode };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

async function worker(queue, successes, failures) {
  while (queue.length) {
    const task = queue.shift();
    if (!task) return;
    try {
      successes.push(await buildOne(task.item, task.index));
    } catch (error) {
      const detail = {
        index: task.index,
        title: task.item.title,
        original: task.item.original,
        sourceKey: task.item.sourceKey,
        code: clean(error?.code || 'BUILD_FAILED'),
        error: clean(error?.stderr || error?.message || error).slice(0, 2000)
      };
      failures.push(detail);
      console.error(`[${task.index + 1}] skipped ${task.item.sourceKey}: ${detail.error}`);
    }
  }
}

const response = await fetch(`${API}/radio/songs?browser_audio_derivatives=${Date.now()}`, {
  headers: { Accept: 'application/json', Origin: 'https://stashbox.com' }
});
if (!response.ok) throw new Error(`Song catalog HTTP ${response.status}`);
const catalog = rows(await response.json());

const seen = new Set();
const items = [];
for (const song of catalog) {
  const original = audioUrl(song);
  if (!original) continue;
  const title = songTitle(song);
  if (TITLE_FILTER && !`${title} ${original}`.toLowerCase().includes(TITLE_FILTER)) continue;
  let parsed;
  try { parsed = new URL(original); } catch (_) { continue; }
  if (!/\.wav$/i.test(parsed.pathname)) continue;
  const sourceKey = s3KeyFromUrl(original);
  if (!sourceKey || seen.has(original)) continue;
  seen.add(original);
  items.push({ original, sourceKey, title });
}

console.log(`Catalog songs: ${catalog.length}`);
console.log(`Filter: ${TITLE_FILTER || '(all WAV songs)'}`);
console.log(`WAV derivatives requested: ${items.length}`);

const queue = items.map((item, index) => ({ item, index }));
const successes = [];
const failures = [];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, queue.length)) }, () => worker(queue, successes, failures)));

const map = await readExistingMap();
for (const result of successes) map[result.original] = result.browser;
const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
const content = `(() => {\n  'use strict';\n  window.STASHBOX_BROWSER_AUDIO_MAP = Object.freeze(${JSON.stringify(sorted, null, 2)});\n})();\n`;
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, content);

const report = {
  generatedAt: new Date().toISOString(),
  catalogSongs: catalog.length,
  filter: TITLE_FILTER || null,
  requested: items.length,
  successful: successes.length,
  created: successes.filter(item => item.status === 'created').length,
  existing: successes.filter(item => item.status === 'existing').length,
  recoveredFromPublicUrl: successes.filter(item => item.sourceMode === 'public-url').length,
  failed: failures.length,
  mapSize: Object.keys(sorted).length,
  failures,
  successes: successes.map(({ original, browser, sourceKey, browserKey, title, status, sourceMode }) => ({ original, browser, sourceKey, browserKey, title, status, sourceMode }))
};
await fs.mkdir(path.dirname(REPORT_OUTPUT), { recursive: true });
await fs.writeFile(REPORT_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);

console.log(`Wrote ${report.mapSize} total browser audio mappings to ${OUTPUT}`);
console.log(`Batch result: ${report.successful} successful, ${report.failed} skipped, ${report.recoveredFromPublicUrl} recovered from public master URLs.`);
if (failures.length) console.log(`Skipped sources are recorded in ${REPORT_OUTPUT}.`);

if (STRICT && failures.length) {
  throw new Error(`Strict derivative batch failed for ${failures.length} source(s).`);
}
