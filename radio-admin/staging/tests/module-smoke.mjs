import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const ROOT = process.env.STAGING_QA_ROOT || 'http://127.0.0.1:4173/radio-admin/staging';

const modules = [
  { path: '/video-library/', selector: '#foldersBody', label: 'Video Library' },
  { path: '/vec/', selector: '#vecLabTitle', label: 'VEC Lab' },
  { path: '/video-factory/', selector: '#videoFactoryTitle', label: 'Video Factory' },
  { path: '/ads/', selector: '#adsBody', label: 'Ads' },
  { path: '/notifications/', selector: '#overviewHeading', label: 'Notifications' },
  { path: '/artists/', selector: '#artistsBody', label: 'Artists' },
  { path: '/social-factory/', selector: 'body', label: 'Social Factory bridge' }
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await context.addInitScript(() => {
  localStorage.setItem('radio_admin_token_dev', 'qa-token');
  localStorage.setItem('stashbox_admin_token_dev', 'qa-token');
  localStorage.setItem('stashbox-radio-admin-token-dev', 'qa-token');
});

const prodRequests = [];
const startupWrites = [];
const pageFailures = [];

function mockPayload(path) {
  if (path === '/admin/songs') {
    return {
      songs: [{
        song_key: 'qa-song',
        song_name: 'QA Song',
        display_title: 'QA Song',
        artist: 'QA Artist',
        genre: 'Rock',
        audio_url: 'https://example.test/qa.mp3',
        public_visibility: 'visible'
      }]
    };
  }
  if (path === '/admin/visuals/folders') return { folders: [] };
  if (path.startsWith('/admin/vec/song-assets')) return { assets: [] };
  if (path.startsWith('/admin/vec/recipe')) return { recipe: null };
  if (path === '/admin/video-factory/jobs') return { jobs: [] };
  if (path === '/admin/video-factory/summary') {
    return { summary: { total: 0, drafts: 0, active: 0, completed: 0, failed: 0 }, total: 0, drafts: 0, active: 0, completed: 0, failed: 0 };
  }
  if (path === '/admin/ads') return { success: true, count: 0, ads: [] };
  if (path === '/admin/ad-settings') {
    return { settings: { ads_enabled: true, break_method: 'count', ads_per_break: 1, target_ad_seconds: 30, break_interval: 1 } };
  }
  if (path === '/admin/notifications') return { notifications: [] };
  if (path === '/radio/admin/artists') return { artists: [], mode: 'platform_admin' };
  if (path.startsWith('/admin/stats/songs')) return { songs: [] };
  return {};
}

for (const mod of modules) {
  const page = await context.newPage();
  const localErrors = [];

  page.on('pageerror', error => localErrors.push(error.message));
  page.on('request', request => {
    const url = request.url();
    if (url.startsWith(PROD_HOST)) prodRequests.push(`${mod.label}: ${request.method()} ${url}`);
    if (url.includes('execute-api') && !['GET', 'HEAD'].includes(request.method())) {
      startupWrites.push(`${mod.label}: ${request.method()} ${url}`);
    }
  });

  await page.route(`${DEV_HOST}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/dev', '');
    const payload = mockPayload(path);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
  });

  try {
    await page.goto(`${ROOT}${mod.path}`, { waitUntil: 'domcontentloaded' });
    await page.locator(mod.selector).first().waitFor({ state: 'attached', timeout: 10000 });
    await page.waitForTimeout(700);
    const bodyText = (await page.locator('body').innerText()).trim();
    if (bodyText.length < 80) throw new Error(`${mod.label} rendered too little content.`);
    if (localErrors.length) throw new Error(`${mod.label} page errors: ${localErrors.join(' | ')}`);
  } catch (error) {
    pageFailures.push(error.message || String(error));
  } finally {
    await page.close();
  }
}

await browser.close();

if (prodRequests.length) throw new Error(`PROD requests detected:\n${prodRequests.join('\n')}`);
if (startupWrites.length) throw new Error(`Unexpected API writes during module startup:\n${startupWrites.join('\n')}`);
if (pageFailures.length) throw new Error(`Module browser failures:\n${pageFailures.join('\n')}`);

console.log(JSON.stringify({ pass: true, modules: modules.map(module => module.label), prodRequests, startupWrites }, null, 2));
