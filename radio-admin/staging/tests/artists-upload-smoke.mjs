import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_API = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const DEV_BUCKET = 'stashbox-radio-media-dev-us-east-1';
const PROD_BUCKET = 'stashbox-radio-media-prod-us-east-1';
const ARTIST_KEY = 'qa-artist';
const baseUrl = process.env.STAGING_ARTISTS_UPLOAD_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/artists/';

let presignMode = 'dev';
let media = {
  artist_key: ARTIST_KEY,
  slug: ARTIST_KEY,
  profile_image_url: '',
  horizontal_banner_image_url: '',
  vertical_banner_image_url: ''
};
const presignBodies = [];
const mediaPatchBodies = [];
const storagePuts = [];
const prodRequests = [];
const pageErrors = [];

const kindForPurpose = {
  profile_image: 'profile',
  horizontal_banner: 'banner',
  vertical_banner: 'vertical-banner'
};

function devUpload(kind) { return `https://${DEV_BUCKET}.s3.amazonaws.com/artist-profiles/${ARTIST_KEY}/${kind}/qa.png?signature=qa`; }
function devPublic(kind) { return `https://${DEV_BUCKET}.s3.amazonaws.com/artist-profiles/${ARTIST_KEY}/${kind}/qa.png`; }
function prodUpload(kind) { return `https://${PROD_BUCKET}.s3.amazonaws.com/artist-profiles/${ARTIST_KEY}/${kind}/qa.png?signature=bad`; }
function prodPublic(kind) { return `https://${PROD_BUCKET}.s3.amazonaws.com/artist-profiles/${ARTIST_KEY}/${kind}/qa.png`; }

const artist = {
  id: 'qa-artist-id',
  artist_key: ARTIST_KEY,
  name: 'QA Artist',
  slug: ARTIST_KEY,
  sort_name: 'QA Artist',
  status: 'published',
  location: 'DEV',
  profile_image_url: '',
  banner_image_url: '',
  vertical_banner_image_url: '',
  follower_count: 3,
  verified: false,
  featured: false
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
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
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artists: [artist], mode: 'platform_admin' }) });
  }
  if (path.startsWith('/admin/stats/songs') && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [] }) });
  }
  if (path === `/radio/admin/artists/${ARTIST_KEY}` && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ artist }) });
  }
  if (path === `/radio/admin/artists/${ARTIST_KEY}/media` && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, media }) });
  }
  if (path === `/radio/admin/artists/${ARTIST_KEY}/media` && method === 'PATCH') {
    const patch = JSON.parse(request.postData() || '{}');
    mediaPatchBodies.push(patch);
    if (Object.prototype.hasOwnProperty.call(patch, 'profile_image_url')) media.profile_image_url = patch.profile_image_url || '';
    if (Object.prototype.hasOwnProperty.call(patch, 'horizontal_banner_image_url')) media.horizontal_banner_image_url = patch.horizontal_banner_image_url || '';
    if (Object.prototype.hasOwnProperty.call(patch, 'vertical_banner_image_url')) media.vertical_banner_image_url = patch.vertical_banner_image_url || '';
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, persisted: true, media }) });
  }
  if (path === `/radio/admin/artists/${ARTIST_KEY}/media/presign` && method === 'POST') {
    const body = JSON.parse(request.postData() || '{}');
    presignBodies.push(body);
    const kind = kindForPurpose[body.purpose] || 'unknown';
    const payload = presignMode === 'dev'
      ? { success: true, upload_url: devUpload(kind), public_url: devPublic(kind), method: 'PUT', headers: { 'Content-Type': body.content_type || 'image/png' }, purpose: body.purpose }
      : { success: true, upload_url: prodUpload(kind), public_url: prodPublic(kind), method: 'PUT', headers: { 'Content-Type': body.content_type || 'image/png' }, purpose: body.purpose };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled QA route ${method} ${path}` }) });
});

await page.route(`https://${DEV_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));
await page.route(`https://${PROD_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));

const imageFile = { name: 'qa-artist.png', mimeType: 'image/png', buffer: Buffer.from('fake-png-bytes') };

async function uploadAndVerify({ fileInput, button, statusText, purpose, field, kind }) {
  await page.locator(fileInput).setInputFiles(imageFile);
  await page.locator(button).click();
  await page.getByText(statusText, { exact: true }).waitFor();
  if (!storagePuts.includes(devUpload(kind))) throw new Error(`DEV ${kind} storage PUT did not occur.`);
  if (media[field] !== devPublic(kind)) throw new Error(`DEV ${kind} URL did not survive media PATCH/read-back.`);
  const presign = presignBodies.find(body => body.purpose === purpose);
  if (!presign || presign.filename !== 'qa-artist.png' || presign.content_type !== 'image/png' || !Number.isFinite(Number(presign.size_bytes))) {
    throw new Error(`Unexpected ${purpose} presign payload: ${JSON.stringify(presign)}`);
  }
  const patch = mediaPatchBodies.find(body => body[field] === devPublic(kind));
  if (!patch) throw new Error(`Missing ${field} media PATCH after ${kind} upload.`);
}

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator(`button.edit-artist[data-artist-key="${ARTIST_KEY}"]`).click();
  await page.getByText('Profile media loaded and verified from DEV RDS.', { exact: true }).first().waitFor();

  await uploadAndVerify({
    fileInput: '#profileImageFile',
    button: '#uploadProfileImage',
    statusText: 'DEV profile image uploaded, saved, and verified.',
    purpose: 'profile_image',
    field: 'profile_image_url',
    kind: 'profile'
  });
  await uploadAndVerify({
    fileInput: '#bannerImageFile',
    button: '#uploadBannerImage',
    statusText: 'DEV horizontal banner uploaded, saved, and verified.',
    purpose: 'horizontal_banner',
    field: 'horizontal_banner_image_url',
    kind: 'banner'
  });
  await uploadAndVerify({
    fileInput: '#verticalBannerImageFile',
    button: '#uploadVerticalBannerImage',
    statusText: 'DEV vertical banner uploaded, saved, and verified.',
    purpose: 'vertical_banner',
    field: 'vertical_banner_image_url',
    kind: 'vertical-banner'
  });

  await page.locator('#deleteProfileImage').click();
  await page.getByText('DEV profile image removal verified in RDS.', { exact: true }).waitFor();
  if (media.profile_image_url !== '') throw new Error('DEV profile image removal did not survive fresh read-back.');
  if (!mediaPatchBodies.some(body => Object.prototype.hasOwnProperty.call(body, 'profile_image_url') && body.profile_image_url === '')) {
    throw new Error('Missing blank profile_image_url PATCH for removal.');
  }

  presignMode = 'prod';
  const putsBefore = storagePuts.length;
  const patchesBefore = mediaPatchBodies.length;
  await page.locator('#profileImageFile').setInputFiles({ name: 'qa-artist-2.png', mimeType: 'image/png', buffer: Buffer.from('fake-png-bytes-2') });
  await page.locator('#uploadProfileImage').click();
  await page.getByText(/Blocked Artist upload because DEV presign returned a PROD media target/).waitFor();
  if (storagePuts.length !== putsBefore) throw new Error('A storage PUT occurred after a PROD Artist presign target should have been blocked.');
  if (mediaPatchBodies.length !== patchesBefore) throw new Error('A media PATCH occurred after a PROD Artist presign target should have been blocked.');
  if (prodRequests.length) throw new Error(`PROD request escaped the Artist media guard: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, presignBodies, mediaPatchBodies, storagePuts, prodRequests, media }, null, 2));
} finally {
  await browser.close();
}
