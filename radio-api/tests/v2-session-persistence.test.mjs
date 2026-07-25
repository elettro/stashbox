import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const index = read('radio/dev/v2/index.html');
const manager = read('radio/dev/v2/v2-session-manager.js');
const cognito = read('infra/user-accounts/dev-cognito.yml');

test('V2 recovery build keeps the unstable session manager disabled', () => {
  assert.doesNotMatch(index, /<script[^>]+v2-session-manager\.js/);
  assert.match(index, /interface-recovery-20260725-78/);
  assert.match(index, /v2-mobile-player-swipe\.js\?v=20260724-modes76/);
});

test('disabled session manager source retains the intended Cognito refresh implementation for repair', () => {
  assert.match(manager, /AuthFlow:\s*'REFRESH_TOKEN_AUTH'/);
  assert.match(manager, /REFRESH_TOKEN:\s*current\.refreshToken/);
  assert.match(manager, /refreshToken:\s*authenticationResult\.RefreshToken[\s\S]*previous\.refreshToken/);
  assert.match(manager, /REFRESH_LEEWAY_MS\s*=\s*2\s*\*\s*60\s*\*\s*1000/);
});

test('disabled manager includes authenticated request retry behavior', () => {
  assert.match(manager, /window\.fetch\s*=\s*sessionFetch/);
  assert.match(manager, /await ensureFresh\(\{ reason: 'request-refresh' \}\)/);
  assert.match(manager, /response\.status !== 401/);
  assert.match(manager, /reason: '401-refresh'/);
});

test('transient refresh failures are designed to retain the stored session', () => {
  const catchBlock = manager.slice(manager.indexOf("dispatchSessionEvent('refresh-deferred'"), manager.indexOf('async function ensureFresh'));
  assert.doesNotMatch(catchBlock, /removeItem\(TOKEN_KEY\)/);
  assert.match(manager, /isInvalidRefreshError/);
  assert.match(manager, /clearInvalidSession\('refresh-token-expired'\)/);
});

test('DEV Cognito is configured for one-year refresh sessions after infrastructure deployment', () => {
  assert.match(cognito, /RefreshTokenValidity:\s*365/);
  assert.match(cognito, /RefreshToken:\s*days/);
  assert.match(cognito, /AccessTokenValidity:\s*15/);
});
