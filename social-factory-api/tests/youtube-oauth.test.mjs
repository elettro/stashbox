import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_YOUTUBE_SCOPES,
  buildAuthorizationUrl,
  buildRedirectUri,
  createSignedState,
  createYoutubeOAuthService,
  verifySignedState
} from '../youtube-oauth.mjs';
import { createHandler } from '../index.mjs';

const FIXED_NOW = Date.UTC(2026, 6, 27, 18, 30, 0);

function eventFor(path, method = 'GET', extra = {}) {
  return {
    rawPath: path,
    headers: {},
    requestContext: {
      stage: 'dev',
      domainName: 'example.execute-api.us-east-1.amazonaws.com',
      http: {
        method,
        path
      }
    },
    ...extra
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

test('signed OAuth state validates and rejects tampering', () => {
  const state = createSignedState({ platform: 'youtube' }, 'state-secret', {
    now: FIXED_NOW,
    ttlMs: 60_000
  });

  assert.equal(
    verifySignedState(state, 'state-secret', { now: FIXED_NOW + 30_000 }).platform,
    'youtube'
  );
  assert.throws(
    () => verifySignedState(`${state}tampered`, 'state-secret', { now: FIXED_NOW }),
    /invalid_oauth_state/
  );
  assert.throws(
    () => verifySignedState(state, 'state-secret', { now: FIXED_NOW + 61_000 }),
    /expired_oauth_state/
  );
});

test('authorization URL requests offline upload and read access', () => {
  const url = new URL(buildAuthorizationUrl({
    clientId: 'client-id',
    redirectUri: 'https://example.com/callback',
    state: 'signed-state'
  }));

  assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/callback');
  assert.equal(url.searchParams.get('state'), 'signed-state');
  assert.deepEqual(
    url.searchParams.get('scope').split(' '),
    [...DEFAULT_YOUTUBE_SCOPES]
  );
});

test('redirect URI is derived from the API Gateway request', () => {
  assert.equal(
    buildRedirectUri(eventFor('/social/youtube/oauth/start')),
    'https://example.execute-api.us-east-1.amazonaws.com/dev/social/youtube/oauth/callback'
  );
});

test('OAuth start requires the isolated Social Factory admin token', async () => {
  const secretStore = createMemorySecretStore({
    client_id: 'client-id',
    client_secret: 'client-secret',
    admin_token: 'admin-token'
  });
  const service = createYoutubeOAuthService({
    secretStore,
    fetchImpl: async () => assert.fail('fetch should not run'),
    now: () => FIXED_NOW,
    configSecretId: 'config',
    tokenSecretId: 'tokens'
  });
  const handler = createHandler({ youtubeOAuth: service });

  const response = await handler(eventFor('/social/youtube/oauth/start'));
  assert.equal(response.statusCode, 401);
  assert.equal(JSON.parse(response.body).error, 'unauthorized');
});

test('OAuth callback stores refresh token and YouTube channel metadata', async () => {
  const secretStore = createMemorySecretStore({
    client_id: 'client-id',
    client_secret: 'client-secret',
    admin_token: 'admin-token',
    success_redirect_uri: ''
  });

  const fetchCalls = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    fetchCalls.push(url);

    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_in: 3600,
            token_type: 'Bearer',
            scope: DEFAULT_YOUTUBE_SCOPES.join(' ')
          };
        }
      };
    }

    if (url.startsWith('https://www.googleapis.com/youtube/v3/channels')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            items: [
              {
                id: 'UC123',
                snippet: {
                  title: 'Stashbox',
                  thumbnails: {
                    default: { url: 'https://img.example/channel.jpg' }
                  }
                }
              }
            ]
          };
        }
      };
    }

    assert.fail(`Unexpected fetch URL: ${url}`);
  };

  const service = createYoutubeOAuthService({
    secretStore,
    fetchImpl,
    now: () => FIXED_NOW,
    configSecretId: 'config',
    tokenSecretId: 'tokens'
  });

  const startEvent = eventFor('/social/youtube/oauth/start');
  startEvent.headers['x-admin-token'] = 'admin-token';
  const startResponse = await service.start(startEvent);
  assert.equal(startResponse.statusCode, 302);
  const state = new URL(startResponse.headers.Location).searchParams.get('state');

  const callbackResponse = await service.callback(eventFor(
    '/social/youtube/oauth/callback',
    'GET',
    {
      queryStringParameters: {
        code: 'authorization-code',
        state
      }
    }
  ));

  assert.equal(callbackResponse.statusCode, 200);
  assert.equal(secretStore.values.tokens.refresh_token, 'refresh-token');
  assert.equal(secretStore.values.tokens.channel_id, 'UC123');
  assert.equal(secretStore.values.tokens.channel_name, 'Stashbox');
  assert.equal(fetchCalls.length, 2);
});

test('disconnect revokes the token and clears the token secret', async () => {
  const secretStore = createMemorySecretStore(
    {
      client_id: 'client-id',
      client_secret: 'client-secret',
      admin_token: 'admin-token'
    },
    {
      refresh_token: 'refresh-token',
      channel_id: 'UC123'
    }
  );
  let revokeCalled = false;
  const service = createYoutubeOAuthService({
    secretStore,
    fetchImpl: async (input) => {
      assert.equal(String(input), 'https://oauth2.googleapis.com/revoke');
      revokeCalled = true;
      return {
        ok: true,
        status: 200,
        async json() {
          return {};
        }
      };
    },
    now: () => FIXED_NOW,
    configSecretId: 'config',
    tokenSecretId: 'tokens'
  });

  const event = eventFor('/social/youtube/disconnect', 'POST');
  event.headers['x-admin-token'] = 'admin-token';
  const result = await service.disconnect(event);

  assert.equal(revokeCalled, true);
  assert.equal(result.connected, false);
  assert.deepEqual(secretStore.values.tokens, {});
});
