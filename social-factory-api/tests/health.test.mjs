import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../index.mjs';

test('GET /social/health returns isolated service status', async () => {
  const response = await handler({
    rawPath: '/social/health',
    requestContext: {
      stage: 'dev',
      http: {
        method: 'GET',
        path: '/social/health'
      }
    }
  });

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'stashbox-social-api');
  assert.equal(body.version, '0.6.0');
  assert.equal(body.environment, 'dev');
  assert.deepEqual(body.isolation, {
    databaseConfigured: false,
    s3Configured: false,
    queueConfigured: false,
    secretsConfigured: true,
    youtubeOauthConfigured: true,
    youtubePublishingConfigured: false,
    mainRadioApiDependency: false,
    radioApiBridgeSupported: true,
    batchCampaignPlanningSupported: true,
    batchDraftCreationSupported: true,
    batchRenderLaunchRequiresSeparateApproval: true,
    renderStagingSupported: false,
    contentReviewSupported: false,
    reviewEditingSupported: false,
    securePreviewSupported: false,
    executionRoleScope: 'cloudwatch-youtube-oauth-secrets-social-publish-and-video-factory-read'
  });
});

test('stage-prefixed health path is normalized', async () => {
  const response = await handler({
    rawPath: '/dev/social/health',
    requestContext: {
      stage: 'dev',
      http: {
        method: 'GET',
        path: '/dev/social/health'
      }
    }
  });

  assert.equal(response.statusCode, 200);
});

test('unknown route returns 404', async () => {
  const response = await handler({
    rawPath: '/radio/songs',
    requestContext: {
      http: {
        method: 'GET',
        path: '/radio/songs'
      }
    }
  });

  assert.equal(response.statusCode, 404);
  assert.equal(JSON.parse(response.body).error, 'route_not_found');
});

test('OPTIONS returns CORS response without invoking other systems', async () => {
  const response = await handler({
    rawPath: '/social/youtube/disconnect',
    requestContext: {
      http: {
        method: 'OPTIONS',
        path: '/social/youtube/disconnect'
      }
    }
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.body, '');
  assert.match(response.headers['Access-Control-Allow-Methods'], /POST/);
});
