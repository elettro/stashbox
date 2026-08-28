import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const DEV_BUCKET = 'stashbox-radio-media-dev-us-east-1';
const PROD_BUCKET = 'stashbox-radio-media-prod-us-east-1';
const baseUrl = process.env.STAGING_ARTISTS_UPLOAD_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/artists/';

let presignMode = 'dev';
let currentKind = 'profile';
const presignBodies = [];
const storagePuts = [];
const prodRequests = [];
const pageErrors = [];

function devUpload(kind) { return `https://${DEV_BUCKET}.s3.amazonaws.com/artists/qa-upload-artist-${kind}.png?signature=qa`; }
function devPublic(kind) { return `https://${DEV_BUCKET}.s3.amazonaws.com/artists/qa-upload-artist-${kind}.png`; }
function prodUpload(kind) { return `https://${PROD_BUCKET}.s3.amazonaws.com/artists/qa-upload-artist-${kind}.png?signature=bad`; }
function prodPublic(kind) { return `https://${PROD_BUCKET}.s3.amazonaws.com/artists/qa-upload-artist-${kind}.png`; }

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_dev', 'qa-token'));
const page = await context.newPage();

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (url.startsWith(PROD_API) || url.includes(PROD_BUCKET)) prodRequests.push(`${request.method()} ${url}`);
  if (request.method() === 'PUT' && url.includes('.s3.amazonaws.com/')) storagePuts.push(url);
});

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  const method = request.method();

  if (path === '/radio/admin/artists' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artists: [], mode: 'platform_admin' }) });
  }
  if (path.startsWith('/admin/stats/songs') && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [] }) });
  }
  if (path === '/admin/uploads/presign' && method === 'POST') {
    const body = JSON.parse(request.postData() || '{}');
    presignBodies.push(body);
    const kind = body.song_key?.endsWith('-banner') ? 'banner' : 'profile';
    currentKind = kind;
    const payload = presignMode === 'dev'
      ? { upload_url: devUpload(kind), public_url: devPublic(kind), method: 'PUT', headers: { 'Content-Type': 'image/png' } }
      : { upload_url: prodUpload(kind), public_url: prodPublic(kind), method: 'PUT', headers: { 'Content-Type': 'image/png' } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

await page.route(`https://${DEV_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));
await page.route(`https://${PROD_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));

const imageFile = { name: 'qa-artist.png', mimeType: 'image/png', buffer: Buffer.from('fake-png-bytes') };

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#newArtist').click();
  await page.locator('#artistName').fill('QA Upload Artist');
  await page.locator('#artistKey').fill('qa-upload-artist');
  await page.locator('#artistSlug').fill('qa-upload-artist');

  await page.locator('#profileImageFile').setInputFiles(imageFile);
  await page.locator('#uploadProfileImage').click();
  await page.getByText('DEV profile image uploaded. Click Save Artist to persist this URL.', { exact: true }).waitFor();
  if ((await page.locator('#profileImageUrl').inputValue()) !== devPublic('profile')) throw new Error('DEV profile upload did not populate the expected public URL.');
  if (!storagePuts.includes(devUpload('profile'))) throw new Error('DEV profile storage PUT did not occur.');

  await page.locator('#bannerImageFile').setInputFiles(imageFile);
  await page.locator('#uploadBannerImage').click();
  await page.getByText('DEV banner image uploaded. Click Save Artist to persist this URL.', { exact: true }).waitFor();
  if ((await page.locator('#bannerImageUrl').inputValue()) !== devPublic('banner')) throw new Error('DEV banner upload did not populate the expected public URL.');
  if (!storagePuts.includes(devUpload('banner'))) throw new Error('DEV banner storage PUT did not occur.');

  const profilePresign = presignBodies.find(body => body.song_key === 'artist-qa-upload-artist-profile');
  const bannerPresign = presignBodies.find(body => body.song_key === 'artist-qa-upload-artist-banner');
  if (!profilePresign || profilePresign.purpose !== 'artwork' || profilePresign.content_type !== 'image/png' || profilePresign.artist !== 'QA Upload Artist') {
    throw new Error(`Unexpected DEV profile presign payload: ${JSON.stringify(profilePresign)}`);
  }
  if (!bannerPresign || bannerPresign.purpose !== 'artwork' || bannerPresign.content_type !== 'image/png' || bannerPresign.artist !== 'QA Upload Artist') {
    throw new Error(`Unexpected DEV banner presign payload: ${JSON.stringify(bannerPresign)}`);
  }

  presignMode = 'prod';
  const putsBefore = storagePuts.length;
  await page.locator('#profileImageFile').setInputFiles({ name: 'qa-artist-2.png', mimeType: 'image/png', buffer: Buffer.from('fake-png-bytes-2') });
  await page.locator('#uploadProfileImage').click();
  await page.getByText(/Blocked Artist upload because DEV presign returned a PROD media target/).waitFor();
  if (storagePuts.length !== putsBefore) throw new Error('A storage PUT occurred after a PROD Artist presign target should have been blocked.');
  if (prodRequests.length) throw new Error(`PROD request escaped the Artist upload guard: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, currentKind, presignBodies, storagePuts, prodRequests }, null, 2));
} finally {
  await browser.close();
}
