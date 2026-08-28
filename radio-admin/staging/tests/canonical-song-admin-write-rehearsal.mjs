import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const PROD_BASE = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const DEV_BASE = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_BUCKET = 'stashbox-radio-media-prod-us-east-1';
const pageUrl = 'http://127.0.0.1:4173/radio-admin/staging/songs/';

if (process.env.CI !== 'true') throw new Error('This write-enabled rehearsal is CI-only.');

const envPath = 'radio-admin/staging/admin-env.js';
let envSource = await fs.readFile(envPath, 'utf8');
envSource = envSource.replace('productionWritesApproved: false', 'productionWritesApproved: true');
envSource = envSource.replace('stagingProdWritesAllowed: false', 'stagingProdWritesAllowed: true');
const prodBlock = /prod: Object\.freeze\(\{([\s\S]*?)writesAllowedInStaging: false([\s\S]*?)\}\)/;
if (!prodBlock.test(envSource)) throw new Error('Could not locate PROD write lock for CI rehearsal.');
envSource = envSource.replace(prodBlock, match => match.replace('writesAllowedInStaging: false', 'writesAllowedInStaging: true'));
await fs.writeFile(envPath, envSource);

let song = {
  song_key: 'canonical-qa-song',
  song_name: 'Canonical QA Song',
  display_title: 'Canonical QA Song',
  artist: 'Stashbox',
  genre: 'Rock',
  release_format: 'single',
  song_origin: 'original',
  audio_url: `https://${PROD_BUCKET}.s3.amazonaws.com/audio/original.mp3`,
  song_artwork_url: `https://${PROD_BUCKET}.s3.amazonaws.com/artwork/original.jpg`,
  public_visibility: 'visible',
  enhanced_visuals_enabled: true,
  shuffle_visuals: true,
  visual_still_duration_seconds: 8,
  visual_assets: []
};

const writes = [];
const storagePuts = [];
const devRequests = [];
let presignCount = 0;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_prod', 'qa-prod-token'));
const page = await context.newPage();
page.on('request', request => {
  if (request.url().startsWith(DEV_BASE)) devRequests.push(`${request.method()} ${request.url()}`);
  if (request.method() === 'PUT' && request.url().includes('.s3.amazonaws.com/')) storagePuts.push(request.url());
});

await page.route(`${PROD_BASE}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/prod-v2', '');
  const method = request.method();
  const token = request.headers()['x-admin-token'];
  if (token !== 'qa-prod-token') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'missing token' }) });
  const body = () => JSON.parse(request.postData() || '{}');

  if (path === '/admin/songs' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [song] }) });
  if (path === '/admin/songs/canonical-qa-song' && method === 'PUT') {
    const payload = body(); writes.push({ method, path, payload }); song = { ...song, ...payload };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ song }) });
  }
  if (path === '/admin/uploads/presign' && method === 'POST') {
    const payload = body(); writes.push({ method, path, payload }); presignCount += 1;
    const isArtwork = payload.purpose === 'artwork';
    const key = isArtwork ? `artwork/qa-${presignCount}.jpg` : `audio/qa-${presignCount}.mp3`;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ upload_url: `https://${PROD_BUCKET}.s3.amazonaws.com/${key}?signature=qa`, public_url: `https://${PROD_BUCKET}.s3.amazonaws.com/${key}`, key }) });
  }
  if (path === '/radio/admin/songs/canonical-qa-song/artwork-images' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: { song_artwork_url: song.song_artwork_url } }) });
  }
  if (path === '/radio/admin/songs/canonical-qa-song/artwork-images' && method === 'PATCH') {
    const payload = body(); writes.push({ method, path, payload }); song = { ...song, ...payload };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: payload }) });
  }
  return route.fulfill({ status: 599, contentType: 'application/json', body: JSON.stringify({ error: `Unexpected ${method} ${path}` }) });
});

await page.route(`https://${PROD_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));

try {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.locator('button.edit-song[data-song-key="canonical-qa-song"]').click();

  await page.locator('#field-display_title').fill('Canonical QA Updated');
  const metadataResponse = page.waitForResponse(response => response.url() === `${PROD_BASE}/admin/songs/canonical-qa-song` && response.request().method() === 'PUT');
  await page.locator('#saveSongButton').click();
  await metadataResponse;
  const metadataWrite = writes.find(item => item.method === 'PUT' && item.path === '/admin/songs/canonical-qa-song');
  if (metadataWrite?.payload?.display_title !== 'Canonical QA Updated') throw new Error('Canonical metadata PUT payload was not sent to PROD correctly.');

  await page.locator('#audioFileInput').setInputFiles({ name: 'rehearsal.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fake-audio') });
  const audioPresignResponse = page.waitForResponse(response => {
    if (response.url() !== `${PROD_BASE}/admin/uploads/presign` || response.request().method() !== 'POST') return false;
    try { return JSON.parse(response.request().postData() || '{}').purpose === 'audio'; } catch { return false; }
  });
  const audioStorageResponse = page.waitForResponse(response => response.url().includes(`${PROD_BUCKET}.s3.amazonaws.com/audio/`) && response.request().method() === 'PUT');
  await page.locator('#uploadAudioButton').click();
  await Promise.all([audioPresignResponse, audioStorageResponse]);
  if (!writes.some(item => item.method === 'POST' && item.path === '/admin/uploads/presign' && item.payload?.purpose === 'audio')) throw new Error('Canonical audio presign did not use PROD API.');

  const artworkCard = page.locator('.artwork-card[data-ratio="1x1"]');
  await artworkCard.locator('.artwork-file').setInputFiles({ name: 'rehearsal.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image') });
  const artworkPatchResponse = page.waitForResponse(response => response.url() === `${PROD_BASE}/radio/admin/songs/canonical-qa-song/artwork-images` && response.request().method() === 'PATCH');
  await artworkCard.locator('.upload-artwork').click();
  await artworkPatchResponse;
  if (!writes.some(item => item.method === 'PATCH' && item.path === '/radio/admin/songs/canonical-qa-song/artwork-images')) throw new Error('Canonical artwork PATCH did not use PROD API.');

  if (storagePuts.length !== 2) throw new Error(`Expected exactly two PROD S3 PUTs, saw ${storagePuts.length}.`);
  if (devRequests.length) throw new Error(`Canonical write rehearsal reached DEV: ${devRequests.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, writes, storagePuts, devRequests }, null, 2));
} finally {
  await browser.close();
}
