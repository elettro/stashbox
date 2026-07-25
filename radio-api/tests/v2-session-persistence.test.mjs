import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const index = read('radio/dev/v2/index.html');
const manager = read('radio/dev/v2/v2-session-manager.js');
const cognito = read('infra/user-accounts/dev-cognito.yml');

test('V2 loads the repaired session manager before interface auth modules', () => {
  const managerPosition = index.indexOf('/radio/dev/v2/v2-session-manager.js');
  const recoveryPosition = index.indexOf('/radio/dev/v2/v2-recovery.js');
  const authPosition = index.indexOf('/radio/dev/v2/v2-auth-sheet.js');
  assert.ok(managerPosition > -1, 'Missing V2 session manager');
  assert.ok(managerPosition < recoveryPosition, 'Session manager must initialize before the player is rendered');
  assert.ok(managerPosition < authPosition, 'Session manager must initialize before authentication UI');
  assert.match(index, /vec-badge-idempotent-20260725-81/);
  assert.match(index, /v2-session-manager\.js\?v=20260725-session80/);
});

test('session manager renews Cognito tokens and preserves the refresh token', () => {
  assert.match(manager, /AuthFlow:\s*'REFRESH_TOKEN_AUTH'/);
  assert.match(manager, /REFRESH_TOKEN:\s*current\.refreshToken/);
  assert.match(manager, /refreshToken:\s*result\.RefreshToken[\s\S]*previous\.refreshToken/);
  assert.match(manager, /REFRESH_LEEWAY_MS\s*=\s*2\s*\*\s*60\s*\*\s*1000/);
});

test('authenticated requests refresh before sending and retry once after 401', () => {
  assert.match(manager, /window\.fetch\s*=\s*sessionFetch/);
  assert.match(manager, /ensureFresh\(\{ reason: 'request-refresh' \}\)/);
  assert.match(manager, /response\.status !== 401/);
  assert.match(manager, /reason: '401-refresh'/);
});

test('session manager is state-only and cannot mutate the V2 interface', () => {
  assert.doesNotMatch(manager, /MutationObserver/);
  assert.doesNotMatch(manager, /querySelector/);
  assert.doesNotMatch(manager, /classList/);
  assert.doesNotMatch(manager, /textContent/);
});

test('transient refresh failures retain the stored session and use controlled retry', () => {
  const transientBlock = manager.slice(manager.indexOf("emit('refresh-deferred'"), manager.indexOf('function ensureFresh'));
  assert.doesNotMatch(transientBlock, /removeItem\(TOKEN_KEY\)/);
  assert.match(manager, /scheduleRetry\(\)/);
  assert.match(manager, /60 \* 1000/);
  assert.doesNotMatch(manager, /addEventListener\('stashbox:v2-auth-changed'/);
});

test('session resumes on browser return and background checks', () => {
  ['pageshow', 'focus', 'online', 'visibilitychange'].forEach(eventName => {
    assert.match(manager, new RegExp(eventName));
  });
  assert.match(manager, /scheduled-refresh/);
  assert.match(manager, /background-refresh/);
});

test('DEV Cognito is configured for one-year refresh sessions after infrastructure deployment', () => {
  assert.match(cognito, /RefreshTokenValidity:\s*365/);
  assert.match(cognito, /RefreshToken:\s*days/);
  assert.match(cognito, /AccessTokenValidity:\s*15/);
});
