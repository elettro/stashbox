import crypto from 'node:crypto';
import { createAwsSecretStore } from './youtube-oauth.mjs';

const DEFAULT_CONFIG_SECRET = 'stashbox/social-factory/dev/youtube-oauth/config';

function serviceError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function getHeader(event, name) {
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(event?.headers || {})) {
    if (String(key).toLowerCase() === target) return String(value || '');
  }
  return '';
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function withHeaders(event, additions = {}) {
  const headers = {};
  for (const [key, value] of Object.entries(event?.headers || {})) {
    const normalized = String(key).toLowerCase();
    if (normalized === 'x-admin-token' || normalized === 'x-stashbox-actor') continue;
    headers[key] = value;
  }
  return {
    ...event,
    headers: {
      ...headers,
      ...additions
    }
  };
}

function normalizePermissions(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function permissionMatches(granted, required) {
  if (!required) return true;
  if (granted === '*' || granted === required) return true;
  if (!granted.endsWith(':*')) return false;
  return required.startsWith(granted.slice(0, -1));
}

export function hasPermission(permissions, required) {
  return normalizePermissions(permissions).some((granted) => permissionMatches(granted, required));
}

export function permissionForRequest(methodValue, pathValue) {
  const method = String(methodValue || 'GET').toUpperCase();
  const path = String(pathValue || '/');

  if (method === 'GET' && path === '/social/health') return null;
  if (method === 'GET' && path === '/social/youtube/oauth/callback') return null;
  if (method === 'GET' && path === '/social/youtube/oauth/start') return 'youtube:connect';
  if (method === 'POST' && path === '/social/youtube/disconnect') return 'youtube:disconnect';
  if (method === 'GET' && path === '/social/youtube/status') return 'youtube:read';
  if (method === 'POST' && path === '/social/uploads/presign') return 'youtube:publish';
  if (method === 'POST' && path === '/social/youtube/publish') return 'youtube:publish';

  if (method === 'GET' && path === '/social/analytics/top-songs') return 'songs:read';
  if (method === 'GET' && path === '/social/orchestration/candidates') return 'songs:read';
  if (method === 'POST' && path === '/social/orchestration/batch-plan') return 'campaigns:plan';
  if (method === 'POST' && path === '/social/orchestration/batch-drafts') return 'campaigns:create_drafts';
  if (method === 'GET' && path === '/social/orchestration/batch-jobs') return 'renders:read';
  if (method === 'POST' && path === '/social/orchestration/batch-launch') return 'renders:launch';
  if (method === 'POST' && path === '/social/orchestration/batch-stage') return 'review:stage';
  if (method === 'GET' && path === '/social/orchestration/render-jobs') return 'renders:read';
  if (method === 'POST' && path === '/social/orchestration/render-jobs') return 'renders:create_drafts';
  if (method === 'GET' && /^\/social\/orchestration\/render-jobs\/[^/]+$/.test(path)) return 'renders:read';
  if (method === 'POST' && /^\/social\/orchestration\/render-jobs\/[^/]+\/launch$/.test(path)) return 'renders:launch';
  if (method === 'POST' && /^\/social\/orchestration\/render-jobs\/[^/]+\/stage$/.test(path)) return 'review:stage';

  if (method === 'GET' && path === '/social/review-items') return 'review:read';
  if (method === 'GET' && /^\/social\/review-items\/[^/]+$/.test(path)) return 'review:read';
  if (method === 'POST' && /^\/social\/review-items\/[^/]+\/preview$/.test(path)) return 'review:read';
  if (method === 'POST' && /^\/social\/review-items\/[^/]+\/save$/.test(path)) return 'review:write';
  if (method === 'POST' && /^\/social\/review-items\/[^/]+\/decision$/.test(path)) return 'review:decide';
  if (method === 'POST' && /^\/social\/review-items\/[^/]+\/publish$/.test(path)) return 'youtube:publish';
  if (method === 'POST' && /^\/social\/review-items\/[^/]+\/schedule\/cancel$/.test(path)) return 'schedule:cancel';
  if (method === 'POST' && /^\/social\/review-items\/[^/]+\/schedule$/.test(path)) return 'schedule:create';

  return 'social:unknown';
}

export function createRequestAuthenticator({
  secretStore = createAwsSecretStore(),
  configSecretId = process.env.YOUTUBE_OAUTH_CONFIG_SECRET || DEFAULT_CONFIG_SECRET,
  customGptSecretId = process.env.SOCIAL_CUSTOM_GPT_SECRET || ''
} = {}) {
  return {
    async normalize(event = {}, { method = 'GET', path = '/' } = {}) {
      const supplied = getHeader(event, 'x-admin-token');
      const requiredPermission = permissionForRequest(method, path);

      if (!supplied || !customGptSecretId) {
        return { event, actor: null, requiredPermission };
      }

      const config = await secretStore.read(configSecretId);
      const adminToken = String(config?.admin_token || '').trim();
      if (!adminToken) throw serviceError('social_admin_token_not_configured', 500);

      if (timingSafeEqualText(supplied, adminToken)) {
        return {
          event: withHeaders(event, {
            'x-admin-token': adminToken,
            'x-stashbox-actor': 'social-factory-browser-admin'
          }),
          actor: {
            id: 'social-factory-browser-admin',
            type: 'admin',
            permission: requiredPermission
          },
          requiredPermission
        };
      }

      const credential = await secretStore.read(customGptSecretId);
      const apiKey = String(credential?.api_key || '').trim();
      const enabled = credential?.enabled !== false;

      if (!enabled || !apiKey || !timingSafeEqualText(supplied, apiKey)) {
        return { event, actor: null, requiredPermission };
      }

      const permissions = normalizePermissions(credential?.permissions);
      if (!hasPermission(permissions, requiredPermission)) {
        throw serviceError('forbidden', 403, {
          actor: String(credential?.actor_id || 'stashbox-radio-gpt'),
          required_permission: requiredPermission
        });
      }

      const actorId = String(credential?.actor_id || 'stashbox-radio-gpt').trim().slice(0, 120);
      return {
        event: withHeaders(event, {
          'x-admin-token': adminToken,
          'x-stashbox-actor': actorId
        }),
        actor: {
          id: actorId,
          type: 'custom_gpt',
          permission: requiredPermission
        },
        requiredPermission
      };
    }
  };
}

// Workflow trigger: deploy dedicated Custom GPT authentication to DEV.
