import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const DEV_BUCKET = 'stashbox-radio-media-dev-us-east-1';
const PROD_BUCKET = 'stashbox-radio-media-prod-us-east-1';
const baseUrl = process.env.STAGING_VEC_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/vec/';

const devApiWrites = [];
const storageWrites = [];
const escapedProdRequests = [];
const pageErrors = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_dev', 'qa-token'));
const page = await context.newPage();

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (url.startsWith(PROD_HOST) || url.includes(PROD_BUCKET)) escapedProdRequests.push(`${request.method()} ${url}`);
  if (url.startsWith(DEV_HOST) && !['GET', 'HEAD'].includes(request.method())) devApiWrites.push(`${request.method()} ${url}`);
  if (url.includes('.s3.amazonaws.com') && !['GET', 'HEAD'].includes(request.method())) storageWrites.push(`${request.method()} ${url}`);
});

function payloadFor(path) {
  if (path === '/admin/songs') return { songs: [{ song_key: 'qa-song', song_name: 'QA Song', display_title: 'QA Song', artist: 'QA Artist', genre: 'Rock', audio_url: 'https://example.test/qa.mp3', public_visibility: 'visible' }] };
  if (path === '/admin/visuals/folders') return { folders: [] };
  if (path.startsWith('/admin/vec/song-assets')) return { assets: [] };
  if (path.startsWith('/admin/vec/recipe')) return { success: true, recipe: null };
  return {};
}

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  if (request.headers()['x-admin-token'] !== 'qa-token') {
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Missing DEV admin token' }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payloadFor(path)) });
});
await page.route(`${PROD_HOST}/**`, async route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
await page.route(`https://${DEV_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));
await page.route(`https://${PROD_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  const legacyToken = await page.evaluate(() => localStorage.getItem('stashbox_admin_token_dev'));
  if (legacyToken !== 'qa-token') throw new Error('VEC legacy token lookup did not resolve the namespaced DEV token.');

  const recipeResult = await page.evaluate(async devHost => {
    const response = await fetch(`${devHost}/admin/vec/recipe`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': 'qa-token' },
      body: JSON.stringify({ song_key: 'qa-song', recipe: { visual_mode: 'custom' } })
    });
    return { ok: response.ok, status: response.status };
  }, DEV_HOST);
  if (!recipeResult.ok) throw new Error(`DEV VEC recipe write was unexpectedly blocked: ${JSON.stringify(recipeResult)}`);

  const devStorageUrl = `https://${DEV_BUCKET}.s3.amazonaws.com/vec/qa.png?signature=qa`;
  const storageResult = await page.evaluate(async url => {
    const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: 'qa' });
    return { ok: response.ok, status: response.status };
  }, devStorageUrl);
  if (!storageResult.ok) throw new Error(`DEV VEC storage write was unexpectedly blocked: ${JSON.stringify(storageResult)}`);

  const prodApiError = await page.evaluate(async prodHost => {
    try { await fetch(`${prodHost}/admin/vec/recipe`); return ''; }
    catch (error) { return error.message || String(error); }
  }, PROD_HOST);
  if (!/Blocked VEC request to PROD API/.test(prodApiError)) throw new Error(`PROD VEC API was not blocked by migration guard: ${prodApiError}`);

  const prodStorageError = await page.evaluate(async bucket => {
    try { await fetch(`https://${bucket}.s3.amazonaws.com/vec/bad.png`, { method: 'PUT', body: 'bad' }); return ''; }
    catch (error) { return error.message || String(error); }
  }, PROD_BUCKET);
  if (!/Blocked VEC storage write to PROD media bucket/.test(prodStorageError)) throw new Error(`PROD VEC storage write was not blocked: ${prodStorageError}`);

  const unknownStorageError = await page.evaluate(async () => {
    try { await fetch('https://unapproved-bucket.s3.amazonaws.com/vec/bad.png', { method: 'PUT', body: 'bad' }); return ''; }
    catch (error) { return error.message || String(error); }
  });
  if (!/outside the expected DEV media bucket/.test(unknownStorageError)) throw new Error(`Unknown VEC storage write was not blocked: ${unknownStorageError}`);

  if (!devApiWrites.includes(`PUT ${DEV_HOST}/admin/vec/recipe`)) throw new Error(`Expected DEV VEC recipe PUT not observed: ${JSON.stringify(devApiWrites)}`);
  if (!storageWrites.includes(`PUT ${devStorageUrl}`)) throw new Error(`Expected DEV VEC storage PUT not observed: ${JSON.stringify(storageWrites)}`);
  if (escapedProdRequests.length) throw new Error(`PROD request escaped VEC guard: ${escapedProdRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, devApiWrites, storageWrites, escapedProdRequests, prodApiError, prodStorageError, unknownStorageError }, null, 2));
} finally {
  await browser.close();
}
