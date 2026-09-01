import { chromium } from 'playwright';

const DEV_HOST = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const PROD_HOST = 'https://je3zud66nb.execute-api.us-east-1.amazonaws.com/prod-v2';
const API_URL = `${DEV_HOST}/admin/notifications`;
const baseUrl = process.env.STAGING_NOTIFICATIONS_QA_URL || 'http://127.0.0.1:4173/radio-admin/staging/notifications/';

let notifications = [{
  id: 'qa-existing', internal_title: 'Existing', category: 'stashbox_news', headline: 'Existing DEV Notice',
  message: 'Existing notification', status: 'draft', priority: 50, audience_type: 'public',
  delivery_channels: ['in_app'], artist_keys: [], target_user_ids: [], dismissible: true,
  pinned: false, publish_at: null, expires_at: null, view_count: 0, open_count: 0, click_count: 0
}];
const writes = [];
const writeBodies = [];
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
  const url = request.url();
  const method = request.method();
  if (request.headers()['x-admin-token'] !== 'qa-token') {
    return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Missing DEV admin token' }) });
  }
  if (url === API_URL && method === 'GET') {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, notifications }) });
  }
  if (url === API_URL && method === 'POST') {
    const body = JSON.parse(request.postData() || '{}');
    writes.push(`POST ${url}`); writeBodies.push({ method, body });
    const notification = { id: 'qa-created', view_count: 0, open_count: 0, click_count: 0, ...body };
    notifications = [notification, ...notifications];
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, notification }) });
  }
  const detailMatch = url.match(/\/admin\/notifications\/([^?]+)$/);
  if (detailMatch && method === 'PUT') {
    const id = decodeURIComponent(detailMatch[1]);
    const body = JSON.parse(request.postData() || '{}');
    writes.push(`PUT ${url}`); writeBodies.push({ method, body });
    notifications = notifications.map(item => item.id === id ? { ...item, ...body, id } : item);
    const notification = notifications.find(item => item.id === id);
    return route.fulfill({ status: notification ? 200 : 404, contentType: 'application/json', body: JSON.stringify(notification ? { success: true, notification } : { error: 'Not found' }) });
  }
  if (detailMatch && method === 'DELETE') {
    const id = decodeURIComponent(detailMatch[1]);
    writes.push(`DELETE ${url}`); writeBodies.push({ method, body: null });
    notifications = notifications.map(item => item.id === id ? { ...item, status: 'archived' } : item);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  }
  return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: `Unhandled QA route ${method} ${url}` }) });
});

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.getByText('Existing DEV Notice', { exact: true }).waitFor();

  await page.locator('#newNotificationButton').click();
  await page.locator('#internalTitle').fill('QA Campaign');
  await page.locator('#headline').fill('QA Created DEV Notice');
  await page.locator('#notificationMessage').fill('QA notification body');
  await page.locator('#category').selectOption('artist_update');
  await page.locator('#audienceType').selectOption('artist_followers');
  await page.locator('#deliveryChannels').selectOption(['in_app', 'email']);
  await page.locator('#artistKeys').fill('stashbox, inner-circle');
  const createRequestPromise = page.waitForRequest(request => request.method() === 'POST' && request.url() === API_URL);
  await page.locator('#saveButton').click();
  const createRequest = await createRequestPromise;
  const createBody = JSON.parse(createRequest.postData() || '{}');
  if (createBody.status !== 'draft' || createBody.headline !== 'QA Created DEV Notice' || createBody.audience_type !== 'artist_followers') throw new Error(`Unexpected Notification create payload: ${JSON.stringify(createBody)}`);
  if (JSON.stringify(createBody.delivery_channels) !== JSON.stringify(['in_app', 'email'])) throw new Error(`Unexpected delivery channels: ${JSON.stringify(createBody.delivery_channels)}`);
  if (JSON.stringify(createBody.artist_keys) !== JSON.stringify(['stashbox', 'inner-circle'])) throw new Error(`Unexpected artist keys: ${JSON.stringify(createBody.artist_keys)}`);
  await page.locator('button[data-action="edit"][data-id="qa-created"]').waitFor();

  await page.locator('button[data-action="edit"][data-id="qa-created"]').click();
  await page.locator('#headline').fill('QA Updated DEV Notice');
  const updateRequestPromise = page.waitForRequest(request => request.method() === 'PUT' && request.url() === `${API_URL}/qa-created`);
  await page.locator('#saveButton').click();
  const updateRequest = await updateRequestPromise;
  const updateBody = JSON.parse(updateRequest.postData() || '{}');
  if (updateBody.headline !== 'QA Updated DEV Notice' || updateBody.status !== 'draft') throw new Error(`Unexpected Notification update payload: ${JSON.stringify(updateBody)}`);
  await page.locator('button[data-action="edit"][data-id="qa-created"]').waitFor();

  await page.locator('button[data-action="edit"][data-id="qa-created"]').click();
  const publishRequestPromise = page.waitForRequest(request => request.method() === 'PUT' && request.url() === `${API_URL}/qa-created`);
  await page.locator('#savePublishButton').click();
  const publishRequest = await publishRequestPromise;
  const publishBody = JSON.parse(publishRequest.postData() || '{}');
  if (publishBody.status !== 'published' || !publishBody.publish_at) throw new Error(`Save and Publish did not create a DEV published payload: ${JSON.stringify(publishBody)}`);
  await page.locator('button[data-action="archive"][data-id="qa-created"]').waitFor();

  page.once('dialog', dialog => dialog.accept());
  const deleteRequestPromise = page.waitForRequest(request => request.method() === 'DELETE' && request.url() === `${API_URL}/qa-created`);
  await page.locator('button[data-action="archive"][data-id="qa-created"]').click();
  await deleteRequestPromise;
  await page.getByText('DEV notification archived.', { exact: true }).waitFor();

  const finalNotification = notifications.find(item => item.id === 'qa-created');
  if (!finalNotification || finalNotification.status !== 'archived') throw new Error('DEV archive did not persist in mocked notification state.');
  const expectedWrites = [`POST ${API_URL}`, `PUT ${API_URL}/qa-created`, `PUT ${API_URL}/qa-created`, `DELETE ${API_URL}/qa-created`];
  if (JSON.stringify(writes) !== JSON.stringify(expectedWrites)) throw new Error(`Unexpected DEV Notification writes: ${JSON.stringify(writes)}`);
  if (prodRequests.length) throw new Error(`PROD request detected during Notification QA: ${prodRequests.join(', ')}`);
  if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);

  console.log(JSON.stringify({ pass: true, writes, writeBodies, prodRequests }, null, 2));
} finally {
  await browser.close();
}
