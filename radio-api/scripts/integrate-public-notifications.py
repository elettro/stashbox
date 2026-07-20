from pathlib import Path
import re


def patch_api_router():
    path = Path('radio-api/index.mjs')
    text = path.read_text()

    import_line = "import { handleAdminNotificationsRoute, handlePublicNotificationsRoute } from './notifications.mjs';\n"
    if import_line not in text:
        text = text.replace("import pg from 'pg';\n", "import pg from 'pg';\n" + import_line, 1)

    route_block = """
  if (routeStartsWith(segments, ['radio', 'notifications']) || routeStartsWith(segments, ['notifications'])) {
    return handlePublicNotificationsRoute(event, { client, qname, getMethod, getPath, parseBody, response });
  }

  if (routeStartsWith(segments, ['admin', 'notifications'])) {
    return handleAdminNotificationsRoute(event, { client, qname, getMethod, getPath, parseBody, response, requireAdmin });
  }

"""
    anchor = "  if (matchesRoute(route, ['radio/ad-settings', '/radio/ad-settings', 'ad-settings', '/ad-settings'])) {"
    if "handlePublicNotificationsRoute(event" not in text:
        if anchor not in text:
            raise RuntimeError('Notification route insertion anchor was not found in radio-api/index.mjs')
        text = text.replace(anchor, route_block + anchor, 1)

    path.write_text(text)


def patch_notification_module():
    path = Path('radio-api/notifications.mjs')
    text = path.read_text()

    normalize_replacement = r'''function normalizeNotificationInput(input = {}, { partial = false } = {}) {
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
}'''

    text, count = re.subn(
        r"function normalizeNotificationInput\(input = \{\}, \{ partial = false \} = \{\}\) \{.*?\n\}\n\nfunction validateNotification",
        normalize_replacement + "\n\nfunction validateNotification",
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise RuntimeError('normalizeNotificationInput patch failed')

    public_list_replacement = r'''async function listPublicNotifications(event, deps) {
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
}'''

    text, count = re.subn(
        r"async function listPublicNotifications\(event, deps\) \{.*?\n\}\n\nasync function recordNotificationEvent",
        public_list_replacement + "\n\nasync function recordNotificationEvent",
        text,
        count=1,
        flags=re.S,
    )
    if count != 1:
        raise RuntimeError('listPublicNotifications patch failed')

    text = text.replace(
        ".filter(([, value]) => value !== undefined && !['created_by'].includes(value));",
        ".filter(([field, value]) => value !== undefined && field !== 'created_by');"
    )
    path.write_text(text)


def patch_player():
    path = Path('radio/dev/index.html')
    text = path.read_text()
    if './notifications.css' not in text:
        text = text.replace(
            '  <link rel="stylesheet" href="./style.css">\n',
            '  <link rel="stylesheet" href="./style.css">\n  <link rel="stylesheet" href="./notifications.css">\n',
            1,
        )
    if './notifications.js' not in text:
        text = text.replace('</body>', '  <script src="./notifications.js" defer></script>\n</body>', 1)
    path.write_text(text)


def patch_navigation():
    paths = [
        Path('radio-admin/dev/index.html'),
        Path('radio-admin/songs/dev/index.html'),
        Path('radio-admin/ads/dev/index.html'),
        Path('radio-admin/dev/vec/index.html'),
        Path('radio-admin/dev/video-factory/index.html'),
        Path('radio/visual-experience/dev/index.html'),
    ]
    link = '<a href="/radio-admin/notifications/dev/">Notifications</a>'
    for path in paths:
        if not path.exists():
            continue
        text = path.read_text()
        if '/radio-admin/notifications/dev/' in text:
            continue
        text, count = re.subn(
            r'(<a\s+href="/radio-admin/ads/dev/"[^>]*>Ads</a>)',
            r'\1\n          ' + link,
            text,
            count=1,
        )
        if count:
            path.write_text(text)


def patch_admin_stats():
    path = Path('radio-admin/notifications/dev/app.js')
    text = path.read_text()
    text = text.replace(
        "if (notification.status === 'published') {\n      const publishTime",
        "if (notification.status === 'published' && notification.audience_type === 'public') {\n      const publishTime",
    )
    path.write_text(text)


patch_api_router()
patch_notification_module()
patch_player()
patch_navigation()
patch_admin_stats()
print('Public notification integration patches applied.')
