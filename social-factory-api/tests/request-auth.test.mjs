import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRequestAuthenticator,
  hasPermission,
  permissionForRequest
} from '../request-auth.mjs';

function secretStore(values) {
  const reads = [];
  return {
    reads,
    async read(secretId) {
      reads.push(secretId);
      return values[secretId] || {};
    }
  };
}

function event(token, headerName = 'x-admin-token') {
  return {
    headers: token ? { [headerName]: token, 'x-other-header': 'kept' } : { 'x-other-header': 'kept' }
  };
}

test('permission mapping covers the complete Social Factory cycle', () => {
  assert.equal(permissionForRequest('GET', '/social/orchestration/candidates'), 'songs:read');
  assert.equal(permissionForRequest('POST', '/social/orchestration/batch-plan'), 'campaigns:plan');
  assert.equal(permissionForRequest('POST', '/social/orchestration/batch-drafts'), 'campaigns:create_drafts');
  assert.equal(permissionForRequest('POST', '/social/orchestration/render-jobs/job-12345678/launch'), 'renders:launch');
  assert.equal(permissionForRequest('POST', '/social/orchestration/render-jobs/job-12345678/stage'), 'review:stage');
  assert.equal(permissionForRequest('POST', '/social/review-items/review-12345678/save'), 'review:write');
  assert.equal(permissionForRequest('POST', '/social/review-items/review-12345678/decision'), 'review:decide');
  assert.equal(permissionForRequest('POST', '/social/review-items/review-12345678/schedule'), 'schedule:create');
  assert.equal(permissionForRequest('POST', '/social/review-items/review-12345678/schedule/cancel'), 'schedule:cancel');
  assert.equal(permissionForRequest('POST', '/social/review-items/review-12345678/publish'), 'youtube:publish');
});

test('permission wildcards are supported without granting unrelated scopes', () => {
  assert.equal(hasPermission(['renders:*'], 'renders:launch'), true);
  assert.equal(hasPermission(['renders:*'], 'review:write'), false);
  assert.equal(hasPermission(['*'], 'youtube:publish'), true);
});

test('browser admin token remains valid and is identified separately', async () => {
  const store = secretStore({
    config: { admin_token: 'browser-admin-token' },
    gpt: { api_key: 'gpt-token', enabled: true, permissions: ['*'] }
  });
  const authenticator = createRequestAuthenticator({
    secretStore: store,
    configSecretId: 'config',
    customGptSecretId: 'gpt'
  });

  const result = await authenticator.normalize(event('browser-admin-token', 'X-Admin-Token'), {
    method: 'GET',
    path: '/social/review-items'
  });

  assert.equal(result.actor.id, 'social-factory-browser-admin');
  assert.equal(result.actor.type, 'admin');
  assert.equal(result.actor.permission, 'review:read');
  assert.equal(result.event.headers['x-admin-token'], 'browser-admin-token');
  assert.equal(result.event.headers['x-stashbox-actor'], 'social-factory-browser-admin');
  assert.equal(result.event.headers['x-other-header'], 'kept');
  assert.deepEqual(store.reads, ['config']);
});

test('dedicated GPT token is rewritten internally to the browser admin token', async () => {
  const store = secretStore({
    config: { admin_token: 'browser-admin-token' },
    gpt: {
      api_key: 'dedicated-gpt-token',
      actor_id: 'stashbox-radio-gpt',
      enabled: true,
      permissions: ['songs:read', 'campaigns:*', 'renders:*', 'review:*', 'schedule:*', 'youtube:read', 'youtube:publish']
    }
  });
  const authenticator = createRequestAuthenticator({
    secretStore: store,
    configSecretId: 'config',
    customGptSecretId: 'gpt'
  });

  const result = await authenticator.normalize(event('dedicated-gpt-token'), {
    method: 'POST',
    path: '/social/orchestration/batch-launch'
  });

  assert.equal(result.actor.id, 'stashbox-radio-gpt');
  assert.equal(result.actor.type, 'custom_gpt');
  assert.equal(result.actor.permission, 'renders:launch');
  assert.equal(result.event.headers['x-admin-token'], 'browser-admin-token');
  assert.equal(result.event.headers['x-stashbox-actor'], 'stashbox-radio-gpt');
  assert.equal(result.event.headers['x-other-header'], 'kept');
  assert.deepEqual(store.reads, ['config', 'gpt']);
});

test('GPT token is denied when its role lacks the route permission', async () => {
  const store = secretStore({
    config: { admin_token: 'browser-admin-token' },
    gpt: {
      api_key: 'dedicated-gpt-token',
      actor_id: 'stashbox-radio-gpt',
      enabled: true,
      permissions: ['review:read']
    }
  });
  const authenticator = createRequestAuthenticator({
    secretStore: store,
    configSecretId: 'config',
    customGptSecretId: 'gpt'
  });

  await assert.rejects(
    () => authenticator.normalize(event('dedicated-gpt-token'), {
      method: 'POST',
      path: '/social/review-items/review-12345678/publish'
    }),
    (error) => {
      assert.equal(error.message, 'forbidden');
      assert.equal(error.statusCode, 403);
      assert.equal(error.details.required_permission, 'youtube:publish');
      return true;
    }
  );
});

test('disabled or invalid GPT credentials are not rewritten', async () => {
  const store = secretStore({
    config: { admin_token: 'browser-admin-token' },
    gpt: {
      api_key: 'dedicated-gpt-token',
      actor_id: 'stashbox-radio-gpt',
      enabled: false,
      permissions: ['*']
    }
  });
  const authenticator = createRequestAuthenticator({
    secretStore: store,
    configSecretId: 'config',
    customGptSecretId: 'gpt'
  });

  const result = await authenticator.normalize(event('dedicated-gpt-token'), {
    method: 'GET',
    path: '/social/review-items'
  });

  assert.equal(result.actor, null);
  assert.equal(result.event.headers['x-admin-token'], 'dedicated-gpt-token');
});

test('missing custom GPT secret configuration leaves existing requests unchanged', async () => {
  const store = secretStore({});
  const authenticator = createRequestAuthenticator({
    secretStore: store,
    configSecretId: 'config',
    customGptSecretId: ''
  });

  const original = event('any-token');
  const result = await authenticator.normalize(original, {
    method: 'GET',
    path: '/social/review-items'
  });

  assert.equal(result.event, original);
  assert.equal(result.actor, null);
  assert.deepEqual(store.reads, []);
});
