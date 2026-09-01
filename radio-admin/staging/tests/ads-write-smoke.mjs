import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const baseUrl = process.env.STAGING_ADS_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/ads/';

let settings = { ads_enabled: true, break_method: 'count', ads_per_break: 1, target_ad_seconds: 30, break_interval: 1 };
let ads = [{
  id: 'qa-ad-1', internal_title: 'QA Existing Ad', description: 'existing', ad_type: 'Sponsor Ad', video_url: 'https://example.test/existing.mp4', click_url: '', ad_ratio_label: '16:9', frequency: 'Medium', skip_after_seconds: 5, no_skipping: false, active: true, hidden: false, genre_targeting: '', mood_targeting: '', artist_targeting: '', song_targeting: '', start_date: '2026-08-28', end_date: null, notes: '', views: 10, clicks: 2, skips: 1
}];

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
page.on('dialog', dialog => dialog.accept());

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  const method = request.method();
  const json = () => JSON.parse(request.postData() || '{}');

  if (path === '/admin/ad-settings' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings }) });
  if (path === '/admin/ad-settings' && method === 'PUT') {
    settings = { ...settings, ...json() };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings }) });
  }
  if (path === '/admin/ads' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ads }) });
  if (path === '/admin/ads' && method === 'POST') {
    const ad = { id: 'qa-created-ad', views: 0, clicks: 0, skips: 0, ...json() };
    ads = [ad, ...ads];
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ad }) });
  }
  if (path.startsWith('/admin/ads/') && method === 'PUT') {
    const id = decodeURIComponent(path.split('/').pop());
    const body = json();
    ads = ads.map(ad => ad.id === id ? { ...ad, ...body, id } : ad);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ad: ads.find(ad => ad.id === id) }) });
  }
  if (path.startsWith('/admin/ads/') && method === 'DELETE') {
    const id = decodeURIComponent(path.split('/').pop());
    ads = ads.filter(ad => ad.id !== id);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled QA route ${method} ${path}` }) });
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('QA Existing Ad', { exact: true }).waitFor();

  await page.locator('#breakInterval').selectOption('2');
  await page.locator('#saveAdSettings').click();
  await page.getByText('DEV ad settings saved to RDS.', { exact: true }).waitFor();
  if (settings.break_interval !== 2) throw new Error('DEV ad settings PUT did not persist the break interval.');

  await page.locator('#newAd').click();
  await page.locator('#adTitle').fill('QA Created Ad');
  await page.locator('#adVideoUrl').fill('https://example.test/created.mp4');
  await page.locator('#adType').selectOption('Sponsor Ad');
  await page.locator('#adActive').check();
  await page.locator('#saveAd').click();
  await page.locator('button.edit-ad[data-ad-id="qa-created-ad"]').waitFor();

  await page.locator('button.edit-ad[data-ad-id="qa-created-ad"]').click();
  await page.locator('#adTitle').fill('QA Created Ad Updated');
  await page.locator('#saveAd').click();
  await page.getByText('QA Created Ad Updated', { exact: true }).waitFor();

  await page.locator('button.edit-ad[data-ad-id="qa-created-ad"]').click();
  await page.locator('#deleteAd').click();
  await page.waitForFunction(() => !document.querySelector('button.edit-ad[data-ad-id="qa-created-ad"]'));

  const requiredWrites = [
    `PUT ${DEV_HOST}/admin/ad-settings`,
    `POST ${DEV_HOST}/admin/ads`,
    `PUT ${DEV_HOST}/admin/ads/qa-created-ad`,
    `DELETE ${DEV_HOST}/admin/ads/qa-created-ad`
  ];
  for (const expected of requiredWrites) {
    if (!writes.includes(expected)) throw new Error(`Missing expected DEV Ads write: ${expected}`);
  }
  if (prodRequests.length) throw new Error(`PROD request detected: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, writes, prodRequests, settings }, null, 2));
} finally {
  await browser.close();
}
