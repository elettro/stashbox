import { chromium } from 'playwright';

const PROD_BASE = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const DEV_BASE = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const pageUrl = 'http://127.0.0.1:4173/radio-admin/staging/songs/';

let prodGets = 0;
let prodWrites = 0;
let devRequests = 0;
let storagePuts = 0;
const pageErrors = [];

const song = {
  song_key: 'canonical-qa-song',
  song_name: 'Canonical QA Song',
  display_title: 'Canonical QA Song',
  artist: 'Stashbox',
  genre: 'Rock',
  release_format: 'single',
  song_origin: 'original',
  audio_url: 'https://stashbox-radio-media-prod-us-east-1.s3.amazonaws.com/audio/canonical-qa-song.mp3',
  song_artwork_url: 'https://stashbox-radio-media-prod-us-east-1.s3.amazonaws.com/artwork/canonical-qa-song.jpg',
  public_visibility: 'visible',
  enhanced_visuals_enabled: true,
  shuffle_visuals: true,
  visual_still_duration_seconds: 8,
  visual_assets: []
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_prod', 'qa-prod-token'));
const page = await context.newPage();
page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (url.startsWith(DEV_BASE)) devRequests += 1;
  if (url.includes('.s3.amazonaws.com/') && request.method() === 'PUT') storagePuts += 1;
});

await page.route(`${PROD_BASE}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const method = request.method();
  const token = request.headers()['x-admin-token'];
  if (token !== 'qa-prod-token') return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'missing token' }) });

  if (method === 'GET') prodGets += 1;
  else prodWrites += 1;

  if (url.pathname === '/prod-v2/admin/songs' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [song] }) });
  }
  if (url.pathname.endsWith('/radio/admin/songs/canonical-qa-song/artwork-images') && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: { song_artwork_url: song.song_artwork_url } }) });
  }
  return route.fulfill({ status: 599, contentType: 'application/json', body: JSON.stringify({ error: `Unexpected network write/read ${method} ${url.pathname}` }) });
});

try {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.getByText('Canonical QA Song', { exact: true }).first().waitFor();
  if (prodGets < 1) throw new Error('Canonical Song CMS did not read from PROD admin songs.');
  if (devRequests !== 0) throw new Error(`Canonical Song CMS reached DEV API ${devRequests} time(s).`);

  await page.locator('button.edit-song[data-song-key="canonical-qa-song"]').click();
  await page.locator('#field-display_title').fill('Attempted PROD Change');
  await page.locator('#saveSongButton').click();
  await page.locator('#editorMessage').getByText(/Production Song CMS writes are not approved/).waitFor();
  if (prodWrites !== 0) throw new Error(`Locked metadata save reached PROD network ${prodWrites} time(s).`);

  await page.locator('#audioFileInput').setInputFiles({ name: 'locked.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('fake-audio') });
  await page.locator('#uploadAudioButton').click();
  await page.locator('#audioUploadStatus').getByText(/Production Song CMS writes are not approved/).waitFor();
  if (prodWrites !== 0 || storagePuts !== 0) throw new Error('Locked audio upload reached PROD API or storage.');

  const artworkCard = page.locator('.artwork-card[data-ratio="1x1"]');
  await artworkCard.locator('.artwork-file').setInputFiles({ name: 'locked.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake-image') });
  await artworkCard.locator('.upload-artwork').click();
  await artworkCard.locator('.artwork-status').getByText(/Production Song CMS writes are not approved/).waitFor();
  if (prodWrites !== 0 || storagePuts !== 0) throw new Error('Locked artwork upload reached PROD API or storage.');

  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
  console.log(JSON.stringify({ pass: true, prodGets, prodWrites, devRequests, storagePuts }, null, 2));
} finally {
  await browser.close();
}
