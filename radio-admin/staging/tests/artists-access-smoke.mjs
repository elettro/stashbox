import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const ARTIST_KEY = 'qa-artist';
const baseUrl = process.env.STAGING_ARTISTS_ACCESS_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/artists/';

const artist = {
  id: 'qa-artist-id', artist_key: ARTIST_KEY, name: 'QA Artist', slug: ARTIST_KEY,
  sort_name: 'QA Artist', status: 'published', location: 'DEV', profile_image_url: '',
  banner_image_url: '', vertical_banner_image_url: '', follower_count: 3, verified: false, featured: false
};
let access = [{
  user_id: 'existing-user', email: 'manager@example.com', display_name: 'Existing Manager',
  artist_key: ARTIST_KEY, access_level: 'editor', status: 'approved'
}];
const grantBodies = [];
const prodRequests = [];
const pageErrors = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_dev', 'qa-token'));
const page = await context.newPage();

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  if (request.url().startsWith(PROD_HOST)) prodRequests.push(`${request.method()} ${request.url()}`);
});

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  const method = request.method();

  if (request.headers()['x-admin-token'] !== 'qa-token') {
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Missing DEV admin token' }) });
  }
  if (path === '/radio/admin/artists' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, mode: 'platform_admin', artists: [artist] }) });
  }
  if (path.startsWith('/admin/stats/songs') && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [] }) });
  }
  if (path === `/radio/admin/artists/${ARTIST_KEY}` && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, mode: 'platform_admin', artist }) });
  }
  if (path === `/radio/admin/artists/${ARTIST_KEY}/media` && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, media: { artist_key: ARTIST_KEY, slug: ARTIST_KEY, profile_image_url: '', horizontal_banner_image_url: '', vertical_banner_image_url: '' } }) });
  }
  if (path === `/radio/admin/artists/${ARTIST_KEY}/access` && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, access }) });
  }
  if (path === `/radio/admin/artists/${ARTIST_KEY}/access` && method === 'POST') {
    const body = JSON.parse(request.postData() || '{}');
    grantBodies.push(body);
    access = [...access, {
      user_id: 'qa-new-user', email: body.email, display_name: 'QA New Manager', artist_key: ARTIST_KEY,
      access_level: body.access_level, status: body.status
    }];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, access }) });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled QA route ${method} ${path}` }) });
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator(`button.edit-artist[data-artist-key="${ARTIST_KEY}"]`).click();
  await page.getByText('manager@example.com', { exact: true }).waitFor();
  await page.getByText('Loaded 1 DEV access assignment.', { exact: true }).waitFor();

  await page.locator('#accessEmail').fill('qa-new@example.com');
  await page.locator('#accessRole').selectOption('band_manager');
  await page.locator('#accessLevel').selectOption('manager');
  const grantRequestPromise = page.waitForRequest(request => request.method() === 'POST' && request.url() === `${DEV_HOST}/radio/admin/artists/${ARTIST_KEY}/access`);
  await page.locator('#grantAccess').click();
  const grantRequest = await grantRequestPromise;
  const grantBody = JSON.parse(grantRequest.postData() || '{}');

  if (grantBody.email !== 'qa-new@example.com' || grantBody.role !== 'band_manager' || grantBody.access_level !== 'manager' || grantBody.status !== 'approved') {
    throw new Error(`Unexpected Artist access grant payload: ${JSON.stringify(grantBody)}`);
  }
  await page.getByText('qa-new@example.com', { exact: true }).waitFor();
  await page.getByText('DEV artist access granted to qa-new@example.com.', { exact: true }).waitFor();
  if (grantBodies.length !== 1) throw new Error(`Expected one DEV access grant, saw ${grantBodies.length}.`);
  if (prodRequests.length) throw new Error(`PROD request detected during Artist access QA: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, grantBody, access, prodRequests }, null, 2));
} finally {
  await browser.close();
}
