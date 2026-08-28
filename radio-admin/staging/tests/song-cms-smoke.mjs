import { chromium } from 'playwright';
import fs from 'node:fs';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const baseUrl = process.env.STAGING_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/songs/';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(() => {
  localStorage.setItem('radio_admin_token_dev', 'qa-token');
});

const page = await context.newPage();
const consoleErrors = [];
const pageErrors = [];
const prodRequests = [];
const writes = [];
let songs = [
  {
    song_key: 'qa-existing-song',
    song_name: 'QA Existing Song',
    display_title: 'QA Existing Song',
    artist: 'Stashbox',
    genre: 'Rock',
    release_format: 'single',
    song_origin: 'original',
    public_visibility: 'visible',
    audio_url: 'https://example.test/qa-existing.mp3',
    enhanced_visuals_enabled: false,
    shuffle_visuals: true,
    visual_still_duration_seconds: 8,
    visual_assets: []
  }
];

page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => pageErrors.push(err.message));
page.on('request', request => {
  const url = request.url();
  if (url.startsWith(PROD_HOST)) prodRequests.push(`${request.method()} ${url}`);
  if (!['GET', 'HEAD'].includes(request.method()) && url.includes('execute-api')) {
    writes.push({ method: request.method(), url });
  }
});

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  const method = request.method();

  if (path === '/admin/songs' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs }) });
  }

  if (path === '/admin/songs' && method === 'POST') {
    const body = JSON.parse(request.postData() || '{}');
    songs.push({ ...body });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, song: body }) });
  }

  if (path.startsWith('/admin/songs/') && method === 'PUT') {
    const key = decodeURIComponent(path.split('/').pop());
    const body = JSON.parse(request.postData() || '{}');
    songs = songs.map(song => song.song_key === key ? { ...song, ...body, song_key: key } : song);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  }

  if (path.startsWith('/radio/admin/songs/') && path.endsWith('/artwork-images') && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ media: { artwork_images: {} } }) });
  }

  return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });

  await page.locator('#editorHeading').waitFor();
  if ((await page.locator('body').innerText()).trim().length < 100) throw new Error('Staging page rendered too little content.');
  if (!(await page.getByText('QA Existing Song', { exact: true }).first().isVisible())) throw new Error('Mock DEV song catalog did not render.');
  if (!(await page.getByText('Six-Image Artwork Library', { exact: true }).isVisible())) throw new Error('Artwork module did not render.');
  if (!(await page.getByText('Audio & Song Visual Media', { exact: true }).isVisible())) throw new Error('Media module did not render.');

  await page.locator('#field-song_name').fill('QA Created Song');
  await page.locator('#field-display_title').fill('QA Created Song');
  await page.locator('#field-artist').fill('Stashbox');
  await page.locator('#field-genre').fill('Rock');
  await page.locator('#field-audio_url').fill('https://example.test/qa-created.mp3');
  await page.locator('#generateKeyButton').click();
  const generatedKey = await page.locator('#field-song_key').inputValue();
  if (generatedKey !== 'qa-created-song-stashbox') throw new Error(`Unexpected generated key: ${generatedKey}`);
  await page.locator('#saveSongButton').click();
  await page.getByText('DEV song created: qa-created-song-stashbox', { exact: true }).waitFor();

  const editButton = page.locator('button.edit-song').first();
  await editButton.waitFor();
  await editButton.click();
  await page.locator('#field-song_key:disabled').waitFor();
  if (await page.locator('#uploadAudioButton').isDisabled()) throw new Error('DEV media upload controls did not enable in edit mode.');
  if (await page.locator('#refreshArtworkButton').isDisabled()) throw new Error('DEV artwork controls did not enable in edit mode.');

  await page.locator('#field-display_title').fill('QA Existing Song Updated');
  await page.locator('#saveSongButton').click();
  await page.getByText('DEV song saved: qa-existing-song', { exact: true }).waitFor();

  const hasPost = writes.some(item => item.method === 'POST' && item.url === `${DEV_HOST}/admin/songs`);
  const hasPut = writes.some(item => item.method === 'PUT' && item.url === `${DEV_HOST}/admin/songs/qa-existing-song`);
  if (!hasPost) throw new Error('Create flow did not POST to the DEV Song CMS endpoint.');
  if (!hasPut) throw new Error('Edit flow did not PUT to the DEV Song CMS endpoint.');
  if (prodRequests.length) throw new Error(`PROD request detected: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
  if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join(' | ')}`);

  fs.mkdirSync('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/admin-staging-song-cms-smoke.png', fullPage: true });
  console.log(JSON.stringify({
    pass: true,
    generatedKey,
    writes,
    prodRequests,
    consoleErrors,
    pageErrors
  }, null, 2));
} finally {
  await browser.close();
}
