import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createReviewWorkflowService,
  generateReviewMetadata
} from '../review-workflow.mjs';

const SOURCE_BUCKET = 'stashbox-radio-video-factory-dev-656260749296-us-east-1';
const PUBLISH_BUCKET = 'stashbox-social-publish-656260749296-us-east-1';

function event({ body, token = 'social-admin', query } = {}) {
  return {
    headers: token ? { 'x-admin-token': token } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
    queryStringParameters: query || null
  };
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return structuredClone(payload);
    }
  };
}

function createService({ jobStatus = 'completed', outputBucket = SOURCE_BUCKET } = {}) {
  const calls = [];
  const copies = [];
  const reviews = new Map();
  const secretStore = {
    async read() {
      return {
        admin_token: 'social-admin',
        radio_api_base_url: 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev',
        radio_api_admin_token: 'radio-admin'
      };
    }
  };
  const reviewStore = {
    bucketName: PUBLISH_BUCKET,
    sourceBucketName: SOURCE_BUCKET,
    async copyVideo(input) {
      copies.push(input);
      return { ContentType: 'video/mp4', ContentLength: 17_400_000 };
    },
    async putReview(key, review) {
      reviews.set(key, structuredClone(review));
      return review;
    },
    async getReview(key) {
      return reviews.get(key) || null;
    },
    async listReviews() {
      return [...reviews.values()];
    }
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/admin/songs')) {
      return jsonResponse({
        songs: [{
          song_key: 'hippy-speedball',
          display_title: "Hippy Speedball (I'm On My Way)",
          artist: 'Stashbox',
          genre: 'Reggae',
          mood_tags: ['Uplifting', 'Trippy'],
          spotify_url: 'https://open.spotify.com/example',
          shop_url: 'https://stashbox.ai/example'
        }]
      });
    }
    return jsonResponse({
      job: {
        id: 'job-12345678',
        batch_id: 'batch-12345678',
        song_key: 'hippy-speedball',
        song_title: "Hippy Speedball (I'm On My Way)",
        artist: 'Stashbox',
        status: jobStatus,
        duration_seconds: 30,
        aspect_ratio: '9:16',
        width: 1080,
        height: 1920,
        output_filename: 'stashbox-hippy-speedball.mp4',
        output_url: `s3://${outputBucket}/video-factory/hippy-speedball/job-12345678/stashbox-hippy-speedball.mp4`
      }
    });
  };
  return {
    service: createReviewWorkflowService({
      secretStore,
      reviewStore,
      fetchImpl,
      configSecretId: 'config',
      now: () => new Date('2026-07-28T01:00:00.000Z')
    }),
    calls,
    copies,
    reviews
  };
}

test('metadata generator produces editable YouTube copy and keeps the real title', () => {
  const metadata = generateReviewMetadata({
    song: {
      song_key: 'hippy-speedball',
      display_title: "Hippy Speedball (I'm On My Way)",
      artist: 'Stashbox',
      genre: 'Reggae'
    },
    job: { duration_seconds: 30, aspect_ratio: '9:16' }
  });

  assert.equal(metadata.title_options.length, 3);
  assert.match(metadata.selected_title, /Hippy Speedball \(I'm On My Way\)/);
  assert.match(metadata.description, /30-second 9:16 video/);
  assert.ok(metadata.tags.includes('Reggae'));
  assert.equal(metadata.collaborators[0].youtube_handle, '@Elettrotv');
  assert.equal(metadata.collaborator_review_required, true);
});

test('stage route validates a completed render without copying until explicitly confirmed', async () => {
  const { service, copies, calls } = createService();
  const result = await service.stageRender(event({ body: {} }), 'job-12345678');

  assert.equal(result.staged, false);
  assert.equal(result.mode, 'validation_only');
  assert.equal(result.approval_required, true);
  assert.equal(copies.length, 0);
  assert.equal(calls.length, 1);
});

test('confirmed staging copies server-to-server and creates a content review item', async () => {
  const { service, copies, reviews, calls } = createService();
  const result = await service.stageRender(
    event({ body: { confirm_stage: true } }),
    'job-12345678'
  );

  assert.equal(result.staged, true);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].sourceBucket, SOURCE_BUCKET);
  assert.equal(copies[0].destinationKey, 'incoming/render-jobs/job-12345678/stashbox-hippy-speedball.mp4');
  assert.equal(result.review_item.status, 'in_review');
  assert.equal(result.review_item.video.size_bytes, 17_400_000);
  assert.equal(result.review_item.publish_settings.visibility, 'unlisted');
  assert.equal(result.review_item.publish_settings.made_for_kids, false);
  assert.equal(result.review_item.publish_settings.contains_synthetic_media, true);
  assert.deepEqual(result.review_item.publish_settings.playlist_titles, ['Stashbox Radio - Video Library - Stashbox']);
  assert.equal(result.review_item.automation.auto_publish, false);
  assert.equal(reviews.size, 1);
  assert.equal(calls.length, 2);
});

test('staging rejects an output from any non-Video-Factory bucket', async () => {
  const { service } = createService({ outputBucket: 'unexpected-bucket' });
  await assert.rejects(
    service.stageRender(event({ body: { confirm_stage: true } }), 'job-12345678'),
    (error) => error.statusCode === 409 && error.message === 'render_output_bucket_not_allowed'
  );
});

test('staging rejects a render that is not completed', async () => {
  const { service } = createService({ jobStatus: 'rendering' });
  await assert.rejects(
    service.stageRender(event({ body: { confirm_stage: true } }), 'job-12345678'),
    (error) => error.statusCode === 409 && error.message === 'render_job_not_completed'
  );
});

test('review list and item routes remain protected', async () => {
  const { service, reviews } = createService();
  reviews.set('drafts/render-job-12345678.json', {
    id: 'render-job-12345678',
    status: 'in_review',
    created_at: '2026-07-28T01:00:00.000Z'
  });

  const listed = await service.listReviewItems(event());
  assert.equal(listed.count, 1);

  const item = await service.getReviewItem(event(), 'render-job-12345678');
  assert.equal(item.item.status, 'in_review');

  await assert.rejects(
    service.listReviewItems(event({ token: '' })),
    (error) => error.statusCode === 401
  );
});
