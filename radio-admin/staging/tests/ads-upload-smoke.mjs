import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const DEV_BUCKET = 'stashbox-radio-media-dev-us-east-1';
const PROD_BUCKET = 'stashbox-radio-media-prod-us-east-1';
const DEV_UPLOAD = `https://${DEV_BUCKET}.s3.amazonaws.com/ads/qa-video.mp4?signature=qa`;
const DEV_PUBLIC = `https://${DEV_BUCKET}.s3.amazonaws.com/ads/qa-video.mp4`;
const PROD_UPLOAD = `https://${PROD_BUCKET}.s3.amazonaws.com/ads/qa-video.mp4?signature=bad`;
const PROD_PUBLIC = `https://${PROD_BUCKET}.s3.amazonaws.com/ads/qa-video.mp4`;
const baseUrl = process.env.STAGING_ADS_UPLOAD_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/ads/';

let presignMode = 'dev';
const prodRequests = [];
const storagePuts = [];
const presignBodies = [];
const pageErrors = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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

  if (path === '/admin/ads' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ads: [] }) });
  if (path === '/admin/ad-settings' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ settings: { ads_enabled: true, break_method: 'count', ads_per_break: 1, target_ad_seconds: 30, break_interval: 1 } }) });
  if (path === '/admin/uploads/presign' && method === 'POST') {
    const body = JSON.parse(request.postData() || '{}');
    presignBodies.push(body);
    const payload = presignMode === 'dev'
      ? { upload_url: DEV_UPLOAD, public_url: DEV_PUBLIC, method: 'PUT', headers: { 'Content-Type': 'video/mp4' } }
      : { upload_url: PROD_UPLOAD, public_url: PROD_PUBLIC, method: 'PUT', headers: { 'Content-Type': 'video/mp4' } };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

await page.route(`https://${DEV_BUCKET}.s3.amazonaws.com/**`, async route => {
  return route.fulfill({ status: 200, body: '' });
});
await page.route(`https://${PROD_BUCKET}.s3.amazonaws.com/**`, async route => {
  return route.fulfill({ status: 200, body: '' });
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#newAd').click();
  await page.locator('#adTitle').fill('QA Upload Ad');
  await page.locator('#adVideoFile').setInputFiles({ name: 'qa-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake-mp4-bytes') });
  await page.locator('#uploadAdVideo').click();
  await page.getByText('DEV ad video uploaded. Save the ad to persist this URL.', { exact: true }).waitFor();
  if ((await page.locator('#adVideoUrl').inputValue()) !== DEV_PUBLIC) throw new Error('Successful DEV upload did not populate the DEV public URL.');
  if (!storagePuts.includes(DEV_UPLOAD)) throw new Error('DEV storage PUT did not occur.');

  const presign = presignBodies[0] || {};
  if (presign.purpose !== 'ad_video' || presign.filename !== 'qa-video.mp4' || presign.contentType !== 'video/mp4') {
    throw new Error(`Unexpected DEV presign payload: ${JSON.stringify(presign)}`);
  }

  presignMode = 'prod';
  const putsBefore = storagePuts.length;
  await page.locator('#adVideoFile').setInputFiles({ name: 'qa-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake-mp4-bytes-2') });
  await page.locator('#uploadAdVideo').click();
  await page.getByText(/Blocked Ads upload because DEV presign returned a PROD media target/).waitFor();
  if (storagePuts.length !== putsBefore) throw new Error('A storage PUT occurred after a PROD presign target should have been blocked.');
  if (prodRequests.length) throw new Error(`PROD request escaped the upload guard: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, presignBodies, storagePuts, prodRequests }, null, 2));
} finally {
  await browser.close();
}
