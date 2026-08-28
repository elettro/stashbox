import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const baseUrl = process.env.STAGING_VIDEO_FACTORY_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/video-factory/';
const DEV_SIGNED = 'https://stashbox-radio-video-factory-dev-656260749296-us-east-1.s3.us-east-1.amazonaws.com/video-factory/qa.mp4?X-Amz-Signature=qa';
const PROD_SIGNED = 'https://stashbox-radio-video-factory-prod-656260749296-us-east-1.s3.us-east-1.amazonaws.com/video-factory/qa.mp4?X-Amz-Signature=bad';

let jobs = [
  { id: 'draft-1', song_key: 'qa-song', song_title: 'QA Song', artist: 'QA Artist', client_name: 'Stashbox', project_name: 'QA', batch_name: 'QA', duration_mode: 'full', aspect_ratio: '16:9', width: 1920, height: 1080, fps: 30, output_filename: 'qa-draft.mp4', status: 'draft', created_at: '2026-08-28T12:00:00Z', render_recipe: {} },
  { id: 'active-1', song_key: 'qa-song', song_title: 'QA Song', artist: 'QA Artist', client_name: 'Stashbox', project_name: 'QA', batch_name: 'QA', duration_mode: 'full', aspect_ratio: '16:9', width: 1920, height: 1080, fps: 30, output_filename: 'qa-active.mp4', status: 'rendering', created_at: '2026-08-28T12:01:00Z', render_recipe: { runtime: { progress_percent: 42, status_message: 'Rendering' } } },
  { id: 'failed-1', song_key: 'qa-song', song_title: 'QA Song', artist: 'QA Artist', client_name: 'Stashbox', project_name: 'QA', batch_name: 'QA', duration_mode: 'full', aspect_ratio: '9:16', width: 1080, height: 1920, fps: 30, output_filename: 'qa-failed.mp4', status: 'failed', created_at: '2026-08-28T12:02:00Z', render_recipe: {} },
  { id: 'completed-1', song_key: 'qa-song', song_title: 'QA Song', artist: 'QA Artist', client_name: 'Stashbox', project_name: 'QA', batch_name: 'QA', duration_mode: 'full', aspect_ratio: '1:1', width: 1080, height: 1080, fps: 30, output_filename: 'qa-complete.mp4', status: 'completed', created_at: '2026-08-28T12:03:00Z', render_recipe: {} },
  { id: 'archived-1', song_key: 'qa-song', song_title: 'QA Song', artist: 'QA Artist', client_name: 'Stashbox', project_name: 'QA', batch_name: 'QA', duration_mode: 'full', aspect_ratio: '16:9', width: 1920, height: 1080, fps: 30, output_filename: 'qa-archived.mp4', status: 'archived', created_at: '2026-08-28T12:04:00Z', render_recipe: {} }
];

const writes = [];
const writeHeaders = [];
const prodRequests = [];
const pageErrors = [];
let createdPayload = null;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await context.addInitScript(() => localStorage.setItem('radio_admin_token_dev', 'qa-token'));
const page = await context.newPage();

page.on('pageerror', error => pageErrors.push(error.message));
page.on('request', request => {
  const url = request.url();
  if (url.startsWith(PROD_HOST)) prodRequests.push(`${request.method()} ${url}`);
  if (url.startsWith(DEV_HOST) && !['GET', 'HEAD'].includes(request.method())) {
    writes.push(`${request.method()} ${url}`);
    writeHeaders.push({ url, token: request.headers()['x-admin-token'] || '' });
  }
});

function summary() {
  return {
    total_jobs: jobs.length,
    draft_jobs: jobs.filter(job => job.status === 'draft').length,
    active_jobs: jobs.filter(job => ['pending', 'preparing', 'rendering', 'uploading'].includes(job.status)).length,
    completed_jobs: jobs.filter(job => job.status === 'completed').length,
    failed_jobs: jobs.filter(job => job.status === 'failed').length
  };
}

await page.route(`${DEV_HOST}/**`, async route => {
  const request = route.request();
  const url = new URL(request.url());
  const path = url.pathname.replace('/dev', '');
  const method = request.method();

  if (path === '/admin/songs' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ songs: [{ song_key: 'qa-song', display_title: 'QA Song', song_name: 'QA Song', artist: 'QA Artist', album_name: 'QA Album' }] }) });
  }
  if (path === '/admin/video-factory/jobs' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobs }) });
  }
  if (path === '/admin/video-factory/summary' && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ summary: summary() }) });
  }
  if (path === '/admin/video-factory/jobs' && method === 'POST') {
    createdPayload = JSON.parse(request.postData() || '{}');
    const job = { id: 'created-1', song_title: 'QA Song', artist: 'QA Artist', width: 1920, height: 1080, status: 'draft', created_at: '2026-08-28T13:00:00Z', output_filename: 'created.mp4', render_recipe: {}, ...createdPayload };
    jobs = [job, ...jobs];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, message: 'Render draft created.', job }) });
  }

  const match = path.match(/^\/admin\/video-factory\/jobs\/([^/]+)\/(render|retry|cancel|archive|restore|preview|download)$/);
  if (match) {
    const [, jobId, action] = match;
    if ((action === 'preview' || action === 'download') && method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, url: DEV_SIGNED }) });
    }
    if (method === 'POST') {
      const nextStatus = action === 'render' || action === 'retry' ? 'pending' : action === 'cancel' ? 'cancelled' : action === 'archive' ? 'archived' : action === 'restore' ? 'draft' : null;
      jobs = jobs.map(job => job.id === jobId && nextStatus ? { ...job, status: nextStatus } : job);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, message: `${action} completed`, job_id: jobId, status: nextStatus }) });
    }
  }

  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled QA route ${method} ${path}` }) });
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('5 songs available').waitFor().catch(async () => {
    await page.getByText('1 songs available').waitFor();
  });

  await page.locator('#songKey').selectOption('qa-song');
  await page.locator('#clientName').fill('QA Client');
  await page.locator('#projectName').fill('Migration QA');
  await page.locator('#batchName').fill('Video Factory Guard');
  await page.locator('#aspectRatio').selectOption('9:16');
  await page.locator('#fps').selectOption('30');
  await page.locator('#createDraftButton').click();
  await page.getByText(/Render draft created/).waitFor();

  if (!createdPayload || createdPayload.song_key !== 'qa-song' || createdPayload.client_name !== 'QA Client' || createdPayload.aspect_ratio !== '9:16') {
    throw new Error(`Unexpected Video Factory draft payload: ${JSON.stringify(createdPayload)}`);
  }

  const clickAction = async (jobId, action) => {
    const selector = `[data-job-id="${jobId}"][data-job-action="${action}"]`;
    await page.locator(selector).click();
    await page.waitForResponse(response => response.request().method() === 'GET' && response.url() === `${DEV_HOST}/admin/video-factory/jobs`);
  };

  await clickAction('draft-1', 'render');
  await clickAction('active-1', 'cancel');
  await clickAction('failed-1', 'retry');

  await page.locator('#historyStatus').selectOption('all');
  const archive = page.locator('[data-archive-action="archive"][data-job-id="failed-1"]');
  await archive.waitFor();
  page.once('dialog', dialog => dialog.accept());
  await archive.click();
  await page.waitForResponse(response => response.request().method() === 'GET' && response.url() === `${DEV_HOST}/admin/video-factory/jobs`);

  await page.locator('#historyStatus').selectOption('archived');
  const restore = page.locator('[data-archive-action="restore"][data-job-id="archived-1"]');
  await restore.waitFor();
  await restore.click();
  await page.waitForResponse(response => response.request().method() === 'GET' && response.url() === `${DEV_HOST}/admin/video-factory/jobs`);

  const safeAsset = await page.evaluate(url => window.StashboxVideoFactoryMigrationGuard.assertSignedAssetUrl(url), DEV_SIGNED);
  if (safeAsset !== DEV_SIGNED) throw new Error('DEV signed asset URL was not accepted unchanged.');

  const badAssetMessage = await page.evaluate(async url => {
    try { window.StashboxVideoFactoryMigrationGuard.assertSignedAssetUrl(url); return ''; }
    catch (error) { return error.message; }
  }, PROD_SIGNED);
  if (!/outside the expected DEV private render bucket/.test(badAssetMessage)) throw new Error(`PROD signed asset was not blocked: ${badAssetMessage}`);

  const prodBlockMessage = await page.evaluate(async url => {
    try { await fetch(url, { method: 'POST', body: '{}' }); return ''; }
    catch (error) { return error.message; }
  }, `${PROD_HOST}/admin/video-factory/jobs`);
  if (!/Blocked Video Factory request to PROD API/.test(prodBlockMessage)) throw new Error(`PROD Video Factory API was not blocked: ${prodBlockMessage}`);

  const expectedWrites = [
    `POST ${DEV_HOST}/admin/video-factory/jobs`,
    `POST ${DEV_HOST}/admin/video-factory/jobs/draft-1/render`,
    `POST ${DEV_HOST}/admin/video-factory/jobs/active-1/cancel`,
    `POST ${DEV_HOST}/admin/video-factory/jobs/failed-1/retry`,
    `POST ${DEV_HOST}/admin/video-factory/jobs/failed-1/archive`,
    `POST ${DEV_HOST}/admin/video-factory/jobs/archived-1/restore`
  ];
  for (const expected of expectedWrites) {
    if (!writes.includes(expected)) throw new Error(`Missing expected DEV Video Factory write: ${expected}`);
  }
  if (writeHeaders.some(item => item.token !== 'qa-token')) throw new Error(`A Video Factory write did not carry the DEV token: ${JSON.stringify(writeHeaders)}`);
  if (prodRequests.length) throw new Error(`PROD request escaped Video Factory guard: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, createdPayload, writes, prodRequests, badAssetMessage, prodBlockMessage }, null, 2));
} finally {
  await browser.close();
}
