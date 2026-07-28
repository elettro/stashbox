import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../index.mjs';

function request(path, method = 'GET', body) {
  return {
    rawPath: path,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'x-admin-token': 'social-admin' },
    requestContext: {
      stage: 'dev',
      http: { method, path }
    }
  };
}

function createApi({ orchestrator = {}, review = {} } = {}) {
  return createHandler({
    youtubeOAuth: {
      start: async () => ({}),
      callback: async () => ({}),
      status: async () => ({}),
      disconnect: async () => ({})
    },
    youtubePublish: {
      presign: async () => ({
        object_key: 'incoming/test.mp4',
        upload_url: 'https://uploads.example/signed',
        required_headers: {
          'Content-Type': 'video/mp4',
          'x-amz-meta-expected_size_bytes': '1024',
          'x-amz-meta-source': 'stashbox-social-factory-dev'
        }
      }),
      publish: async () => ({})
    },
    videoOrchestrator: {
      candidates: async () => ({ candidates: [{ song_key: 'dub-reggae-01' }] }),
      listJobs: async () => ({ jobs: [] }),
      createDraft: async () => ({ created: true, job: { id: 'job-12345678' } }),
      getJob: async (_event, id) => ({ job: { id } }),
      launch: async (_event, id) => ({ launched: true, job: { id, status: 'pending' } }),
      ...orchestrator
    },
    reviewWorkflow: {
      stageRender: async (_event, id) => ({
        staged: true,
        review_item: { id: `render-${id}`, status: 'in_review' }
      }),
      listReviewItems: async () => ({ count: 1, items: [{ id: 'render-job-12345678' }] }),
      getReviewItem: async (_event, id) => ({ item: { id, status: 'in_review' } }),
      ...review
    }
  });
}

test('public presign contract returns only the header the client must send', async () => {
  const response = await createApi()(request('/social/uploads/presign', 'POST', {}));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.deepEqual(body.required_headers, { 'Content-Type': 'video/mp4' });
  assert.equal(body.upload_url, 'https://uploads.example/signed');
});

test('candidate route delegates to the protected orchestrator', async () => {
  const response = await createApi()(request('/social/orchestration/candidates'));
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).candidates[0].song_key, 'dub-reggae-01');
});

test('render-job item and launch paths preserve the job ID', async () => {
  const api = createApi();
  const getResponse = await api(request('/social/orchestration/render-jobs/job-12345678'));
  assert.equal(JSON.parse(getResponse.body).job.id, 'job-12345678');

  const launchResponse = await api(request(
    '/social/orchestration/render-jobs/job-12345678/launch',
    'POST',
    { confirm_render: true }
  ));
  assert.equal(JSON.parse(launchResponse.body).job.status, 'pending');
});

test('completed render staging path delegates to the review workflow', async () => {
  const response = await createApi()(request(
    '/social/orchestration/render-jobs/job-12345678/stage',
    'POST',
    { confirm_stage: true }
  ));
  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.staged, true);
  assert.equal(body.review_item.id, 'render-job-12345678');
});

test('review list and review item routes preserve IDs', async () => {
  const api = createApi();
  const listResponse = await api(request('/social/review-items'));
  assert.equal(JSON.parse(listResponse.body).count, 1);

  const itemResponse = await api(request('/social/review-items/render-job-12345678'));
  assert.equal(JSON.parse(itemResponse.body).item.id, 'render-job-12345678');
});
