import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoOrchestratorService } from '../video-orchestrator.mjs';

function event({ body, token = 'social-admin', query } = {}) {
  return {
    headers: token ? { 'x-admin-token': token } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
    queryStringParameters: query || null
  };
}

function createService(handler, config = {}) {
  const calls = [];
  const secretStore = {
    async read() {
      return {
        admin_token: 'social-admin',
        radio_api_base_url: 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev',
        radio_api_admin_token: 'radio-admin',
        ...config
      };
    }
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options);
  };
  return {
    service: createVideoOrchestratorService({
      secretStore,
      fetchImpl,
      configSecretId: 'config'
    }),
    calls
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

test('candidate route requires Social Factory admin authorization', async () => {
  const { service } = createService(async () => jsonResponse({ songs: [] }));
  await assert.rejects(
    service.candidates(event({ token: '' })),
    (error) => error.statusCode === 401 && error.message === 'unauthorized'
  );
});

test('candidate route ranks render-ready songs and never launches a render', async () => {
  const { service, calls } = createService(async () => jsonResponse({
    songs: [
      {
        song_key: 'quiet-song',
        display_title: 'Quiet Song',
        artist: 'Stashbox',
        audio_url: 'https://audio.example/quiet.mp3'
      },
      {
        song_key: 'strong-song',
        display_title: 'Strong Song',
        artist: 'Stashbox',
        audio_url: 'https://audio.example/strong.mp3',
        song_artwork_url: 'https://images.example/strong.jpg',
        enhanced_visuals_enabled: true,
        featured: true
      },
      {
        song_key: 'no-audio',
        display_title: 'No Audio',
        artist: 'Stashbox'
      }
    ]
  }));

  const result = await service.candidates(event());
  assert.equal(result.mode, 'proposal_only');
  assert.equal(result.approval_required_before_render, true);
  assert.deepEqual(result.candidates.map((song) => song.song_key), ['strong-song', 'quiet-song']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers['x-admin-token'], 'radio-admin');
});

test('create draft defaults to a 30-second vertical social render', async () => {
  const { service, calls } = createService(async (url, options) => {
    assert.equal(url, 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/admin/video-factory/jobs');
    const body = JSON.parse(options.body);
    assert.equal(body.song_key, 'dub-reggae-01');
    assert.equal(body.duration_mode, 'promo');
    assert.equal(body.duration_seconds, 30);
    assert.equal(body.aspect_ratio, '9:16');
    return jsonResponse({ job: { id: 'job-12345678', status: 'draft' } }, 201);
  });

  const result = await service.createDraft(event({ body: { song_key: 'dub-reggae-01' } }));
  assert.equal(result.created, true);
  assert.equal(result.approval_required_before_launch, true);
  assert.equal(result.job.status, 'draft');
  assert.equal(calls.length, 1);
});

test('launch is validation-only until confirm_render is explicitly true', async () => {
  const { service, calls } = createService(async () => jsonResponse({}));
  const result = await service.launch(event({ body: {} }), 'job-12345678');
  assert.equal(result.launched, false);
  assert.equal(result.mode, 'validation_only');
  assert.equal(calls.length, 0);
});

test('confirmed launch calls only the allowlisted Video Factory render route', async () => {
  const { service, calls } = createService(async (url, options) => {
    assert.equal(url, 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/admin/video-factory/jobs/job-12345678/render');
    assert.equal(options.method, 'POST');
    return jsonResponse({ job: { id: 'job-12345678', status: 'pending' } });
  });
  const result = await service.launch(event({ body: { confirm_render: true } }), 'job-12345678');
  assert.equal(result.launched, true);
  assert.equal(result.job.active, true);
  assert.equal(calls.length, 1);
});

test('bridge refuses a different API host', async () => {
  const { service } = createService(async () => jsonResponse({ songs: [] }), {
    radio_api_base_url: 'https://example.com/dev'
  });
  await assert.rejects(
    service.candidates(event()),
    (error) => error.statusCode === 500 && error.message === 'radio_api_bridge_invalid_base_url'
  );
});

test('bridge remains disabled until the Radio DEV admin token is configured', async () => {
  const { service } = createService(async () => jsonResponse({ songs: [] }), {
    radio_api_admin_token: 'REPLACE_RADIO_DEV_ADMIN_TOKEN'
  });
  await assert.rejects(
    service.candidates(event()),
    (error) => error.statusCode === 409 && error.message === 'radio_api_bridge_not_configured'
  );
});
