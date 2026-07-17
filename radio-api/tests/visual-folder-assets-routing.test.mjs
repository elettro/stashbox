import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getRouteSegments,
  getVisualsFolderAssetsRouteMatch,
  matchesPublicVisualsFolderAssetsRoute,
  handlePublicVisualsFolderAssetsRoute
} from '../index.mjs';

function httpApiV2Event(method, rawPath) {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath,
    requestContext: {
      stage: 'dev',
      http: { method, path: rawPath }
    }
  };
}

function isAdminVisualsFoldersRoute(event) {
  const segments = getRouteSegments(event);
  return segments[0] === 'admin' && segments[1] === 'visuals' && segments[2] === 'folders';
}

function assertClassifiedAsAdmin(method, rawPath) {
  const event = httpApiV2Event(method, rawPath);
  assert.deepEqual(getRouteSegments(event), rawPath.replace(/^\/dev\//, '').split('/'));
  assert.equal(isAdminVisualsFoldersRoute(event), true);
  assert.equal(matchesPublicVisualsFolderAssetsRoute(event, getRouteSegments(event).join('/')), false);
}

test('POST admin folder assets route is classified as admin, not public', () => {
  assertClassifiedAsAdmin('POST', '/dev/admin/visuals/folders/test-folder-id/assets');
});

test('GET admin folder assets route is classified as admin, not public', () => {
  assertClassifiedAsAdmin('GET', '/dev/admin/visuals/folders/test-folder-id/assets');
});

test('PUT admin folder asset route is classified as admin, not public', () => {
  assertClassifiedAsAdmin('PUT', '/dev/admin/visuals/folders/test-folder-id/assets/test-asset-id');
  assert.equal(getVisualsFolderAssetsRouteMatch(httpApiV2Event('PUT', '/dev/admin/visuals/folders/test-folder-id/assets/test-asset-id')).isAssetsRoute, false);
});

test('DELETE admin folder asset route is classified as admin, not public', () => {
  assertClassifiedAsAdmin('DELETE', '/dev/admin/visuals/folders/test-folder-id/assets/test-asset-id');
  assert.equal(getVisualsFolderAssetsRouteMatch(httpApiV2Event('DELETE', '/dev/admin/visuals/folders/test-folder-id/assets/test-asset-id')).isAssetsRoute, false);
});

test('GET public radio folder assets route remains public', () => {
  const event = httpApiV2Event('GET', '/dev/radio/visuals/folders/test-folder-id/assets');
  assert.deepEqual(getRouteSegments(event), ['radio', 'visuals', 'folders', 'test-folder-id', 'assets']);
  assert.equal(matchesPublicVisualsFolderAssetsRoute(event, getRouteSegments(event).join('/')), true);
});

test('POST public radio folder assets route matches only the public route and remains unsupported by public handler', async () => {
  const event = httpApiV2Event('POST', '/dev/radio/visuals/folders/test-folder-id/assets');
  assert.deepEqual(getRouteSegments(event), ['radio', 'visuals', 'folders', 'test-folder-id', 'assets']);
  assert.equal(matchesPublicVisualsFolderAssetsRoute(event, getRouteSegments(event).join('/')), true);

  const result = await handlePublicVisualsFolderAssetsRoute(event);
  assert.equal(result.statusCode, 404);
  assert.equal(JSON.parse(result.body).error, 'Not found.');
});
