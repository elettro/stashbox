import { createYoutubeOAuthService } from './youtube-oauth.mjs';

const SERVICE_NAME = 'stashbox-social-api';
const SERVICE_VERSION = '0.2.0';

function getJsonHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://stashbox.com',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-admin-token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...getJsonHeaders(),
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function getRequestMethod(event = {}) {
  return String(
    event?.requestContext?.http?.method ||
    event?.httpMethod ||
    'GET'
  ).toUpperCase();
}

function getRequestPath(event = {}) {
  const rawPath = event?.rawPath || event?.requestContext?.http?.path || event?.path || '/';
  const stage = event?.requestContext?.stage;

  if (stage && rawPath.startsWith(`/${stage}/`)) {
    return rawPath.slice(stage.length + 1);
  }

  return rawPath;
}

function errorResponse(error) {
  const statusCode = Number(error?.statusCode || 500);
  const body = {
    ok: false,
    error: error?.message || 'internal_error'
  };

  if (error?.details) {
    body.details = error.details;
  }

  if (statusCode >= 500) {
    console.error('Social Factory API error', {
      error: body.error,
      stack: error?.stack
    });
  }

  return json(statusCode, body);
}

export function createHandler({ youtubeOAuth = createYoutubeOAuthService() } = {}) {
  return async function socialFactoryHandler(event = {}) {
    const method = getRequestMethod(event);
    const path = getRequestPath(event);

    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: getJsonHeaders(),
        body: ''
      };
    }

    try {
      if (method === 'GET' && path === '/social/health') {
        return json(200, {
          ok: true,
          service: SERVICE_NAME,
          version: SERVICE_VERSION,
          environment: process.env.APP_ENV || 'dev',
          timestamp: new Date().toISOString(),
          isolation: {
            databaseConfigured: false,
            s3Configured: false,
            queueConfigured: false,
            secretsConfigured: true,
            youtubeOauthConfigured: true,
            mainRadioApiDependency: false,
            executionRoleScope: 'cloudwatch-logs-and-youtube-oauth-secrets'
          }
        });
      }

      if (method === 'GET' && path === '/social/youtube/oauth/start') {
        return await youtubeOAuth.start(event);
      }

      if (method === 'GET' && path === '/social/youtube/oauth/callback') {
        return await youtubeOAuth.callback(event);
      }

      if (method === 'GET' && path === '/social/youtube/status') {
        return json(200, {
          ok: true,
          ...(await youtubeOAuth.status(event))
        });
      }

      if (method === 'POST' && path === '/social/youtube/disconnect') {
        return json(200, {
          ok: true,
          ...(await youtubeOAuth.disconnect(event))
        });
      }

      return json(404, {
        ok: false,
        error: 'route_not_found',
        method,
        path
      });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

export const handler = createHandler();
