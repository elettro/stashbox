import pg from 'pg';

// AWS/RDS efficiency wrapper — 2026-08-20
// Preserve the canonical Radio API in ./index-core.mjs and cache only PostgreSQL
// schema-discovery reads inside a warm Lambda runtime. Listener behavior, event
// writes, response payloads, and public/player routes remain owned by index-core.

const { Client } = pg;
const originalQuery = Client.prototype.query;
const DEFAULT_DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const configuredTtl = Number(process.env.DB_DISCOVERY_CACHE_TTL_MS || DEFAULT_DISCOVERY_CACHE_TTL_MS);
const DISCOVERY_CACHE_TTL_MS = Number.isFinite(configuredTtl) && configuredTtl >= 0
  ? configuredTtl
  : DEFAULT_DISCOVERY_CACHE_TTL_MS;
const discoveryCache = new Map();

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

export const handler = core.handler;
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
