import crypto from 'node:crypto';
import pg from 'pg';

// AWS/RDS efficiency wrapper — 2026-08-20
// Preserve the canonical Radio API in ./index-core.mjs while removing avoidable
// PostgreSQL metadata reads and repeated slow-changing DEV-admin reads.
// Listener behavior, event writes, response payloads, and public/player routes
// remain owned by index-core and are never response-cached here.

const { Client } = pg;
const originalQuery = Client.prototype.query;
const DEFAULT_DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const configuredTtl = Number(process.env.DB_DISCOVERY_CACHE_TTL_MS || DEFAULT_DISCOVERY_CACHE_TTL_MS);
const DISCOVERY_CACHE_TTL_MS = Number.isFinite(configuredTtl) && configuredTtl >= 0
  ? configuredTtl
  : DEFAULT_DISCOVERY_CACHE_TTL_MS;
const discoveryCache = new Map();

// These are private/admin-only GET routes whose data changes relatively slowly.
// The cache is deliberately enabled only in DEV and only inside a warm Lambda.
const DEV_ADMIN_READ_TTLS = new Map([
  ['admin/visuals/folders', 60 * 1000],
  ['admin/ads', 60 * 1000],
  ['admin/ad-settings', 120 * 1000]
]);
const devAdminReadCache = new Map();

function queryParts(args) {
  const first = args[0];
  if (typeof first === 'string') {
    return { text: first, values: Array.isArray(args[1]) ? args[1] : [] };
  }
  if (first && typeof first === 'object') {
    return {
      text: String(first.text || ''),
      values: Array.isArray(first.values) ? first.values : (Array.isArray(args[1]) ? args[1] : [])
    };
  }
  return { text: '', values: [] };
}

function isCallbackQuery(args) {
  return typeof args[args.length - 1] === 'function';
}

function normalizedSql(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function isDiscoveryRead(text) {
  const sql = normalizedSql(text);
  return sql.includes('information_schema.columns') || sql.includes('information_schema.tables');
}

function isSchemaMutation(text) {
  const sql = normalizedSql(text);
  return /^(alter|create|drop) (table|schema)\b/.test(sql) || /^(create|drop) index\b/.test(sql);
}

function cloneResult(result) {
  if (!result || typeof result !== 'object') return result;
  return {
    ...result,
    rows: Array.isArray(result.rows) ? result.rows.map((row) => ({ ...row })) : result.rows
  };
}

function cacheKey(clientInstance, text, values) {
  const params = clientInstance?.connectionParameters || {};
  return [
    params.host || '',
    params.database || '',
    params.user || '',
    text,
    JSON.stringify(values || [])
  ].join('|');
}

Client.prototype.query = function cachedDiscoveryQuery(...args) {
  const { text, values } = queryParts(args);

  // Any DDL can change the answer to a schema-discovery query. Clear the warm
  // cache before executing it so the next discovery read is guaranteed fresh.
  if (isSchemaMutation(text)) {
    discoveryCache.clear();
    return originalQuery.apply(this, args);
  }

  // Preserve node-postgres callback semantics exactly; the Radio API currently
  // uses promises, but callback queries are deliberately passed through.
  if (DISCOVERY_CACHE_TTL_MS === 0 || isCallbackQuery(args) || !isDiscoveryRead(text)) {
    return originalQuery.apply(this, args);
  }

  const key = cacheKey(this, text, values);
  const now = Date.now();
  const cached = discoveryCache.get(key);

  if (cached && cached.expiresAt > now) {
    if (cached.result) return Promise.resolve(cloneResult(cached.result));
    if (cached.promise) return cached.promise.then(cloneResult);
  } else if (cached) {
    discoveryCache.delete(key);
  }

  const promise = Promise.resolve(originalQuery.apply(this, args))
    .then((result) => {
      discoveryCache.set(key, {
        result: cloneResult(result),
        expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS
      });
      return result;
    })
    .catch((error) => {
      discoveryCache.delete(key);
      throw error;
    });

  // Also deduplicate concurrent identical discovery requests in the same Lambda.
  discoveryCache.set(key, {
    promise,
    expiresAt: now + DISCOVERY_CACHE_TTL_MS
  });

  return promise;
};

const core = await import('./index-core.mjs');

function isDevRuntime() {
  const runtime = String(
    process.env.APP_ENV || process.env.STAGE || process.env.NODE_ENV || process.env.ENVIRONMENT || ''
  ).trim().toLowerCase();
  return runtime === 'dev' || runtime === 'development';
}

function requestMethod(event) {
  return String(event?.requestContext?.http?.method || event?.httpMethod || 'GET').toUpperCase();
}

function normalizedRequestPath(event) {
  const rawPath = String(event?.rawPath || event?.path || '').split('?')[0];
  const segments = rawPath.split('/').filter(Boolean);
  const stage = String(event?.requestContext?.stage || '').trim();

  if (stage && segments[0] === stage) {
    segments.shift();
  } else if (
    ['dev', 'prod', 'prod-v2', 'default'].includes(String(segments[0] || '').toLowerCase())
    && ['admin', 'radio', 'dashboard'].includes(String(segments[1] || '').toLowerCase())
  ) {
    segments.shift();
  }

  return segments.join('/');
}

function requestHeader(event, name) {
  const target = String(name).toLowerCase();
  const headers = event?.headers || {};
  const key = Object.keys(headers).find((headerName) => String(headerName).toLowerCase() === target);
  return key ? String(headers[key] || '') : '';
}

function requestAuthScope(event) {
  const material = [
    requestHeader(event, 'x-admin-token'),
    requestHeader(event, 'authorization'),
    requestHeader(event, 'x-cognito-id-token')
  ].join('|');
  return crypto.createHash('sha256').update(material).digest('hex').slice(0, 24);
}

function requestQueryKey(event) {
  if (typeof event?.rawQueryString === 'string') return event.rawQueryString;
  const params = event?.queryStringParameters;
  if (!params || typeof params !== 'object') return '';
  return Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value ?? '')}`)
    .join('&');
}

function cloneLambdaResponse(response) {
  if (!response || typeof response !== 'object') return response;
  return {
    ...response,
    headers: response.headers && typeof response.headers === 'object'
      ? { ...response.headers }
      : response.headers,
    cookies: Array.isArray(response.cookies) ? [...response.cookies] : response.cookies
  };
}

function successfulLambdaResponse(response) {
  const statusCode = Number(response?.statusCode || 200);
  return statusCode >= 200 && statusCode < 300;
}

function adminReadCacheKey(event, path) {
  return [path, requestAuthScope(event), requestQueryKey(event)].join('|');
}

function invalidateDevAdminReadsForWrite(path) {
  const relatedRoutes = [];
  if (path.startsWith('admin/visuals/')) relatedRoutes.push('admin/visuals/folders');
  if (path.startsWith('admin/ads') || path.startsWith('admin/ad-settings')) {
    relatedRoutes.push('admin/ads', 'admin/ad-settings');
  }
  if (!relatedRoutes.length) return;

  for (const key of devAdminReadCache.keys()) {
    if (relatedRoutes.some((route) => key.startsWith(`${route}|`))) {
      devAdminReadCache.delete(key);
    }
  }
}

async function handleWithDevAdminReadCache(event) {
  const method = requestMethod(event);
  const path = normalizedRequestPath(event);

  // This optimization is intentionally DEV-only and private/admin-only.
  if (!isDevRuntime()) return core.handler(event);

  if (method !== 'GET') {
    invalidateDevAdminReadsForWrite(path);
    return core.handler(event);
  }

  const ttlMs = DEV_ADMIN_READ_TTLS.get(path);
  if (!ttlMs) return core.handler(event);

  const key = adminReadCacheKey(event, path);
  const now = Date.now();
  const cached = devAdminReadCache.get(key);

  if (cached && cached.expiresAt > now) {
    if (cached.response) return cloneLambdaResponse(cached.response);
    if (cached.promise) return cached.promise.then(cloneLambdaResponse);
  } else if (cached) {
    devAdminReadCache.delete(key);
  }

  const promise = Promise.resolve(core.handler(event))
    .then((response) => {
      if (successfulLambdaResponse(response)) {
        devAdminReadCache.set(key, {
          response: cloneLambdaResponse(response),
          expiresAt: Date.now() + ttlMs
        });
      } else {
        devAdminReadCache.delete(key);
      }
      return response;
    })
    .catch((error) => {
      devAdminReadCache.delete(key);
      throw error;
    });

  // Deduplicate simultaneous identical admin GETs in the same warm Lambda.
  devAdminReadCache.set(key, { promise, expiresAt: now + ttlMs });

  // Bound the cache even if a future admin page introduces many query variants.
  if (devAdminReadCache.size > 100) {
    for (const [cacheEntryKey, value] of devAdminReadCache.entries()) {
      if (!value || value.expiresAt <= now) devAdminReadCache.delete(cacheEntryKey);
    }
  }

  return promise;
}

export const handler = handleWithDevAdminReadCache;
export const handleAdminAdsRoute = core.handleAdminAdsRoute;
export const handleAdminAdSettingsRoute = core.handleAdminAdSettingsRoute;
export const handlePublicAdsRoute = core.handlePublicAdsRoute;
export const handlePublicAdSettingsRoute = core.handlePublicAdSettingsRoute;
export const handleTrackRoute = core.handleTrackRoute;
export const getPublicAdsRouteMatch = core.getPublicAdsRouteMatch;
export const listAds = core.listAds;
export const listPublicAds = core.listPublicAds;
export const recordPublicAdEvent = core.recordPublicAdEvent;
export const trackAdEvent = core.trackAdEvent;
export const createAd = core.createAd;
export const updateAd = core.updateAd;
export const deleteAd = core.deleteAd;
export const getRouteSegments = core.getRouteSegments;
export const getVisualsFolderAssetsRouteMatch = core.getVisualsFolderAssetsRouteMatch;
export const matchesPublicVisualsFolderAssetsRoute = core.matchesPublicVisualsFolderAssetsRoute;
export const handlePublicVisualsFolderAssetsRoute = core.handlePublicVisualsFolderAssetsRoute;
