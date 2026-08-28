(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required before Video Factory migration guard.');
  const env = migration.getEnvironment('dev');
  const prod = migration.getEnvironment('prod');
  const DEV_RENDER_BUCKET_PREFIX = 'stashbox-radio-video-factory-dev-';

  const nativeFetch = window.fetch.bind(window);
  const nativeGetItem = Storage.prototype.getItem;
  const nativeSetItem = Storage.prototype.setItem;
  const nativeRemoveItem = Storage.prototype.removeItem;

  function requestUrl(input) {
    if (typeof input === 'string') return input;
    if (input && typeof input.url === 'string') return input.url;
    return String(input || '');
  }

  function requestMethod(input, init = {}) {
    return String(init.method || input?.method || 'GET').toUpperCase();
  }

  function isApiGateway(url) {
    try { return new URL(url).hostname.includes('.execute-api.'); }
    catch { return false; }
  }

  function assertSignedAssetUrl(url) {
    let parsed;
    try { parsed = new URL(url); }
    catch { throw new Error('Blocked Video Factory signed asset URL because it is invalid.'); }
    if (parsed.protocol !== 'https:') throw new Error('Blocked Video Factory signed asset URL because HTTPS is required.');
    const host = parsed.hostname.toLowerCase();
    const isS3 = host.includes('.s3.') || host.endsWith('.s3.amazonaws.com');
    const bucket = host.split('.s3')[0];
    if (!isS3 || !bucket.startsWith(DEV_RENDER_BUCKET_PREFIX)) {
      throw new Error('Blocked Video Factory signed asset URL outside the expected DEV private render bucket.');
    }
    return url;
  }

  Storage.prototype.getItem = function (key) {
    if (key === 'stashbox_admin_token_dev') {
      return nativeGetItem.call(this, env.tokenStorageKey)
        || nativeGetItem.call(this, 'stashbox_admin_token_dev')
        || '';
    }
    return nativeGetItem.call(this, key);
  };

  Storage.prototype.setItem = function (key, value) {
    if (key === 'stashbox_admin_token_dev') return nativeSetItem.call(this, env.tokenStorageKey, value);
    return nativeSetItem.call(this, key, value);
  };

  Storage.prototype.removeItem = function (key) {
    if (key === 'stashbox_admin_token_dev') return nativeRemoveItem.call(this, env.tokenStorageKey);
    return nativeRemoveItem.call(this, key);
  };

  window.fetch = async function guardedVideoFactoryFetch(input, init = {}) {
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method);

    if (url.startsWith(prod.apiBase)) {
      throw new Error('Blocked Video Factory request to PROD API during migration staging.');
    }
    if (isApiGateway(url) && !url.startsWith(env.apiBase)) {
      throw new Error('Blocked Video Factory request outside the TRUE DEV API Gateway.');
    }
    if (url.startsWith(env.apiBase) && isWrite) {
      migration.assertWriteAllowed('dev', 'video-factory');
    }

    return nativeFetch(input, init);
  };

  window.StashboxVideoFactoryMigrationGuard = Object.freeze({
    environment: 'dev',
    apiBase: env.apiBase,
    renderBucketPrefix: DEV_RENDER_BUCKET_PREFIX,
    assertSignedAssetUrl,
    prodWritesBlocked: true
  });
})();
