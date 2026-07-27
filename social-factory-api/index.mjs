const SERVICE_NAME = 'stashbox-social-api';
const SERVICE_VERSION = '0.1.0';

const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://stashbox.com',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-admin-token',
  'Access-Control-Allow-Methods': 'GET,OPTIONS'
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
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

export async function handler(event = {}) {
  const method = getRequestMethod(event);
  const path = getRequestPath(event);

  if (method === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: JSON_HEADERS,
      body: ''
    };
  }

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
        mainRadioApiDependency: false,
        executionRoleScope: 'cloudwatch-logs-only'
      }
    });
  }

  return json(404, {
    ok: false,
    error: 'route_not_found',
    method,
    path
  });
}
