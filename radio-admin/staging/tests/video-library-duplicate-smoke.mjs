import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const DEV_BUCKET = 'stashbox-radio-media-dev-us-east-1';
const baseUrl = process.env.STAGING_VIDEO_LIBRARY_DUPLICATE_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/video-library/';

let assets = [{ id: 'asset-1', asset_type: 'clip', file_name: 'existing.mp4', public_url: `https://${DEV_BUCKET}.s3.amazonaws.com/visuals/existing.mp4`, content_type: 'video/mp4', size_bytes: 100, status: 'active', caption: 'Original caption', alt_text: 'Original alt', notes: 'Original notes', shopify_product_urls: ['https://shop.example.test/original'] }];
let presignBodies = [];
let createdAssets = [];
let deletedAssets = [];
let storagePuts = [];
let prodRequests = [];
let pageErrors = [];
let nextAsset = 2;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_dev', 'qa-token'));
const page = await context.newPage();

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (url.includes('prod-v2') || url.includes('stashbox-radio-media-prod')) prodRequests.push(`${request.method()} ${url}`);
  if (request.method() === 'PUT' && url.includes('.s3.amazonaws.com/')) storagePuts.push(url);
});

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  const method = request.method();
  const body = () => JSON.parse(request.postData() || '{}');

  if (path === '/admin/songs' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [] }) });
  if (path === '/admin/visuals/folders' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ folders: [{ id: 'folder-1', folder_name: 'Duplicate QA', folder_slug: 'duplicate-qa', folder_type: 'general', status: 'active', priority: 'medium', asset_count: assets.length }] }) });
  if (path === '/admin/visuals/folders/folder-1/assets' && method === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assets }) });
  if (path === '/admin/uploads/presign' && method === 'POST') {
    const payload = body(); presignBodies.push(payload);
    const encoded = encodeURIComponent(payload.filename).replaceAll('%20', '-');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ upload_url: `https://${DEV_BUCKET}.s3.amazonaws.com/visuals/${encoded}?signature=qa`, public_url: `https://${DEV_BUCKET}.s3.amazonaws.com/visuals/${encoded}`, method: 'PUT', headers: { 'Content-Type': payload.content_type }, key: `visuals/${payload.filename}` }) });
  }
  if (path === '/admin/visuals/folders/folder-1/assets' && method === 'POST') {
    const payload = body(); createdAssets.push(payload); const asset = { id: `asset-${nextAsset++}`, status: 'active', ...payload }; assets = [...assets, asset];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ asset }) });
  }
  const assetMatch = path.match(/^\/admin\/visuals\/folders\/folder-1\/assets\/(.+)$/);
  if (assetMatch && method === 'DELETE') {
    const id = decodeURIComponent(assetMatch[1]); deletedAssets.push(id); assets = assets.map(asset => asset.id === id ? { ...asset, status: 'hidden' } : asset);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  }
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

await page.route(`https://${DEV_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));

const duplicateFile = { name: 'existing.mp4', mimeType: 'video/mp4', buffer: Buffer.from('fake-mp4') };

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.locator('button.manage-assets[data-folder-id="folder-1"]').click();
  await page.getByText('existing.mp4', { exact: true }).waitFor();
  await page.locator('#duplicateUploadAction').waitFor();
  await page.locator('#uploadAssetType').selectOption('clip');

  const presignsBeforeSkip = presignBodies.length;
  await page.locator('#duplicateUploadAction').selectOption('skip');
  await page.locator('#uploadAssetFile').setInputFiles(duplicateFile);
  await page.locator('#uploadAsset').click();
  await page.getByText(/Skipped existing\.mp4: that filename already exists/).waitFor();
  if (presignBodies.length !== presignsBeforeSkip) throw new Error('Skip duplicate unexpectedly requested a presign.');

  await page.locator('#duplicateUploadAction').selectOption('keep');
  await page.locator('#uploadAssetFile').setInputFiles(duplicateFile);
  await page.locator('#uploadAsset').click();
  await page.getByText('DEV visual asset uploaded and saved.', { exact: true }).waitFor();
  const keepPresign = presignBodies.at(-1);
  const keepAsset = createdAssets.at(-1);
  if (keepPresign?.filename !== 'existing (2).mp4' || keepAsset?.file_name !== 'existing (2).mp4') throw new Error(`Keep Both did not rename the duplicate: ${JSON.stringify({ keepPresign, keepAsset })}`);
  if (deletedAssets.length) throw new Error(`Keep Both unexpectedly hid existing assets: ${deletedAssets.join(', ')}`);

  await page.locator('#duplicateUploadAction').selectOption('replace');
  await page.locator('#uploadAssetFile').setInputFiles(duplicateFile);
  await page.locator('#uploadAsset').click();
  await page.getByText('DEV visual asset uploaded and saved.', { exact: true }).waitFor();
  const replacePresign = presignBodies.at(-1);
  const replaceAsset = createdAssets.at(-1);
  if (replacePresign?.filename !== 'existing.mp4' || replaceAsset?.file_name !== 'existing.mp4') throw new Error('Replace changed the incoming filename unexpectedly.');
  if (!deletedAssets.includes('asset-1')) throw new Error(`Replace did not hide the prior matching asset after save: ${deletedAssets.join(', ')}`);

  if (storagePuts.length !== 2) throw new Error(`Expected two storage PUTs for Keep + Replace, saw ${storagePuts.length}.`);
  if (prodRequests.length) throw new Error(`PROD request detected during duplicate handling: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Duplicate safety page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, presignBodies, createdAssets, deletedAssets, storagePuts, prodRequests }, null, 2));
} finally {
  await browser.close();
}
