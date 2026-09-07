(() => {
  'use strict';

  const migration = window.StashboxAdminMigration;
  if (!migration) throw new Error('StashboxAdminMigration config is required before VEC migration guard.');
  const env = migration.getEnvironment('dev');
  const prod = migration.getEnvironment('prod');
  const DEV_MEDIA_BUCKET = 'stashbox-radio-media-dev-us-east-1';
  const PROD_MEDIA_BUCKET = 'stashbox-radio-media-prod-us-east-1';

  const nativeFetch = window.fetch.bind(window);
  const nativeGetItem = Storage.prototype.getItem;

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

  function isS3Url(url) {
    try {
      const host = new URL(url).hostname;
      return host.includes('.s3.') || host.endsWith('.s3.amazonaws.com') || host === 's3.amazonaws.com';
    } catch { return false; }
  }

  Storage.prototype.getItem = function (key) {
    if (key === 'stashbox_admin_token_dev') {
      return nativeGetItem.call(this, env.tokenStorageKey)
        || nativeGetItem.call(this, 'stashbox_admin_token_dev')
        || '';
    }
    return nativeGetItem.call(this, key);
  };

  window.fetch = async function guardedVecFetch(input, init = {}) {
    const url = requestUrl(input);
    const method = requestMethod(input, init);
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(method);

    if (url.startsWith(prod.apiBase)) {
      throw new Error('Blocked VEC request to PROD API during migration staging.');
    }
    if (isApiGateway(url) && !url.startsWith(env.apiBase)) {
      throw new Error('Blocked VEC request outside the TRUE DEV API Gateway.');
    }
    if (url.startsWith(env.apiBase) && isWrite) {
      migration.assertWriteAllowed('dev', 'vec');
    }

    if (isWrite && isS3Url(url)) {
      if (url.includes(PROD_MEDIA_BUCKET)) {
        throw new Error('Blocked VEC storage write to PROD media bucket.');
      }
      if (!url.includes(DEV_MEDIA_BUCKET)) {
        throw new Error('Blocked VEC storage write outside the expected DEV media bucket.');
      }
      migration.assertWriteAllowed('dev', 'vec-media');
    }

    return nativeFetch(input, init);
  };

  window.StashboxVecMigrationGuard = Object.freeze({
    environment: 'dev',
    apiBase: env.apiBase,
    devMediaBucket: DEV_MEDIA_BUCKET,
    prodWritesBlocked: true
  });
})();
