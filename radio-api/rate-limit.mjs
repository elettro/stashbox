import crypto from 'node:crypto';

function rateLimitError(retryAfterSeconds, scope) {
  const error = new Error('Too many requests. Please wait and try again.');
  error.statusCode = 429;
  error.code = 'RATE_LIMITED';
  error.headers = { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) };
  error.scope = scope;
  return error;
}

function getSourceIp(event) {
  const gatewayIp = event?.requestContext?.http?.sourceIp || event?.requestContext?.identity?.sourceIp;
  if (gatewayIp) return String(gatewayIp).trim();
  const headers = event?.headers || {};
  const forwardedKey = Object.keys(headers).find(key => String(key).toLowerCase() === 'x-forwarded-for');
  const forwarded = forwardedKey ? String(headers[forwardedKey] || '').split(',')[0].trim() : '';
  return forwarded || 'unknown';
}

function subjectHash(value) {
  const secret = String(process.env.RATE_LIMIT_HASH_SECRET || process.env.ADMIN_TOKEN || 'stashbox-radio-dev-rate-limit').trim();
  return crypto.createHmac('sha256', secret).update(String(value || 'unknown')).digest('hex');
}

function getSubject(event, identity) {
  if (identity?.sub) return `user:${identity.sub}`;
  return `ip:${getSourceIp(event)}`;
}

export async function ensureRateLimitTable({ client, qname }) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('api_rate_limit_buckets')} (
      scope TEXT NOT NULL,
      subject_hash TEXT NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      request_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (scope, subject_hash, window_start)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS api_rate_limit_expiry_idx ON ${qname('api_rate_limit_buckets')} (expires_at)`);
}

export async function enforceRateLimit({
  client,
  qname,
  event,
  identity = null,
  scope,
  limit,
  windowSeconds
}) {
  const safeScope = String(scope || 'general').trim().slice(0, 120);
  const safeLimit = Math.max(1, Math.round(Number(limit) || 1));
  const safeWindowSeconds = Math.max(1, Math.round(Number(windowSeconds) || 60));
  await ensureRateLimitTable({ client, qname });

  const now = Date.now();
  const windowMs = safeWindowSeconds * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs).toISOString();
  const expiresAt = new Date(windowStartMs + windowMs * 2).toISOString();
  const hashedSubject = subjectHash(getSubject(event, identity));

  const result = await client.query(`
    INSERT INTO ${qname('api_rate_limit_buckets')} (
      scope, subject_hash, window_start, request_count, expires_at, updated_at
    ) VALUES ($1, $2, $3, 1, $4, now())
    ON CONFLICT (scope, subject_hash, window_start)
    DO UPDATE SET
      request_count = ${qname('api_rate_limit_buckets')}.request_count + 1,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
    RETURNING request_count
  `, [safeScope, hashedSubject, windowStart, expiresAt]);

  const requestCount = Number(result.rows[0]?.request_count || 0);
  if (Math.random() < 0.02) {
    client.query(`DELETE FROM ${qname('api_rate_limit_buckets')} WHERE expires_at < now()`).catch(() => {});
  }

  if (requestCount > safeLimit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1000));
    throw rateLimitError(retryAfterSeconds, safeScope);
  }

  return {
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - requestCount),
    reset_at: new Date(windowStartMs + windowMs).toISOString()
  };
}

export { getSourceIp, subjectHash };
