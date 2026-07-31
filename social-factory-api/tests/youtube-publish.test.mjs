import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHandler } from '../index.mjs';
import { createYoutubePublishService } from '../youtube-publish.mjs';

const FIXED_NOW = Date.UTC(2026, 6, 27, 21, 0, 0);

function eventFor(path, body, token = 'admin-token') {
  return {
    rawPath: path,
    body: JSON.stringify(body || {}),
    headers: token ? { 'x-admin-token': token } : {},
    requestContext: {
      stage: 'dev',
      http: {
        method: 'POST',
        path
      }
    }
  };
}

function createMemorySecretStore(config = {}, tokens = {}) {
  const values = {
    config: structuredClone(config),
    tokens: structuredClone(tokens)
  };

  return {
    values,
    async read(id) {
      return structuredClone(values[id] || {});
    },
    async write(id, value) {
      values[id] = structuredClone(value);
    }
  };
}

function createMemoryStagingStore({ contentLength = 1024 } = {}) {
  const calls = [];
  return {
    calls,
    async createUploadUrl(input) {
      calls.push(['presign', input]);
      return 'https://uploads.example/presigned';
    },
    async head(objectKey) {
      calls.push(['head', objectKey]);
      return {
        ContentType: 'video/mp4',
        ContentLength: contentLength,
        Metadata: {
          expected_size_bytes: String(contentLength),
          source: 'stashbox-social-factory-dev'
        }
      };
    },
    async read(objectKey) {
      calls.push(['read', objectKey]);
      return {
        Body: Readable.from(Buffer.from('video-data'))
      };
    }
  };
}

function createService({
  fetchImpl,
  tokens,
  contentLength = 1024,
  maxDirectPublishBytes = 25 * 1024 * 1024
} = {}) {
  const secretStore = createMemorySecretStore(
    {
      client_id: 'google-client-id',
      client_secret: 'google-client-secret',
      admin_token: 'admin-token'
    },
    tokens || {
      refresh_token: 'refresh-token',
      access_token: 'valid-access-token',
      access_token_expires_at: new Date(FIXED_NOW + 60 * 60 * 1000).toISOString(),
      channel_id: 'UC123',
      channel_name: 'Stashbox'
    }
  );
  const stagingStore = createMemoryStagingStore({ contentLength });
  const service = createYoutubePublishService({
    secretStore,
    stagingStore,
    fetchImpl: fetchImpl || (async () => assert.fail('fetch should not run')),
    now: () => FIXED_NOW,
    randomUUID: () => 'fixed-uuid',
    configSecretId: 'config',
    tokenSecretId: 'tokens',
    maxUploadBytes: 512 * 1024 * 1024,
    maxDirectPublishBytes
  });
  return { service, secretStore, stagingStore };
}

function createApi(service) {
  return createHandler({
    youtubeOAuth: {
      start: async () => ({}),
      callback: async () => ({}),
      status: async () => ({}),
      disconnect: async () => ({})
    },
    youtubePublish: service
  });
}

test('presign route requires the Social Factory admin token', async () => {
  const { service } = createService();
  const handler = createApi(service);
  const response = await handler(eventFor('/social/uploads/presign', {
    file_name: 'test.mp4',
    content_type: 'video/mp4',
    size_bytes: 1024
  }, ''));

  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).error, 'unauthorized');
});

test('presign route creates a private staging upload URL', async () => {
  const { service, stagingStore } = createService();
  const handler = createApi(service);
  const response = await handler(eventFor('/social/uploads/presign', {
    file_name: 'My Test Video.mp4',
    content_type: 'video/mp4',
    size_bytes: 1024
  }));

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, true);
  assert.equal(body.upload_method, 'PUT');
  assert.equal(body.upload_url, 'https://uploads.example/presigned');
  assert.equal(body.object_key, 'incoming/2026-07-27/fixed-uuid-My-Test-Video.mp4');
  assert.equal(body.max_direct_publish_bytes, 25 * 1024 * 1024);
  assert.equal(stagingStore.calls[0][0], 'presign');
});

test('publish route defaults to validation-only and forced unlisted privacy', async () => {
  const { service, stagingStore } = createService();
  const handler = createApi(service);
  const response = await handler(eventFor('/social/youtube/publish', {
    object_key: 'incoming/2026-07-27/fixed-uuid-test.mp4',
    title: 'Social Factory Test',
    description: 'Validation only',
    privacy_status: 'public'
  }));

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.uploaded, false);
  assert.equal(body.mode, 'validation_only');
  assert.equal(body.privacy_status, 'unlisted');
  assert.equal(body.channel_name, 'Stashbox');
  assert.deepEqual(stagingStore.calls.map(([name]) => name), ['head']);
});

test('validation refreshes an expired access token and stores it', async () => {
  const fetchImpl = async (input) => {
    assert.equal(String(input), 'https://oauth2.googleapis.com/token');
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          access_token: 'refreshed-access-token',
          expires_in: 3600,
          token_type: 'Bearer'
        };
      }
    };
  };
  const { service, secretStore } = createService({
    fetchImpl,
    tokens: {
      refresh_token: 'refresh-token',
      access_token: 'expired-access-token',
      access_token_expires_at: new Date(FIXED_NOW - 1000).toISOString(),
      channel_id: 'UC123',
      channel_name: 'Stashbox'
    }
  });
  const handler = createApi(service);
  const response = await handler(eventFor('/social/youtube/publish', {
    object_key: 'incoming/2026-07-27/fixed-uuid-test.mp4',
    title: 'Refresh Test'
  }));

  assert.equal(response.statusCode, 200);
  assert.equal(secretStore.values.tokens.access_token, 'refreshed-access-token');
  assert.equal(JSON.parse(response.body).mode, 'validation_only');
});

test('confirmed publish rejects videos above the synchronous safety limit', async () => {
  const { service, stagingStore } = createService({
    contentLength: 30 * 1024 * 1024,
    maxDirectPublishBytes: 25 * 1024 * 1024
  });
  const handler = createApi(service);
  const response = await handler(eventFor('/social/youtube/publish', {
    object_key: 'incoming/2026-07-27/fixed-uuid-large.mp4',
    title: 'Large Test',
    confirm_upload: true
  }));

  assert.equal(response.statusCode, 422);
  const body = JSON.parse(response.body);
  assert.equal(body.error, 'direct_publish_size_exceeds_safe_limit');
  assert.equal(body.details.next_step, 'asynchronous_publish_queue_required');
  assert.deepEqual(stagingStore.calls.map(([name]) => name), ['head']);
});

test('confirmed publish uses resumable upload and returns the YouTube video ID', async () => {
  const fetchCalls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = String(input);
    fetchCalls.push({ url, options });

    if (url.startsWith('https://www.googleapis.com/upload/youtube/v3/videos')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ location: 'https://upload.example/session' }),
        async json() {
          return {};
        }
      };
    }

    if (url === 'https://upload.example/session') {
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        async json() {
          return { id: 'youtube-video-123' };
        }
      };
    }

    assert.fail(`Unexpected fetch URL: ${url}`);
  };

  const { service, stagingStore } = createService({ fetchImpl });
  const handler = createApi(service);
  const response = await handler(eventFor('/social/youtube/publish', {
    object_key: 'incoming/2026-07-27/fixed-uuid-test.mp4',
    title: 'Social Factory Test',
    description: 'First unlisted upload',
    tags: ['stashbox', 'test'],
    recording_date: '2026-07-27',
    privacy_status: 'public',
    confirm_upload: true
  }));

  assert.equal(response.statusCode, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.uploaded, true);
  assert.equal(body.mode, 'unlisted_upload');
  assert.equal(body.privacy_status, 'unlisted');
  assert.equal(body.youtube_video_id, 'youtube-video-123');
  assert.equal(body.youtube_url, 'https://www.youtube.com/watch?v=youtube-video-123');
  assert.deepEqual(stagingStore.calls.map(([name]) => name), ['head', 'read']);
  assert.equal(fetchCalls.length, 2);
  assert.equal(fetchCalls[0].options.method, 'POST');
  assert.equal(fetchCalls[1].options.method, 'PUT');
  const metadata = JSON.parse(fetchCalls[0].options.body);
  assert.equal(metadata.status.privacyStatus, 'unlisted');
  assert.equal(metadata.status.selfDeclaredMadeForKids, false);
  assert.equal(metadata.status.containsSyntheticMedia, true);
  assert.equal(metadata.recordingDetails.recordingDate, '2026-07-27');
  assert.match(fetchCalls[0].url, /part=snippet%2Cstatus%2CrecordingDetails/);
});
