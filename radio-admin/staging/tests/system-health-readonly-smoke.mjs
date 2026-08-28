import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const ROOT = process.env.STAGING_HEALTH_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/system-health/';
const LOCAL = 'http://127.0.0.1:4173';

const apiRequests = [];
const prodRequests = [];
const writes = [];
const pageErrors = [];
let dashboardSummaryEscaped = false;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_dev', 'qa-token'));
const page = await context.newPage();

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (url.startsWith(PROD_HOST)) prodRequests.push(`${request.method()} ${url}`);
  if (url.startsWith(DEV_HOST)) {
    apiRequests.push(`${request.method()} ${url}`);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(`${request.method()} ${url}`);
    if (url === `${DEV_HOST}/dashboard/summary`) dashboardSummaryEscaped = true;
  }
});

await page.route(`${LOCAL}/radio/dev/v2/**`, async route => {
  const requestUrl = new URL(route.request().url());
  const path = requestUrl.pathname;
  if (path === '/radio/dev/v2/' || path === '/radio/dev/v2/index.html') {
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><head><meta name="stashbox-v2-build" content="qa-health-build"><script src="/radio/dev/v2/v2-boot-guard.js"></script><script src="/radio/dev/v2/v2-health.js"></script><script src="/radio/dev/v2/v2-recovery.js"></script></head><body><div data-song="qa-song"></div><script>window.STASHBOX_HEALTH={status:'ready',build:'qa-health-build',songCount:1,startupMs:123,catalogSource:'dev-qa',playerReady:true,mediaReady:true,errors:[]};</script></body></html>`
    });
  }
  if (['/radio/dev/v2/v2-boot-guard.js', '/radio/dev/v2/v2-health.js', '/radio/dev/v2/v2-recovery.js'].includes(path)) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__qaHealthFile=true;' });
  }
  return route.continue();
});

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  const method = request.method();
  if (method !== 'GET') return route.fulfill({ status: 405, contentType: 'application/json', body: JSON.stringify({ error: 'QA health is read-only.' }) });
  if (path === '/radio/songs') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [{ song_key: 'qa-song' }] }) });
  if (path === '/admin/ads') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ads: [] }) });
  if (path === '/admin/visuals/folders') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ folders: [] }) });
  if (path === '/admin/video-factory/summary') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: { total_jobs: 0 } }) });
  if (path === '/dashboard/summary') {
    dashboardSummaryEscaped = true;
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Dashboard summary should have been frozen before network.' }) });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled QA health route ${path}` }) });
});

try {
  await page.goto(ROOT, { waitUntil: 'domcontentloaded' });
  await page.locator('#overallStatus').waitFor();
  await page.getByText('Healthy', { exact: true }).waitFor({ timeout: 15000 });

  const cardStates = await page.locator('[data-check-card]').evaluateAll(cards => cards.map(card => ({ key: card.dataset.checkCard, state: card.dataset.state, status: card.querySelector('.health-status')?.textContent || '' })));
  const failed = cardStates.filter(card => card.state !== 'pass');
  if (failed.length) throw new Error(`DEV Health did not pass all cards: ${JSON.stringify(failed)}`);
  if (dashboardSummaryEscaped) throw new Error('Heavy /dashboard/summary request escaped the System Health freeze.');
  if (writes.length) throw new Error(`System Health emitted API writes: ${writes.join(', ')}`);
  if (prodRequests.length) throw new Error(`System Health emitted PROD requests: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`System Health page errors: ${pageErrors.join(' | ')}`);

  const requiredReads = [
    `GET ${DEV_HOST}/radio/songs`,
    `GET ${DEV_HOST}/admin/ads`,
    `GET ${DEV_HOST}/admin/visuals/folders`,
    `GET ${DEV_HOST}/admin/video-factory/summary`
  ];
  for (const expected of requiredReads) {
    if (!apiRequests.includes(expected)) throw new Error(`Missing expected DEV Health read: ${expected}`);
  }

  console.log(JSON.stringify({ pass: true, cardStates, apiRequests, writes, prodRequests, dashboardSummaryEscaped }, null, 2));
} finally {
  await browser.close();
}
