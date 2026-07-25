import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const index = read('radio/dev/v2/index.html');
const manager = read('radio/dev/v2/v2-session-manager.js');
const cognito = read('infra/user-accounts/dev-cognito.yml');

test('V2 loads the session manager before the login sheet and account modules', () => {
  const managerPosition = index.indexOf('/radio/dev/v2/v2-session-manager.js');
  const authSheetPosition = index.indexOf('/radio/dev/v2/v2-auth-sheet.js');
  const playerPosition = index.indexOf('/radio/dev/v2/v2-logged-in-player-stable.js');
  assert.ok(managerPosition > -1, 'Missing V2 session manager');
  assert.ok(managerPosition < authSheetPosition, 'Session manager must load before auth sheet');
  assert.ok(managerPosition < playerPosition, 'Session manager must load before account-aware player modules');
  assert.match(index, /persistent-session-20260725-77/);
});

test('session manager renews Cognito tokens and preserves the refresh token', () => {
  assert.match(manager, /AuthFlow:\s*'REFRESH_TOKEN_AUTH'/);
  assert.match(manager, /REFRESH_TOKEN:\s*current\.refreshToken/);
  assert.match(manager, /refreshToken:\s*authenticationResult\.RefreshToken[\s\S]*previous\.refreshToken/);
  assert.match(manager, /REFRESH_LEEWAY_MS\s*=\s*2\s*\*\s*60\s*\*\s*1000/);
});

test('authenticated requests refresh before sending and retry once after 401', () => {
  assert.match(manager, /window\.fetch\s*=\s*sessionFetch/);
  assert.match(manager, /await ensureFresh\(\{ reason: 'request-refresh' \}\)/);
  assert.match(manager, /response\.status !== 401/);
  assert.match(manager, /reason: '401-refresh'/);
});

test('transient refresh failures retain the stored session', () => {
  const catchBlock = manager.slice(manager.indexOf("dispatchSessionEvent('refresh-deferred'"), manager.indexOf('async function ensureFresh'));
  assert.doesNotMatch(catchBlock, /removeItem\(TOKEN_KEY\)/);
  assert.match(manager, /isInvalidRefreshError/);
  assert.match(manager, /clearInvalidSession\('refresh-token-expired'\)/);
});

test('session resumes when the browser returns to the foreground or network', () => {
  ['pageshow', 'focus', 'online', 'visibilitychange'].forEach(eventName => {
    assert.match(manager, new RegExp(eventName));
  });
  assert.match(manager, /scheduled-refresh/);
  assert.match(manager, /background-refresh/);
});

test('DEV Cognito issues one-year refresh sessions after infrastructure deployment', () => {
  assert.match(cognito, /RefreshTokenValidity:\s*365/);
  assert.match(cognito, /RefreshToken:\s*days/);
  assert.match(cognito, /AccessTokenValidity:\s*15/);
});
