#!/usr/bin/env node

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const API = process.env.DEV_RADIO_API || 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const BUCKET = process.env.DEV_MEDIA_BUCKET || 'stashbox-radio-media-dev-us-east-1';
const CDN = process.env.DEV_MEDIA_CDN || 'https://d1ufj7xan6uxy0.cloudfront.net';
const OUTPUT = process.env.BROWSER_AUDIO_MAP_OUTPUT || 'radio/dev/v2/desktop/browser-audio-map.js';
const CONCURRENCY = Math.max(1, Math.min(6, Number(process.env.BROWSER_AUDIO_CONCURRENCY || 3)));

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

async function exists(key) {
  try {
    await exec('aws', ['s3api', 'head-object', '--bucket', BUCKET, '--key', key], { maxBuffer: 1024 * 1024 });
    return true;
  } catch (_) { return false; }
}

async function buildOne(item, index) {
  const original = item.original;
  const sourceKey = item.sourceKey;
  const browserKey = targetKey(sourceKey);
  const browser = cdnUrl(browserKey);

  if (await exists(browserKey)) {
    console.log(`[${index + 1}] exists ${browserKey}`);
    return [original, browser];
  }

  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'stashbox-audio-'));
  const source = path.join(work, 'source.wav');
  const output = path.join(work, 'browser.mp3');
  try {
    console.log(`[${index + 1}] download ${sourceKey}`);
    await exec('aws', ['s3', 'cp', `s3://${BUCKET}/${sourceKey}`, source, '--only-show-errors'], { maxBuffer: 4 * 1024 * 1024 });

    console.log(`[${index + 1}] transcode ${browserKey}`);
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

    return [original, browser];
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}

async function worker(queue, results) {
  while (queue.length) {
    const task = queue.shift();
    if (!task) return;
    try {
      results.push(await buildOne(task.item, task.index));
    } catch (error) {
      console.error(`[${task.index + 1}] failed ${task.item.sourceKey}: ${error?.stderr || error?.message || error}`);
      throw error;
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
  let parsed;
  try { parsed = new URL(original); } catch (_) { continue; }
  if (!/\.wav$/i.test(parsed.pathname)) continue;
  const sourceKey = s3KeyFromUrl(original);
  if (!sourceKey || seen.has(original)) continue;
  seen.add(original);
  items.push({ original, sourceKey });
}

console.log(`Catalog songs: ${catalog.length}`);
console.log(`WAV derivatives requested: ${items.length}`);

const queue = items.map((item, index) => ({ item, index }));
const results = [];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, queue.length)) }, () => worker(queue, results)));

results.sort(([a], [b]) => a.localeCompare(b));
const map = Object.fromEntries(results);
const content = `(() => {\n  'use strict';\n  window.STASHBOX_BROWSER_AUDIO_MAP = Object.freeze(${JSON.stringify(map, null, 2)});\n})();\n`;
await fs.mkdir(path.dirname(OUTPUT), { recursive: true });
await fs.writeFile(OUTPUT, content);
console.log(`Wrote ${results.length} browser audio mappings to ${OUTPUT}`);
