import test from 'node:test';
import assert from 'node:assert/strict';
import { createReviewActionService } from '../review-actions.mjs';

function event(body, token = 'social-admin') {
  return {
    headers: token ? { 'x-admin-token': token } : {},
    body: body === undefined ? undefined : JSON.stringify(body)
  };
}

function fixture() {
  const reviews = new Map();
  reviews.set('render-job-12345678', {
    id: 'render-job-12345678',
    status: 'in_review',
    approval_state: 'pending',
    publishing_status: 'not_published',
    video: {
      bucket: 'stashbox-social-publish-test',
      object_key: 'incoming/render-jobs/job-12345678/test.mp4',
      file_name: 'test.mp4',
      content_type: 'video/mp4'
    },
    metadata: {
      selected_title: 'Stashbox - Test Song | Official Short',
      description: 'Original description',
      tags: ['Stashbox'],
      hashtags: ['#Stashbox'],
      collaborators: [],
      collaborator_review_required: true,
      credits: {
        artist: 'Stashbox',
        song_title: 'Test Song',
        publisher: 'Elettro Incorporated'
      }
    },
    publish_settings: {
      visibility: 'unlisted',
      made_for_kids: false,
      notify_subscribers: false,
      scheduled_at: null
    },
    automation: {
      auto_publish: false,
      review_required: true,
      review_window_status: 'open'
    },
    updated_at: '2026-07-28T01:00:00.000Z'
  });

  const store = {
    async getReview(id) {
      return reviews.has(id) ? structuredClone(reviews.get(id)) : null;
    },
    async putReview(id, review) {
      reviews.set(id, structuredClone(review));
      return review;
    },
    async createPreviewUrl() {
      return 'https://preview.example/test.mp4?signature=private';
    }
  };

  const secretStore = {
    async read() {
      return { admin_token: 'social-admin' };
    }
  };

  return {
    reviews,
    service: createReviewActionService({
      secretStore,
      store,
      configSecretId: 'config',
      now: () => new Date('2026-07-28T02:00:00.000Z')
    })
  };
}

test('preview returns a short-lived private video URL', async () => {
  const { service } = fixture();
  const result = await service.preview(event(), 'render-job-12345678');
  assert.match(result.preview_url, /^https:\/\/preview\.example\//);
  assert.equal(result.expires_in_seconds, 900);
  assert.equal(result.content_type, 'video/mp4');
});

test('save updates editable metadata and publishing settings without publishing', async () => {
  const { service, reviews } = fixture();
  const result = await service.save(event({
    selected_title: 'Updated Test Song Title',
    description: 'Updated description',
    tags: ['Stashbox', 'Reggae'],
    hashtags: ['#Stashbox', '#Reggae'],
    collaborators: [{ name: 'Guest Artist', youtube_handle: '@guestartist' }],
    credits: { producers: ['Dean Palermo'] },
    visibility: 'private',
    scheduled_at: '2026-08-01T18:00:00Z'
  }), 'render-job-12345678');

  assert.equal(result.saved, true);
  assert.equal(result.item.metadata.selected_title, 'Updated Test Song Title');
  assert.deepEqual(result.item.metadata.tags, ['Stashbox', 'Reggae']);
  assert.equal(result.item.metadata.collaborators[0].youtube_handle, '@guestartist');
  assert.deepEqual(result.item.metadata.credits.producers, ['Dean Palermo']);
  assert.equal(result.item.publish_settings.visibility, 'private');
  assert.equal(result.item.publish_settings.scheduled_at, '2026-08-01T18:00:00.000Z');
  assert.equal(result.item.publishing_status, 'not_published');
  assert.equal(reviews.get('render-job-12345678').updated_at, '2026-07-28T02:00:00.000Z');
});

test('save rejects titles longer than YouTube allows', async () => {
  const { service } = fixture();
  await assert.rejects(
    service.save(event({ selected_title: 'x'.repeat(101) }), 'render-job-12345678'),
    (error) => error.statusCode === 422 && error.message === 'invalid_youtube_title'
  );
});

test('approve closes review but never triggers publishing', async () => {
  const { service } = fixture();
  const result = await service.decision(
    event({ decision: 'approve', note: 'Ready for a later publish step.' }),
    'render-job-12345678'
  );

  assert.equal(result.decision_applied, true);
  assert.equal(result.publishing_triggered, false);
  assert.equal(result.item.status, 'approved');
  assert.equal(result.item.approval_state, 'approved');
  assert.equal(result.item.automation.auto_publish, false);
});

test('hold and reopen decisions are supported', async () => {
  const { service } = fixture();
  const held = await service.decision(event({ decision: 'hold' }), 'render-job-12345678');
  assert.equal(held.item.status, 'held');

  const reopened = await service.decision(event({ decision: 'reopen' }), 'render-job-12345678');
  assert.equal(reopened.item.status, 'in_review');
  assert.equal(reopened.item.approval_state, 'pending');
});

test('all review actions require the Social Factory admin token', async () => {
  const { service } = fixture();
  await assert.rejects(
    service.preview(event(undefined, ''), 'render-job-12345678'),
    (error) => error.statusCode === 401
  );
});
