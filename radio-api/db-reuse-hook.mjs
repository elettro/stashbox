import pg from 'pg';

// DEV-only PostgreSQL connection reuse hook.
// Loaded before the normal Radio API modules by the TRUE DEV deployment wrapper.
// Production behavior remains unchanged because reuse is disabled outside DEV.

const { Client, Pool } = pg;
const originalConnect = Client.prototype.connect;
const originalQuery = Client.prototype.query;
const originalEnd = Client.prototype.end;
const leaseSymbol = Symbol.for('stashbox.radio.devDbLease');

function runtimeIsDev() {
  const runtime = String(
    process.env.APP_ENV || process.env.STAGE || process.env.NODE_ENV || process.env.ENVIRONMENT || ''
  ).trim().toLowerCase();
  return runtime === 'dev' || runtime === 'development';
}

function envFlag(name, fallback = true) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return !['false', '0', 'off', 'no'].includes(String(raw).trim().toLowerCase());
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

const reuseEnabled = runtimeIsDev() && envFlag('DB_CONNECTION_REUSE_ENABLED', true);
const validateOnCheckout = envFlag('DB_CONNECTION_REUSE_VALIDATE', true);
const idleTimeoutMillis = positiveInteger(process.env.DB_CONNECTION_REUSE_IDLE_MS, 120000);

class RawPoolClient extends Client {
  connect(...args) {
    return originalConnect.apply(this, args);
  }

  query(...args) {
    return originalQuery.apply(this, args);
  }

  end(...args) {
    return originalEnd.apply(this, args);
  }
}

let warmPool = null;
let warmPoolKey = '';

function poolIdentity(clientInstance) {
  const params = clientInstance?.connectionParameters || {};
  return [params.host || '', params.port || 5432, params.database || '', params.user || ''].join('|');
}

function poolConfig(clientInstance) {
  const params = clientInstance?.connectionParameters || {};
  return {
    host: params.host,
    port: Number(params.port || 5432),
    database: params.database,
    user: params.user,
    password: params.password,
    ssl: params.ssl,
    connectionTimeoutMillis: Number(params.connectionTimeoutMillis || 10000),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    max: 1,
    idleTimeoutMillis,
    allowExitOnIdle: true,
    Client: RawPoolClient
  };
}

function getWarmPool(clientInstance) {
  const key = poolIdentity(clientInstance);
  if (warmPool && warmPoolKey === key) return warmPool;

  if (warmPool) {
    warmPool.end().catch((error) => {
      console.warn('[DEV DB reuse] prior pool close failed', error?.message || error);
    });
  }

  warmPoolKey = key;
  warmPool = new Pool(poolConfig(clientInstance));
  warmPool.on('error', (error) => {
    console.warn('[DEV DB reuse] idle PostgreSQL connection error', error?.message || error);
  });
  return warmPool;
}

async function acquireLease(clientInstance) {
  const pool = getWarmPool(clientInstance);
  let lastError = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let lease = null;
    try {
      lease = await pool.connect();
      if (validateOnCheckout) {
        await originalQuery.call(lease, 'SELECT 1');
      }
      clientInstance[leaseSymbol] = lease;
      return;
    } catch (error) {
      lastError = error;
      if (lease) {
        try {
          lease.release(error);
        } catch (_) {
          // Ignore release failures; the pool will create a fresh connection next time.
        }
      }
      if (attempt === 0) continue;
    }
  }

  throw lastError || new Error('Unable to acquire DEV PostgreSQL connection.');
}

function withOptionalCallback(promise, callback) {
  if (typeof callback !== 'function') return promise;
  promise.then(() => callback()).catch((error) => callback(error));
  return undefined;
}

if (reuseEnabled) {
  Client.prototype.connect = function reusedConnect(...args) {
    const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (this[leaseSymbol]) return withOptionalCallback(Promise.resolve(), callback);
    return withOptionalCallback(acquireLease(this), callback);
  };

  Client.prototype.query = function reusedQuery(...args) {
    const lease = this[leaseSymbol];
    if (!lease) return originalQuery.apply(this, args);
    return originalQuery.apply(lease, args);
  };

  Client.prototype.end = function reusedEnd(...args) {
    const callback = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    const lease = this[leaseSymbol];
    if (!lease) return originalEnd.apply(this, args);

    this[leaseSymbol] = null;
    let releaseError = null;
    try {
      lease.release();
    } catch (error) {
      releaseError = error;
    }

    const promise = releaseError ? Promise.reject(releaseError) : Promise.resolve();
    return withOptionalCallback(promise, callback);
  };

  console.log('[DEV DB reuse] warm PostgreSQL connection reuse enabled', {
    maxConnectionsPerRuntime: 1,
    idleTimeoutMillis,
    validateOnCheckout
  });
}
