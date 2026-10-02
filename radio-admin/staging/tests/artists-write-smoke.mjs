import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const baseUrl = process.env.STAGING_ARTISTS_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/artists/';

let artists = [{ id: 1, artist_key: 'qa-artist', name: 'QA Artist', slug: 'qa-artist', sort_name: 'QA Artist', status: 'published', location: 'DEV', profile_image_url: '', banner_image_url: '', vertical_banner_image_url: '', bio: 'Existing QA artist', follower_count: 3, verified: false, featured: false }];
const mediaByKey = new Map([
  ['qa-artist', { artist_key: 'qa-artist', slug: 'qa-artist', profile_image_url: '', horizontal_banner_image_url: '', vertical_banner_image_url: '' }]
]);

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
    mediaByKey.set(artist.artist_key, {
      artist_key: artist.artist_key,
      slug: artist.slug || artist.artist_key,
      profile_image_url: artist.profile_image_url || '',
      horizontal_banner_image_url: artist.banner_image_url || '',
      vertical_banner_image_url: artist.vertical_banner_image_url || ''
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artist }) });
  }
  const mediaMatch = path.match(/^\/radio\/admin\/artists\/([^/]+)\/media$/);
  if (mediaMatch && method === 'GET') {
    const key = decodeURIComponent(mediaMatch[1]);
    const media = mediaByKey.get(key);
    return route.fulfill({ status: media ? 200 : 404, contentType: 'application/json', body: JSON.stringify(media ? { success: true, media } : { error: 'Media not found' }) });
  }
  const detailMatch = path.match(/^\/radio\/admin\/artists\/([^/]+)$/);
  if (detailMatch && method === 'GET') {
    const key = decodeURIComponent(detailMatch[1]);
    const artist = artists.find(item => item.artist_key === key);
    return route.fulfill({ status: artist ? 200 : 404, contentType: 'application/json', body: JSON.stringify(artist ? { artist } : { error: 'Not found' }) });
  }
  if (detailMatch && method === 'PATCH') {
    const key = decodeURIComponent(detailMatch[1]);
    const update = body();
    artists = artists.map(item => item.artist_key === key ? { ...item, ...update, artist_key: key } : item);
    const artist = artists.find(item => item.artist_key === key);
    const currentMedia = mediaByKey.get(key) || { artist_key: key, slug: artist?.slug || key };
    mediaByKey.set(key, {
      ...currentMedia,
      profile_image_url: artist?.profile_image_url || '',
      horizontal_banner_image_url: artist?.banner_image_url || '',
      vertical_banner_image_url: artist?.vertical_banner_image_url || ''
    });
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
  const createRequestPromise = page.waitForRequest(request => request.method() === 'POST' && request.url() === `${DEV_HOST}/radio/admin/artists`);
  await page.locator('#saveArtist').click();
  const createRequest = await createRequestPromise;
  const createPayload = JSON.parse(createRequest.postData() || '{}');
  if (createPayload.name !== 'QA Created Artist' || createPayload.artist_key !== 'qa-created-artist') throw new Error(`Unexpected Artist POST payload: ${JSON.stringify(createPayload)}`);
  await page.locator('button.edit-artist[data-artist-key="qa-created-artist"]').waitFor();

  await page.locator('button.edit-artist[data-artist-key="qa-created-artist"]').click();
  await page.getByText('Profile media loaded and verified from DEV RDS.', { exact: true }).first().waitFor();
  await page.locator('#artistName').fill('QA Created Artist Updated');
  const patchRequestPromise = page.waitForRequest(request => request.method() === 'PATCH' && request.url() === `${DEV_HOST}/radio/admin/artists/qa-created-artist`);
  await page.locator('#saveArtist').click();
  const patchRequest = await patchRequestPromise;
  const patchPayload = JSON.parse(patchRequest.postData() || '{}');
  if (patchPayload.name !== 'QA Created Artist Updated') throw new Error(`Unexpected Artist PATCH payload: ${JSON.stringify(patchPayload)}`);

  await page.waitForResponse(response => response.request().method() === 'GET' && response.url() === `${DEV_HOST}/radio/admin/artists`);
  const updatedArtist = artists.find(item => item.artist_key === 'qa-created-artist');
  if (!updatedArtist || updatedArtist.name !== 'QA Created Artist Updated') throw new Error('PATCH did not persist the updated DEV artist name in mocked backend state.');

  const expectedWrites = [
    `POST ${DEV_HOST}/radio/admin/artists`,
    `PATCH ${DEV_HOST}/radio/admin/artists/qa-created-artist`
  ];
  for (const expected of expectedWrites) {
    if (!writes.includes(expected)) throw new Error(`Missing expected DEV Artist write: ${expected}`);
  }
  if (prodRequests.length) throw new Error(`PROD request detected: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, writes, prodRequests, createPayload, patchPayload }, null, 2));
} finally {
  await browser.close();
}
