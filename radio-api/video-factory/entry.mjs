import pg from 'pg';
import { handler as radioHandler } from './radio-main.mjs';
import {
  getVideoFactoryRouteMatch,
  handleAdminVideoFactoryRoute
} from './video-factory/render-router.mjs';
import {
  handleAccountRequest,
  handleNotificationEventRequest,
  isAccountRequest,
  isNotificationEventRequest
} from './account-routes.mjs';
import {
  assertAccountIdentityAvailable,
  handleAccountLifecycleRequest,
  isAccountLifecycleRequest
} from './account-lifecycle.mjs';
import {
  handleArtistRequest,
  isArtistRequest
} from './artist-routes.mjs';
import {
  getPublicAuthConfig,
  verifyCognitoIdentity
} from './auth.mjs';

const { Client } = pg;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-token,Authorization,X-Cognito-Id-Token,X-Anonymous-Visitor-Id',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS'
};

function response(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...headers },
    body: statusCode === 204 ? '' : JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event?.body) return {};
  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  try {
    return JSON.parse(bodyText);
  } catch (_) {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    error.code = 'INVALID_JSON';
    throw error;
  }
}

function getMethod(event) {
  return String(event?.requestContext?.http?.method || event?.httpMethod || 'GET').toUpperCase();
}

function getPath(event) {
  return String(event?.rawPath || event?.path || '').split('?')[0];
}

function getRouteSegments(event) {
  const segments = getPath(event).split('/').filter(Boolean);
  const stage = String(event?.requestContext?.stage || '').trim();
  if (stage && segments[0] === stage) return segments.slice(1);
  return segments;
}

function getDbSchema() {
  const schemaName = String(process.env.PGSCHEMA || 'radio').trim();
  if (!/^[A-Za-z0-9_]+$/.test(schemaName)) {
    throw new Error('Invalid PGSCHEMA. Only letters, numbers, and underscores are allowed.');
  }
  return schemaName;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function qname(tableName) {
  const table = String(tableName || '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(table)) {
    throw new Error('Invalid table name. Only letters, numbers, and underscores are allowed.');
  }
  return `${quoteIdentifier(getDbSchema())}.${quoteIdentifier(table)}`;
}

function getHeader(event, name) {
  const target = String(name).toLowerCase();
  const headers = event?.headers || {};
  const headerName = Object.keys(headers).find(key => String(key).toLowerCase() === target);
  return headerName ? String(headers[headerName] || '') : '';
}

async function requireAdmin(event) {
  const configuredToken = String(process.env.ADMIN_TOKEN || process.env.RADIO_ADMIN_TOKEN || '').trim();
  const suppliedToken = getHeader(event, 'x-admin-token').trim();
  if (configuredToken && suppliedToken !== configuredToken) {
    const error = new Error('Unauthorized. Check admin token.');
    error.statusCode = 401;
    throw error;
  }
}

function getClient() {
  return new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
}

function isVideoFactoryRequest(event) {
  return getVideoFactoryRouteMatch(getRouteSegments(event)).isRoute;
}

function isDevRuntime() {
  const runtime = String(
    process.env.APP_ENV || process.env.STAGE || process.env.NODE_ENV || process.env.ENVIRONMENT || ''
  ).trim().toLowerCase();
  return runtime === 'dev' || runtime === 'development';
}

function buildErrorBody(error) {
  const statusCode = Number(error?.statusCode) || 500;
  const body = {
    success: false,
    error: statusCode < 500 ? String(error?.message || 'Request failed.') : 'Internal Server Error'
  };
  if (error?.code) body.code = String(error.code).slice(0, 100);
  if (error?.scope) body.rate_limit_scope = String(error.scope).slice(0, 120);

  if (isDevRuntime() && statusCode >= 500) {
    body.detail = String(error?.message || 'Unknown DEV API error.').slice(0, 1000);
  }
  return body;
}

function accountDeps(client) {
  return {
    client,
    qname,
    schema: getDbSchema(),
    response,
    parseBody,
    getMethod,
    getRouteSegments,
    getHeader,
    requireAdmin,
    verifyIdentity: verifyCognitoIdentity,
    getAuthConfig: getPublicAuthConfig
  };
}

export const handler = async event => {
  const safeEvent = event || {};
  const method = getMethod(safeEvent);
  const segments = getRouteSegments(safeEvent);
  const accountRequest = isAccountRequest(segments);
  const accountLifecycleRequest = isAccountLifecycleRequest(segments);
  const artistRequest = isArtistRequest(segments);
  const notificationEventRequest = isNotificationEventRequest(segments);
  const videoFactoryRequest = isVideoFactoryRequest(safeEvent);

  if (!accountRequest && !artistRequest && !notificationEventRequest && !videoFactoryRequest) {
    return radioHandler(safeEvent);
  }

  if (method === 'OPTIONS') return response(204, {});

  if (accountRequest && segments[1] === 'auth' && segments[2] === 'config' && method === 'GET') {
    return handleAccountRequest(safeEvent, accountDeps(null));
  }

  const client = getClient();
  try {
    await client.connect();
    const deps = accountDeps(client);

    if (accountLifecycleRequest) {
      return await handleAccountLifecycleRequest(safeEvent, deps);
    }

    if (accountRequest) {
      if (segments[1] === 'me') {
        await assertAccountIdentityAvailable(safeEvent, deps, { required: true });
      }
      return await handleAccountRequest(safeEvent, deps);
    }

    if (artistRequest) {
      await assertAccountIdentityAvailable(safeEvent, deps, { required: false });
      return await handleArtistRequest(safeEvent, deps);
    }

    if (notificationEventRequest) {
      await assertAccountIdentityAvailable(safeEvent, deps, { required: false });
      return await handleNotificationEventRequest(safeEvent, deps);
    }

    return await handleAdminVideoFactoryRoute(safeEvent, {
      client,
      qname,
      response,
      parseBody,
      getRouteSegments,
      requireAdmin
    });
  } catch (error) {
    console.error('[DEV API wrapper] request failed', {
      path: getPath(safeEvent),
      statusCode: error?.statusCode,
      message: error?.message,
      code: error?.code,
      stack: error?.stack
    });
    return response(error?.statusCode || 500, buildErrorBody(error), error?.headers || {});
  } finally {
    await client.end().catch(closeError => {
      console.error('[DEV API wrapper] PostgreSQL close failed', closeError);
    });
  }
};
