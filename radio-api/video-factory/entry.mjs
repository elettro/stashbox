import pg from 'pg';
import { handler as radioHandler } from './radio-main.mjs';
import {
  getVideoFactoryRouteMatch,
  handleAdminVideoFactoryRoute
} from './video-factory/render-router.mjs';

const { Client } = pg;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,x-admin-token,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
};

function response(statusCode, body) {
  return {
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify(body)
  };
}

function parseBody(event) {
  if (!event?.body) return {};
  const bodyText = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  return JSON.parse(bodyText);
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

export const handler = async event => {
  if (!isVideoFactoryRequest(event)) return radioHandler(event);

  const client = getClient();
  try {
    await client.connect();
    return await handleAdminVideoFactoryRoute(event || {}, {
      client,
      qname,
      response,
      parseBody,
      getRouteSegments,
      requireAdmin
    });
  } catch (error) {
    console.error('[Video Factory] request failed', {
      path: getPath(event),
      statusCode: error?.statusCode,
      message: error?.message,
      stack: error?.stack
    });
    return response(error?.statusCode || 500, {
      success: false,
      error: error?.statusCode ? error.message : 'Internal Server Error'
    });
  } finally {
    await client.end().catch(closeError => {
      console.error('[Video Factory] PostgreSQL close failed', closeError);
    });
  }
};
