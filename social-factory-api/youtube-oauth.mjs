import crypto from 'node:crypto';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const YOUTUBE_CHANNELS_URL = 'https://www.googleapis.com/youtube/v3/channels';

export const DEFAULT_YOUTUBE_SCOPES = Object.freeze([
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly'
]);

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function hmac(value, secret) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return fallback;
  }
}

function getHeader(event, name) {
  const headers = event?.headers || {};
  const target = String(name).toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === target) {
      return String(value || '');
    }
  }

  return '';
}

function getQuery(event) {
  return event?.queryStringParameters || {};
}

function normalizeSecretValue(value) {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    return parseJson(value, {});
  }

  if (value instanceof Uint8Array) {
    return parseJson(Buffer.from(value).toString('utf8'), {});
  }

  return value;
}

function deriveStateSecret(config) {
  return crypto
    .createHash('sha256')
    .update(`${config.client_secret}:${config.admin_token}:stashbox-social-youtube-state`)
    .digest('hex');
}

function isPlaceholder(value) {
  const text = String(value || '').trim();
  return !text || text.startsWith('REPLACE_');
}

export function isYoutubeConfigComplete(config = {}) {
  return !isPlaceholder(config.client_id) &&
    !isPlaceholder(config.client_secret) &&
    !isPlaceholder(config.admin_token);
}

export function buildRedirectUri(event = {}) {
  const domain = event?.requestContext?.domainName || getHeader(event, 'host');
  const stage = event?.requestContext?.stage;
  const stageSegment = stage && stage !== '$default' ? `/${stage}` : '';

  if (!domain) {
    throw new Error('request_domain_missing');
  }

  return `https://${domain}${stageSegment}/social/youtube/oauth/callback`;
}

export function createSignedState(payload, secret, options = {}) {
  const now = options.now || Date.now();
  const ttlMs = options.ttlMs || 10 * 60 * 1000;
  const body = base64UrlEncode(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + ttlMs,
    nonce: payload?.nonce || crypto.randomUUID()
  }));

  return `${body}.${hmac(body, secret)}`;
}

export function verifySignedState(value, secret, options = {}) {
  const now = options.now || Date.now();
  const [body, signature] = String(value || '').split('.');

  if (!body || !signature || !timingSafeEqualText(signature, hmac(body, secret))) {
    throw new Error('invalid_oauth_state');
  }

  const payload = parseJson(base64UrlDecode(body), null);
  if (!payload || !payload.exp || payload.exp < now) {
    throw new Error('expired_oauth_state');
  }

  return payload;
}

export function buildAuthorizationUrl({ clientId, redirectUri, state, scopes = DEFAULT_YOUTUBE_SCOPES }) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.join(' '));
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('include_granted_scopes', 'true');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);
  return url.toString();
}

export function createAwsSecretStore() {
  let sdkPromise;
  let clientPromise;

  async function getSdk() {
    if (!sdkPromise) {
      sdkPromise = import('@aws-sdk/client-secrets-manager');
    }
    return sdkPromise;
  }

  async function getClient() {
    if (!clientPromise) {
      clientPromise = getSdk().then(({ SecretsManagerClient }) => new SecretsManagerClient({}));
    }
    return clientPromise;
  }

  return {
    async read(secretId) {
      const [{ GetSecretValueCommand }, client] = await Promise.all([getSdk(), getClient()]);
      const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
      return normalizeSecretValue(response.SecretString || response.SecretBinary);
    },

    async write(secretId, value) {
      const [{ PutSecretValueCommand }, client] = await Promise.all([getSdk(), getClient()]);
      await client.send(new PutSecretValueCommand({
        SecretId: secretId,
        SecretString: JSON.stringify(value)
      }));
    }
  };
}

function assertAdmin(event, config) {
  const supplied = getHeader(event, 'x-admin-token');
  if (!supplied || !timingSafeEqualText(supplied, config.admin_token)) {
    const error = new Error('unauthorized');
    error.statusCode = 401;
    throw error;
  }
}

async function exchangeAuthorizationCode({ fetchImpl, code, clientId, clientSecret, redirectUri }) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload?.error_description || payload?.error || 'youtube_token_exchange_failed');
    error.statusCode = 502;
    throw error;
  }

  return payload;
}

async function fetchYoutubeChannel({ fetchImpl, accessToken }) {
  const url = new URL(YOUTUBE_CHANNELS_URL);
  url.searchParams.set('part', 'id,snippet');
  url.searchParams.set('mine', 'true');

  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json();

  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'youtube_channel_lookup_failed');
    error.statusCode = 502;
    throw error;
  }

  const channel = payload?.items?.[0];
  if (!channel?.id) {
    const error = new Error('youtube_channel_not_found');
    error.statusCode = 422;
    throw error;
  }

  return {
    channel_id: channel.id,
    channel_name: channel?.snippet?.title || '',
    channel_thumbnail_url:
      channel?.snippet?.thumbnails?.high?.url ||
      channel?.snippet?.thumbnails?.default?.url ||
      ''
  };
}

async function revokeGoogleToken({ fetchImpl, token }) {
  if (!token) {
    return;
  }

  const body = new URLSearchParams({ token });
  const response = await fetchImpl(GOOGLE_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok && response.status !== 400) {
    const error = new Error('youtube_token_revocation_failed');
    error.statusCode = 502;
    throw error;
  }
}

export function createYoutubeOAuthService({
  secretStore = createAwsSecretStore(),
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  configSecretId = process.env.YOUTUBE_OAUTH_CONFIG_SECRET,
  tokenSecretId = process.env.YOUTUBE_OAUTH_TOKEN_SECRET
} = {}) {
  if (!fetchImpl) {
    throw new Error('fetch_unavailable');
  }

  async function loadConfig() {
    if (!configSecretId) {
      throw new Error('youtube_oauth_config_secret_missing');
    }
    return secretStore.read(configSecretId);
  }

  async function loadTokens() {
    if (!tokenSecretId) {
      throw new Error('youtube_oauth_token_secret_missing');
    }
    return secretStore.read(tokenSecretId);
  }

  return {
    async start(event) {
      const config = await loadConfig();
      assertAdmin(event, config);

      if (!isYoutubeConfigComplete(config)) {
        const error = new Error('youtube_oauth_not_configured');
        error.statusCode = 503;
        error.details = { redirect_uri: buildRedirectUri(event) };
        throw error;
      }

      const redirectUri = buildRedirectUri(event);
      const state = createSignedState({ platform: 'youtube' }, deriveStateSecret(config), {
        now: now()
      });
      const authorizationUrl = buildAuthorizationUrl({
        clientId: config.client_id,
        redirectUri,
        state,
        scopes: DEFAULT_YOUTUBE_SCOPES
      });

      return {
        statusCode: 302,
        headers: {
          Location: authorizationUrl,
          'Cache-Control': 'no-store'
        },
        body: ''
      };
    },

    async callback(event) {
      const config = await loadConfig();
      const query = getQuery(event);

      if (query.error) {
        const error = new Error(query.error_description || query.error);
        error.statusCode = 400;
        throw error;
      }

      if (!query.code || !query.state) {
        const error = new Error('oauth_callback_parameters_missing');
        error.statusCode = 400;
        throw error;
      }

      verifySignedState(query.state, deriveStateSecret(config), { now: now() });
      const redirectUri = buildRedirectUri(event);
      const tokenResponse = await exchangeAuthorizationCode({
        fetchImpl,
        code: query.code,
        clientId: config.client_id,
        clientSecret: config.client_secret,
        redirectUri
      });

      const existing = await loadTokens();
      const refreshToken = tokenResponse.refresh_token || existing.refresh_token;
      if (!refreshToken) {
        const error = new Error('youtube_refresh_token_missing');
        error.statusCode = 422;
        throw error;
      }

      const channel = await fetchYoutubeChannel({
        fetchImpl,
        accessToken: tokenResponse.access_token
      });
      const connectedAt = new Date(now()).toISOString();
      const stored = {
        platform: 'youtube',
        ...channel,
        refresh_token: refreshToken,
        access_token: tokenResponse.access_token,
        access_token_expires_at: new Date(now() + Number(tokenResponse.expires_in || 3600) * 1000).toISOString(),
        token_type: tokenResponse.token_type || 'Bearer',
        scope: tokenResponse.scope || DEFAULT_YOUTUBE_SCOPES.join(' '),
        connected_at: existing.connected_at || connectedAt,
        last_verified_at: connectedAt
      };

      await secretStore.write(tokenSecretId, stored);

      const successRedirect = String(config.success_redirect_uri || '').trim();
      if (successRedirect && successRedirect.startsWith('https://')) {
        return {
          statusCode: 302,
          headers: {
            Location: successRedirect,
            'Cache-Control': 'no-store'
          },
          body: ''
        };
      }

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        },
        body: `<!doctype html><html><head><meta charset="utf-8"><title>YouTube connected</title></head><body><h1>YouTube connected</h1><p>${stored.channel_name || stored.channel_id} is now connected to Stashbox Social Factory DEV.</p><p>You may close this window.</p></body></html>`
      };
    },

    async status(event) {
      const config = await loadConfig();
      assertAdmin(event, config);
      const tokens = await loadTokens();
      const configured = isYoutubeConfigComplete(config);
      const connected = Boolean(tokens.refresh_token && tokens.channel_id);

      return {
        configured,
        connected,
        connection_status: connected ? 'connected' : 'not_connected',
        token_status: connected ? 'valid' : 'unknown',
        channel_id: tokens.channel_id || null,
        channel_name: tokens.channel_name || null,
        channel_thumbnail_url: tokens.channel_thumbnail_url || null,
        scope: tokens.scope || null,
        connected_at: tokens.connected_at || null,
        last_verified_at: tokens.last_verified_at || null,
        redirect_uri: buildRedirectUri(event),
        required_scopes: DEFAULT_YOUTUBE_SCOPES
      };
    },

    async disconnect(event) {
      const config = await loadConfig();
      assertAdmin(event, config);
      const tokens = await loadTokens();
      await revokeGoogleToken({
        fetchImpl,
        token: tokens.refresh_token || tokens.access_token
      });
      await secretStore.write(tokenSecretId, {});

      return {
        connected: false,
        connection_status: 'not_connected'
      };
    }
  };
}
