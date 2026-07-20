import crypto from 'node:crypto';

const NOTIFICATION_STATUSES = new Set(['draft', 'published', 'archived']);
const NOTIFICATION_AUDIENCES = new Set([
  'public',
  'all_registered_users',
  'artist_followers',
  'specific_users',
  'premium_members'
]);
const NOTIFICATION_EVENTS = new Set(['view', 'open', 'click', 'dismiss']);
const NOTIFICATION_CATEGORIES = new Set([
  'new_music',
  'new_video',
  'artist_update',
  'merchandise',
  'event',
  'livestream',
  'stashbox_news',
  'system',
  'promotion'
]);
const DELIVERY_CHANNELS = new Set(['in_app', 'browser_push', 'email']);

function cleanText(value, maxLength = 5000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function cleanStringArray(value, maxItems = 100) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  return [...new Set(source.map((item) => cleanText(item, 200)).filter(Boolean))].slice(0, maxItems);
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function normalizeTimestamp(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function getNotificationId(event) {
  const path = String(event.rawPath || event.path || '').split('?')[0];
  const segments = path.split('/').filter(Boolean);
  const index = segments.lastIndexOf('notifications');
  if (index < 0) return '';
  const possibleId = segments[index + 1] || '';
  return possibleId === 'events' ? '' : decodeURIComponent(possibleId);
}

function isEventsRoute(event) {
  const path = String(event.rawPath || event.path || '').split('?')[0];
  const segments = path.split('/').filter(Boolean);
  const index = segments.lastIndexOf('notifications');
  return index >= 0 && Boolean(segments[index + 1]) && segments[index + 2] === 'events';
}

function normalizeNotificationInput(input = {}, { partial = false } = {}) {
  const output = {};
  const hasAny = (...keys) => keys.some((key) => Object.prototype.hasOwnProperty.call(input, key));
  const assign = (field, keys, factory) => {
    if (partial && !hasAny(...keys)) return;
    output[field] = factory();
  };

  assign('internal_title', ['internal_title', 'internalTitle'], () => cleanText(input.internal_title ?? input.internalTitle, 250));
  assign('headline', ['headline', 'title'], () => cleanText(input.headline ?? input.title, 250));
  assign('message', ['message', 'description'], () => cleanText(input.message ?? input.description, 5000));
  assign('category', ['category'], () => {
    const category = cleanText(input.category, 80);
    return NOTIFICATION_CATEGORIES.has(category) ? category : 'stashbox_news';
  });
  assign('image_url', ['image_url', 'imageUrl'], () => cleanText(input.image_url ?? input.imageUrl, 2000) || null);
  assign('action_label', ['action_label', 'actionLabel'], () => cleanText(input.action_label ?? input.actionLabel, 80) || null);
  assign('action_url', ['action_url', 'actionUrl'], () => cleanText(input.action_url ?? input.actionUrl, 2000) || null);
  assign('status', ['status'], () => {
    const status = cleanText(input.status, 40).toLowerCase();
    return NOTIFICATION_STATUSES.has(status) ? status : 'draft';
  });
  assign('audience_type', ['audience_type', 'audienceType'], () => {
    const audience = cleanText(input.audience_type ?? input.audienceType, 80).toLowerCase();
    return NOTIFICATION_AUDIENCES.has(audience) ? audience : 'public';
  });
  assign('priority', ['priority'], () => {
    const rawPriority = Number(input.priority);
    return Number.isFinite(rawPriority) ? Math.max(0, Math.min(100, Math.round(rawPriority))) : 50;
  });
  assign('pinned', ['pinned'], () => normalizeBoolean(input.pinned, false));
  assign('dismissible', ['dismissible'], () => normalizeBoolean(input.dismissible, true));
  assign('artist_keys', ['artist_keys', 'artistKeys'], () => cleanStringArray(input.artist_keys ?? input.artistKeys));
  assign('target_user_ids', ['target_user_ids', 'targetUserIds'], () => cleanStringArray(input.target_user_ids ?? input.targetUserIds, 1000));
  assign('delivery_channels', ['delivery_channels', 'deliveryChannels'], () => {
    const requestedChannels = cleanStringArray(input.delivery_channels ?? input.deliveryChannels, 10)
      .filter((channel) => DELIVERY_CHANNELS.has(channel));
    return requestedChannels.length ? requestedChannels : ['in_app'];
  });
  assign('publish_at', ['publish_at', 'publishAt'], () => normalizeTimestamp(input.publish_at ?? input.publishAt));
  assign('expires_at', ['expires_at', 'expiresAt'], () => normalizeTimestamp(input.expires_at ?? input.expiresAt));
  assign('created_by', ['created_by', 'createdBy'], () => cleanText(input.created_by ?? input.createdBy, 200) || 'admin');

  return output;
}

function validateNotification(payload, { partial = false } = {}) {
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'headline')) {
    if (!payload.headline) return 'Headline is required.';
  }
  if (!partial || Object.prototype.hasOwnProperty.call(payload, 'message')) {
    if (!payload.message) return 'Message is required.';
  }
  if (payload.status === 'published' && !payload.publish_at) {
    payload.publish_at = new Date().toISOString();
  }
  if (payload.publish_at && payload.expires_at && new Date(payload.expires_at) <= new Date(payload.publish_at)) {
    return 'Expiration must be later than publish time.';
  }
  if (payload.audience_type === 'artist_followers' && !payload.artist_keys?.length) {
    return 'Artist follower notifications require at least one artist key.';
  }
  if (payload.audience_type === 'specific_users' && !payload.target_user_ids?.length) {
    return 'Specific-user notifications require at least one user ID.';
  }
  return '';
}

async function ensureNotificationTables({ client, qname }) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('notifications')} (
      id TEXT PRIMARY KEY,
      internal_title TEXT NOT NULL DEFAULT '',
      headline TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'stashbox_news',
      image_url TEXT,
      action_label TEXT,
      action_url TEXT,
      status TEXT NOT NULL DEFAULT 'draft',
      priority INTEGER NOT NULL DEFAULT 50,
      pinned BOOLEAN NOT NULL DEFAULT false,
      dismissible BOOLEAN NOT NULL DEFAULT true,
      audience_type TEXT NOT NULL DEFAULT 'public',
      artist_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      target_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
      delivery_channels JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
      publish_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_by TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT notifications_status_check CHECK (status IN ('draft', 'published', 'archived')),
      CONSTRAINT notifications_audience_check CHECK (audience_type IN ('public', 'all_registered_users', 'artist_followers', 'specific_users', 'premium_members'))
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('notification_events')} (
      id BIGSERIAL PRIMARY KEY,
      notification_id TEXT NOT NULL REFERENCES ${qname('notifications')}(id) ON DELETE CASCADE,
      anonymous_visitor_id TEXT,
      user_id TEXT,
      event_type TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT notification_events_type_check CHECK (event_type IN ('view', 'open', 'click', 'dismiss'))
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('user_notification_state')} (
      user_id TEXT NOT NULL,
      notification_id TEXT NOT NULL REFERENCES ${qname('notifications')}(id) ON DELETE CASCADE,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      clicked_at TIMESTAMPTZ,
      dismissed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, notification_id)
    )
  `);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('notification_preferences')} (
      user_id TEXT PRIMARY KEY,
      in_app_enabled BOOLEAN NOT NULL DEFAULT true,
      browser_push_enabled BOOLEAN NOT NULL DEFAULT false,
      email_enabled BOOLEAN NOT NULL DEFAULT false,
      categories JSONB NOT NULL DEFAULT '[]'::jsonb,
      artist_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await client.query(`CREATE INDEX IF NOT EXISTS notifications_public_feed_idx ON ${qname('notifications')} (status, audience_type, publish_at DESC, priority DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS notification_events_notification_idx ON ${qname('notification_events')} (notification_id, created_at DESC)`);
  await client.query(`CREATE INDEX IF NOT EXISTS notification_events_user_idx ON ${qname('notification_events')} (user_id, created_at DESC)`);
}

function notificationSelect(qname) {
  return `
    n.id,
    n.internal_title,
    n.headline,
    n.message,
    n.category,
    n.image_url,
    n.action_label,
    n.action_url,
    n.status,
    n.priority,
    n.pinned,
    n.dismissible,
    n.audience_type,
    n.artist_keys,
    n.target_user_ids,
    n.delivery_channels,
    n.publish_at,
    n.expires_at,
    n.created_by,
    n.created_at,
    n.updated_at,
    COALESCE(e.view_count, 0)::int AS view_count,
    COALESCE(e.open_count, 0)::int AS open_count,
    COALESCE(e.click_count, 0)::int AS click_count,
    COALESCE(e.dismiss_count, 0)::int AS dismiss_count
  FROM ${qname('notifications')} n
  LEFT JOIN (
    SELECT notification_id,
      COUNT(*) FILTER (WHERE event_type = 'view') AS view_count,
      COUNT(*) FILTER (WHERE event_type = 'open') AS open_count,
      COUNT(*) FILTER (WHERE event_type = 'click') AS click_count,
      COUNT(*) FILTER (WHERE event_type = 'dismiss') AS dismiss_count
    FROM ${qname('notification_events')}
    GROUP BY notification_id
  ) e ON e.notification_id = n.id`;
}

async function listPublicNotifications(event, deps) {
  const { client, qname, response } = deps;
  await ensureNotificationTables(deps);
  const rawLimit = Number(event.queryStringParameters?.limit || 50);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.round(rawLimit))) : 50;
  const result = await client.query(`
    SELECT
      id,
      headline,
      message,
      category,
      image_url,
      action_label,
      action_url,
      priority,
      pinned,
      dismissible,
      publish_at,
      expires_at,
      created_at
    FROM ${qname('notifications')}
    WHERE status = 'published'
      AND audience_type = 'public'
      AND (publish_at IS NULL OR publish_at <= now())
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY pinned DESC, priority DESC, publish_at DESC NULLS LAST, created_at DESC
    LIMIT $1
  `, [limit]);
  return response(200, { success: true, notifications: result.rows, count: result.rowCount });
}

async function recordNotificationEvent(event, deps) {
  const { client, qname, parseBody, response } = deps;
  await ensureNotificationTables(deps);
  const notificationId = getNotificationId(event);
  if (!notificationId) return response(400, { success: false, error: 'Notification ID is required.' });
  const body = parseBody(event);
  const eventType = cleanText(body.event_type ?? body.eventType, 40).toLowerCase();
  if (!NOTIFICATION_EVENTS.has(eventType)) return response(400, { success: false, error: 'Unsupported notification event.' });
  const visitorId = cleanText(body.anonymous_visitor_id ?? body.anonymousVisitorId ?? body.visitor_id ?? body.visitorId, 200) || null;
  const userId = cleanText(body.user_id ?? body.userId, 200) || null;
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata : {};
  const exists = await client.query(`SELECT 1 FROM ${qname('notifications')} WHERE id = $1 LIMIT 1`, [notificationId]);
  if (!exists.rowCount) return response(404, { success: false, error: 'Notification not found.' });
  await client.query(`
    INSERT INTO ${qname('notification_events')} (notification_id, anonymous_visitor_id, user_id, event_type, metadata)
    VALUES ($1, $2, $3, $4, $5::jsonb)
  `, [notificationId, visitorId, userId, eventType, JSON.stringify(metadata)]);
  return response(201, { success: true });
}

async function listAdminNotifications(deps) {
  const { client, qname, response } = deps;
  await ensureNotificationTables(deps);
  const result = await client.query(`
    SELECT ${notificationSelect(qname)}
    ORDER BY
      CASE n.status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END,
      n.pinned DESC,
      n.priority DESC,
      n.publish_at DESC NULLS LAST,
      n.created_at DESC
  `);
  return response(200, { success: true, notifications: result.rows, count: result.rowCount });
}

async function getAdminNotification(notificationId, deps) {
  const { client, qname, response } = deps;
  await ensureNotificationTables(deps);
  const result = await client.query(`SELECT ${notificationSelect(qname)} WHERE n.id = $1 LIMIT 1`, [notificationId]);
  if (!result.rowCount) return response(404, { success: false, error: 'Notification not found.' });
  return response(200, { success: true, notification: result.rows[0] });
}

async function createAdminNotification(event, deps) {
  const { client, qname, parseBody, response } = deps;
  await ensureNotificationTables(deps);
  const payload = normalizeNotificationInput(parseBody(event));
  const validationError = validateNotification(payload);
  if (validationError) return response(400, { success: false, error: validationError });
  const id = crypto.randomUUID();
  const result = await client.query(`
    INSERT INTO ${qname('notifications')} (
      id, internal_title, headline, message, category, image_url, action_label, action_url,
      status, priority, pinned, dismissible, audience_type, artist_keys, target_user_ids,
      delivery_channels, publish_at, expires_at, created_by
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb,
      $16::jsonb, $17, $18, $19
    )
    RETURNING *
  `, [
    id,
    payload.internal_title,
    payload.headline,
    payload.message,
    payload.category,
    payload.image_url,
    payload.action_label,
    payload.action_url,
    payload.status,
    payload.priority,
    payload.pinned,
    payload.dismissible,
    payload.audience_type,
    JSON.stringify(payload.artist_keys),
    JSON.stringify(payload.target_user_ids),
    JSON.stringify(payload.delivery_channels),
    payload.publish_at,
    payload.expires_at,
    payload.created_by
  ]);
  return response(201, { success: true, notification: result.rows[0] });
}

async function updateAdminNotification(event, notificationId, deps) {
  const { client, qname, parseBody, response } = deps;
  await ensureNotificationTables(deps);
  const payload = normalizeNotificationInput(parseBody(event), { partial: true });
  const validationError = validateNotification(payload, { partial: true });
  if (validationError) return response(400, { success: false, error: validationError });
  const entries = Object.entries(payload).filter(([field, value]) => value !== undefined && field !== 'created_by');
  if (!entries.length) return response(400, { success: false, error: 'No notification fields were supplied.' });
  const jsonFields = new Set(['artist_keys', 'target_user_ids', 'delivery_channels']);
  const assignments = entries.map(([field], index) => `${field} = $${index + 1}${jsonFields.has(field) ? '::jsonb' : ''}`);
  const values = entries.map(([field, value]) => jsonFields.has(field) ? JSON.stringify(value) : value);
  values.push(notificationId);
  const result = await client.query(`
    UPDATE ${qname('notifications')}
    SET ${assignments.join(', ')}, updated_at = now()
    WHERE id = $${values.length}
    RETURNING *
  `, values);
  if (!result.rowCount) return response(404, { success: false, error: 'Notification not found.' });
  return response(200, { success: true, notification: result.rows[0] });
}

async function archiveAdminNotification(notificationId, deps) {
  const { client, qname, response } = deps;
  await ensureNotificationTables(deps);
  const result = await client.query(`
    UPDATE ${qname('notifications')}
    SET status = 'archived', updated_at = now()
    WHERE id = $1
    RETURNING *
  `, [notificationId]);
  if (!result.rowCount) return response(404, { success: false, error: 'Notification not found.' });
  return response(200, { success: true, notification: result.rows[0] });
}

export async function handlePublicNotificationsRoute(event, deps) {
  const method = deps.getMethod(event).toUpperCase();
  if (method === 'OPTIONS') return deps.response(204, {});
  if (method === 'GET' && !getNotificationId(event)) return listPublicNotifications(event, deps);
  if (method === 'POST' && isEventsRoute(event)) return recordNotificationEvent(event, deps);
  return deps.response(405, { success: false, error: 'Method not allowed.' });
}

export async function handleAdminNotificationsRoute(event, deps) {
  const method = deps.getMethod(event).toUpperCase();
  if (method === 'OPTIONS') return deps.response(204, {});
  await deps.requireAdmin(event);
  const notificationId = getNotificationId(event);
  if (method === 'GET' && notificationId) return getAdminNotification(notificationId, deps);
  if (method === 'GET') return listAdminNotifications(deps);
  if (method === 'POST' && !notificationId) return createAdminNotification(event, deps);
  if (method === 'PUT' && notificationId) return updateAdminNotification(event, notificationId, deps);
  if (method === 'DELETE' && notificationId) return archiveAdminNotification(notificationId, deps);
  return deps.response(405, { success: false, error: 'Method not allowed.' });
}

export {
  ensureNotificationTables,
  normalizeNotificationInput,
  validateNotification
};
