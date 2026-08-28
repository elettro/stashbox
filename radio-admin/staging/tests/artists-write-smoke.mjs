import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const baseUrl = process.env.STAGING_ARTISTS_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/artists/';

let artists = [{ id: 1, artist_key: 'qa-artist', name: 'QA Artist', slug: 'qa-artist', sort_name: 'QA Artist', status: 'published', location: 'DEV', profile_image_url: '', banner_image_url: '', bio: 'Existing QA artist', follower_count: 3, verified: false, featured: false }];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_dev', 'qa-token'));
const page = await context.newPage();
const prodRequests = [];
const writes = [];
const pageErrors = [];

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (url.startsWith(PROD_HOST)) prodRequests.push(`${request.method()} ${url}`);
  if (url.startsWith(DEV_HOST) && !['GET', 'HEAD'].includes(request.method())) writes.push(`${request.method()} ${url}`);
});

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  const method = request.method();
  const body = () => JSON.parse(request.postData() || '{}');

  if (path.startsWith('/admin/stats/songs') && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [] }) });
  if (path === '/radio/admin/artists' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artists, mode: 'platform_admin' }) });
  if (path === '/radio/admin/artists' && method === 'POST') {
    const artist = { id: 2, follower_count: 0, ...body() };
    artists = [artist, ...artists];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artist }) });
  }
  if (path.startsWith('/radio/admin/artists/') && method === 'GET') {
    const key = decodeURIComponent(path.split('/').pop());
    const artist = artists.find(item => item.artist_key === key);
    return route.fulfill({ status: artist ? 200 : 404, contentType: 'application/json', body: JSON.stringify(artist ? { artist } : { error: 'Not found' }) });
  }
  if (path.startsWith('/radio/admin/artists/') && method === 'PATCH') {
    const key = decodeURIComponent(path.split('/').pop());
    const update = body();
    artists = artists.map(item => item.artist_key === key ? { ...item, ...update, artist_key: key } : item);
    const artist = artists.find(item => item.artist_key === key);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artist }) });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled QA route ${method} ${path}` }) });
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('QA Artist', { exact: true }).waitFor();

  await page.locator('#newArtist').click();
  await page.locator('#artistName').fill('QA Created Artist');
  await page.locator('#artistKey').fill('qa-created-artist');
  await page.locator('#artistSlug').fill('qa-created-artist');
  await page.locator('#saveArtist').click();
  await page.locator('button.edit-artist[data-artist-key="qa-created-artist"]').waitFor();

  await page.locator('button.edit-artist[data-artist-key="qa-created-artist"]').click();
  await page.locator('#artistName').fill('QA Created Artist Updated');
  await page.locator('#saveArtist').click();
  await page.getByText('QA Created Artist Updated', { exact: true }).waitFor();

  const expectedWrites = [
    `POST ${DEV_HOST}/radio/admin/artists`,
    `PATCH ${DEV_HOST}/radio/admin/artists/qa-created-artist`
  ];
  for (const expected of expectedWrites) {
    if (!writes.includes(expected)) throw new Error(`Missing expected DEV Artist write: ${expected}`);
  }
  if (prodRequests.length) throw new Error(`PROD request detected: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, writes, prodRequests }, null, 2));
} finally {
  await browser.close();
}
