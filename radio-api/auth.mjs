import { CognitoJwtVerifier } from 'aws-jwt-verify';

let verifierCache = null;

function authError(statusCode, message, code = 'AUTH_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function getHeader(event, name) {
  const target = String(name || '').toLowerCase();
  const headers = event?.headers || {};
  const key = Object.keys(headers).find(headerName => String(headerName).toLowerCase() === target);
  return key ? String(headers[key] || '').trim() : '';
}

function getBearerToken(event) {
  const authorization = getHeader(event, 'authorization');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function getCognitoConfig() {
  const userPoolId = String(process.env.COGNITO_USER_POOL_ID || '').trim();
  const clientId = String(process.env.COGNITO_APP_CLIENT_ID || process.env.COGNITO_CLIENT_ID || '').trim();
  const configuredRegion = String(process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1').trim();
  const poolRegion = userPoolId.includes('_') ? userPoolId.split('_')[0] : '';
  const region = poolRegion || configuredRegion;
  return {
    enabled: Boolean(userPoolId && clientId),
    userPoolId,
    clientId,
    region
  };
}

function getVerifiers() {
  const config = getCognitoConfig();
  if (!config.enabled) {
    throw authError(503, 'Stashbox Radio accounts are not configured in this DEV environment.', 'AUTH_NOT_CONFIGURED');
  }

  const cacheKey = `${config.userPoolId}:${config.clientId}`;
  if (!verifierCache || verifierCache.cacheKey !== cacheKey) {
    verifierCache = {
      cacheKey,
      access: CognitoJwtVerifier.create({
        userPoolId: config.userPoolId,
        tokenUse: 'access',
        clientId: config.clientId
      }),
      id: CognitoJwtVerifier.create({
        userPoolId: config.userPoolId,
        tokenUse: 'id',
        clientId: config.clientId
      })
    };
  }
  return verifierCache;
}

function normalizeGroups(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
}

export function getPublicAuthConfig() {
  const config = getCognitoConfig();
  return {
    enabled: config.enabled,
    region: config.region,
    user_pool_id: config.userPoolId,
    app_client_id: config.clientId,
    access_token_minutes: Number(process.env.COGNITO_ACCESS_TOKEN_MINUTES || 15),
    refresh_token_days: Number(process.env.COGNITO_REFRESH_TOKEN_DAYS || 30),
    mfa_available_later: true
  };
}

export async function verifyCognitoIdentity(event, { required = true } = {}) {
  const accessToken = getBearerToken(event);
  if (!accessToken) {
    if (!required) return null;
    throw authError(401, 'Authentication is required.', 'AUTH_REQUIRED');
  }

  try {
    const verifiers = getVerifiers();
    const accessPayload = await verifiers.access.verify(accessToken);
    const idToken = getHeader(event, 'x-cognito-id-token');
    let idPayload = null;

    if (idToken) {
      idPayload = await verifiers.id.verify(idToken);
      if (String(idPayload.sub || '') !== String(accessPayload.sub || '')) {
        throw authError(401, 'The supplied Cognito tokens do not belong to the same account.', 'TOKEN_SUB_MISMATCH');
      }
    }

    const sub = String(accessPayload.sub || '').trim();
    if (!sub) throw authError(401, 'Cognito token is missing its permanent account identifier.', 'TOKEN_SUB_MISSING');

    return {
      sub,
      username: String(accessPayload.username || accessPayload['cognito:username'] || idPayload?.['cognito:username'] || '').trim(),
      email: String(idPayload?.email || '').trim().toLowerCase(),
      emailVerified: idPayload?.email_verified === true || String(idPayload?.email_verified || '').toLowerCase() === 'true',
      displayName: String(idPayload?.preferred_username || idPayload?.name || '').trim(),
      tokenGroups: normalizeGroups(accessPayload['cognito:groups']),
      issuedAt: Number(accessPayload.iat || 0),
      expiresAt: Number(accessPayload.exp || 0)
    };
  } catch (error) {
    if (error?.statusCode) throw error;
    console.warn('[accounts] Cognito JWT verification failed', {
      name: error?.name,
      message: error?.message
    });
    throw authError(401, 'Your login session is invalid or expired. Log in again.', 'TOKEN_INVALID');
  }
}

export function resetCognitoVerifierCacheForTests() {
  verifierCache = null;
}

export { getBearerToken, getCognitoConfig, getHeader };
