import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const DEV_BUCKET = 'stashbox-radio-media-dev-us-east-1';
const PROD_BUCKET = 'stashbox-radio-media-prod-us-east-1';
const baseUrl = process.env.STAGING_VIDEO_LIBRARY_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/video-library/';
const DEV_UPLOAD = `https://${DEV_BUCKET}.s3.amazonaws.com/visuals/qa-upload.png?signature=qa`;
const DEV_PUBLIC = `https://${DEV_BUCKET}.s3.amazonaws.com/visuals/qa-upload.png`;
const PROD_UPLOAD = `https://${PROD_BUCKET}.s3.amazonaws.com/visuals/qa-upload.png?signature=bad`;
const PROD_PUBLIC = `https://${PROD_BUCKET}.s3.amazonaws.com/visuals/qa-upload.png`;

let folders = [{ id: 'folder-1', folder_name: 'QA Folder', folder_slug: 'qa-folder', folder_type: 'general', status: 'active', priority: 'medium', description: 'Existing', notes: '', relevant_artists: ['QA Artist'], relevant_genres: ['Rock'], relevant_moods: [], relevant_songs: [], asset_count: 1 }];
let assets = [{ id: 'asset-1', asset_type: 'clip', file_name: 'existing.mp4', public_url: `https://${DEV_BUCKET}.s3.amazonaws.com/visuals/existing.mp4`, content_type: 'video/mp4', status: 'active', caption: 'Existing caption', alt_text: '', notes: '', shopify_product_urls: [] }];
let presignMode = 'dev';
let createFolderPayload = null;
let updateFolderPayload = null;
let mappingPayload = null;
let createAssetPayload = null;
const assetPutPayloads = [];
const writes = [];
const writeHeaders = [];
const storagePuts = [];
const prodRequests = [];
const pageErrors = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_dev', 'qa-token'));
const page = await context.newPage();

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (url.startsWith(PROD_HOST) || url.includes(PROD_BUCKET)) prodRequests.push(`${request.method()} ${url}`);
  if (url.startsWith(DEV_HOST) && !['GET', 'HEAD'].includes(request.method())) {
    writes.push(`${request.method()} ${url}`);
    writeHeaders.push({ url, token: request.headers()['x-admin-token'] || '' });
  }
  if (request.method() === 'PUT' && url.includes('.s3.amazonaws.com/')) storagePuts.push(url);
});

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  const method = request.method();
  const body = () => JSON.parse(request.postData() || '{}');

  if (path === '/admin/songs' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [{ song_key: 'qa-song', display_title: 'QA Song', artist: 'QA Artist' }] }) });
  }
  if (path === '/admin/visuals/folders' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, folders }) });
  }
  if (path === '/admin/visuals/folders' && method === 'POST') {
    createFolderPayload = body();
    const folder = { id: 'created-folder', folder_slug: 'created-folder', asset_count: 0, ...createFolderPayload };
    folders = [...folders, folder];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, folder }) });
  }
  if (path === '/admin/visuals/folders/created-folder' && method === 'PUT') {
    updateFolderPayload = body();
    folders = folders.map(folder => folder.id === 'created-folder' ? { ...folder, ...updateFolderPayload } : folder);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, folder: folders.find(folder => folder.id === 'created-folder') }) });
  }
  if (path === '/admin/visuals/song-folders/qa-song' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ visual_mix_mode: 'direct_first', folders: folders.map(folder => ({ ...folder, selected: false })) }) });
  }
  if (path === '/admin/visuals/song-folders/qa-song' && method === 'PUT') {
    mappingPayload = body();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ visual_mix_mode: mappingPayload.visual_mix_mode, folders: folders.map(folder => ({ ...folder, selected: mappingPayload.folder_ids.includes(folder.id) })) }) });
  }
  if (path === '/admin/visuals/folders/folder-1/assets' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ assets }) });
  }
  if (path === '/admin/visuals/folders/folder-1/assets' && method === 'POST') {
    createAssetPayload = body();
    const asset = { id: 'asset-2', status: 'active', ...createAssetPayload };
    assets = [...assets, asset];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ asset }) });
  }
  if (path === '/admin/visuals/folders/folder-1/assets/asset-1' && method === 'PUT') {
    const payload = body(); assetPutPayloads.push(payload); assets = assets.map(asset => asset.id === 'asset-1' ? { ...asset, ...payload } : asset);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ asset: assets.find(asset => asset.id === 'asset-1') }) });
  }
  if (path === '/admin/visuals/folders/folder-1/assets/asset-1' && method === 'DELETE') {
    assets = assets.map(asset => asset.id === 'asset-1' ? { ...asset, status: 'hidden' } : asset);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  }
  if (path === '/admin/uploads/presign' && method === 'POST') {
    const payload = presignMode === 'dev'
      ? { upload_url: DEV_UPLOAD, public_url: DEV_PUBLIC, method: 'PUT', headers: { 'Content-Type': 'image/png' }, key: 'visuals/qa-upload.png' }
      : { upload_url: PROD_UPLOAD, public_url: PROD_PUBLIC, method: 'PUT', headers: { 'Content-Type': 'image/png' }, key: 'visuals/qa-upload.png' };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled Video Library QA route ${method} ${path}` }) });
});

await page.route(`https://${DEV_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));
await page.route(`https://${PROD_BUCKET}.s3.amazonaws.com/**`, async route => route.fulfill({ status: 200, body: '' }));

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('QA Folder', { exact: true }).waitFor();

  await page.locator('#newFolder').click();
  await page.locator('#folderName').fill('Created Folder');
  await page.locator('#folderType').selectOption('artist');
  await page.locator('#folderPriority').selectOption('high');
  await page.locator('#folderArtists').fill('QA Artist, Second Artist');
  await page.locator('#folderGenres').fill('Rock');
  await page.locator('#saveFolder').click();
  await page.getByText('Created Folder', { exact: true }).waitFor();
  if (!createFolderPayload || createFolderPayload.folder_name !== 'Created Folder' || createFolderPayload.folder_type !== 'artist' || !createFolderPayload.relevant_artists.includes('Second Artist')) {
    throw new Error(`Unexpected Visual Folder POST payload: ${JSON.stringify(createFolderPayload)}`);
  }

  await page.locator('button.edit-folder[data-folder-id="created-folder"]').click();
  await page.locator('#folderDescription').fill('Updated in migration QA');
  await page.locator('#saveFolder').click();
  await page.getByText('Created Folder', { exact: true }).waitFor();
  if (!updateFolderPayload || updateFolderPayload.description !== 'Updated in migration QA') throw new Error(`Unexpected Visual Folder PUT payload: ${JSON.stringify(updateFolderPayload)}`);

  await page.locator('#mappingSong').selectOption('qa-song');
  await page.locator('#mappingFolders input[value="folder-1"]').waitFor();
  await page.locator('#mappingFolders input[value="folder-1"]').check();
  await page.locator('#visualMixMode').selectOption('direct_plus_relevant');
  await page.locator('#saveMapping').click();
  await page.getByText('DEV song visual mapping saved.', { exact: true }).waitFor();
  if (!mappingPayload || mappingPayload.visual_mix_mode !== 'direct_plus_relevant' || !mappingPayload.folder_ids.includes('folder-1')) throw new Error(`Unexpected song mapping payload: ${JSON.stringify(mappingPayload)}`);

  await page.locator('button.manage-assets[data-folder-id="folder-1"]').click();
  await page.getByText('existing.mp4', { exact: true }).waitFor();
  const assetCard = page.locator('[data-asset-id="asset-1"]');
  await assetCard.locator('.asset-caption').fill('Updated caption');
  await assetCard.locator('.asset-products').fill('https://shop.example.test/p/1\nhttps://shop.example.test/p/2');
  await assetCard.locator('.save-asset').click();
  await page.getByText('DEV asset details saved and verified.', { exact: true }).waitFor();
  if (!assetPutPayloads.some(payload => payload.caption === 'Updated caption' && payload.shopify_product_urls?.length === 2)) throw new Error(`Asset metadata PUT missing: ${JSON.stringify(assetPutPayloads)}`);

  await page.locator('[data-asset-id="asset-1"] .toggle-asset').click();
  await page.getByText('DEV asset status changed to hidden.', { exact: true }).waitFor();
  if (!assetPutPayloads.some(payload => payload.status === 'hidden')) throw new Error('Asset status PUT was not emitted.');

  await page.locator('#uploadAssetType').selectOption('image');
  await page.locator('#uploadAssetFile').setInputFiles({ name: 'qa-upload.png', mimeType: 'image/png', buffer: Buffer.from('fake-png') });
  await page.locator('#uploadCaption').fill('QA uploaded image');
  await page.locator('#uploadAsset').click();
  await page.getByText('DEV visual asset uploaded and saved.', { exact: true }).waitFor();
  if (!storagePuts.includes(DEV_UPLOAD)) throw new Error('DEV Visual Library S3 PUT did not occur.');
  if (!createAssetPayload || createAssetPayload.asset_type !== 'image' || createAssetPayload.public_url !== DEV_PUBLIC || createAssetPayload.caption !== 'QA uploaded image') throw new Error(`Unexpected asset POST payload: ${JSON.stringify(createAssetPayload)}`);

  await page.locator('[data-asset-id="asset-1"] .hide-asset').click();
  await page.getByText('DEV asset hidden using the existing asset DELETE contract.', { exact: true }).waitFor();

  presignMode = 'prod';
  const putsBefore = storagePuts.length;
  await page.locator('#uploadAssetFile').setInputFiles({ name: 'blocked.png', mimeType: 'image/png', buffer: Buffer.from('blocked') });
  await page.locator('#uploadAsset').click();
  await page.getByText(/Blocked Video Library upload because DEV presign returned a PROD media target/).waitFor();
  if (storagePuts.length !== putsBefore) throw new Error('Storage PUT occurred after PROD presign should have been blocked.');

  const expectedWrites = [
    `POST ${DEV_HOST}/admin/visuals/folders`,
    `PUT ${DEV_HOST}/admin/visuals/folders/created-folder`,
    `PUT ${DEV_HOST}/admin/visuals/song-folders/qa-song`,
    `PUT ${DEV_HOST}/admin/visuals/folders/folder-1/assets/asset-1`,
    `POST ${DEV_HOST}/admin/uploads/presign`,
    `POST ${DEV_HOST}/admin/visuals/folders/folder-1/assets`,
    `DELETE ${DEV_HOST}/admin/visuals/folders/folder-1/assets/asset-1`
  ];
  for (const expected of expectedWrites) if (!writes.includes(expected)) throw new Error(`Missing expected DEV Video Library write: ${expected}`);
  if (writeHeaders.some(item => item.token !== 'qa-token')) throw new Error(`Video Library write missing DEV token: ${JSON.stringify(writeHeaders)}`);
  if (prodRequests.length) throw new Error(`PROD request escaped Video Library guard: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Video Library page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, createFolderPayload, updateFolderPayload, mappingPayload, createAssetPayload, assetPutPayloads, writes, storagePuts, prodRequests }, null, 2));
} finally {
  await browser.close();
}
