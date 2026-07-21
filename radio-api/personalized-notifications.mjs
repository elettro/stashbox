import crypto from 'node:crypto';
import { ensureAccountTables } from './account-routes.mjs';
import { ensureNotificationTables } from './notifications.mjs';
import { safelySyncRecentSongActivityNotifications } from './notification-activity-feed.mjs';

const PERSONAL_SOURCE_TYPE = 'personalization_engine';
const DAILY_SOURCE_TYPE = 'daily_rankings';
const PLAYER_PATH = '/radio/dev/';
const FAVORITE_LIKE_MILESTONES = [10, 25, 50, 100, 250, 500, 1000];

function cleanText(value, maxLength = 500) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function highestReached(value, milestones) {
  const count = safeNumber(value);
  return [...milestones].reverse().find(milestone => count >= milestone) || 0;
}

function easternDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function playerUrl(songKey) {
  return `${PLAYER_PATH}?song=${encodeURIComponent(cleanText(songKey, 300))}`;
}

function deterministicId(sourceType, sourceKey) {
  return `${sourceType}-${crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 32)}`;
}

async function syncAccount(event, deps) {
  const identity = await deps.verifyIdentity(event, { required: false });
  if (!identity?.sub) return null;
  await ensureAccountTables(deps);

  const email = cleanText(identity.email, 320).toLowerCase();
  const displayName = cleanText(
    identity.displayName || (email.includes('@') ? email.split('@')[0] : 'Listener'),
    120
  );
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('users')} AS account_user (
      id, cognito_sub, email, email_verified, display_name, status, last_login_at, last_seen_at
    ) VALUES ($1, $2, $3, $4, $5, 'active', now(), now())
    ON CONFLICT (cognito_sub)
    DO UPDATE SET
      email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE account_user.email END,
      email_verified = account_user.email_verified OR EXCLUDED.email_verified,
      last_seen_at = now(),
      updated_at = now()
    RETURNING *
  `, [crypto.randomUUID(), identity.sub, email, Boolean(identity.emailVerified), displayName]);

  const user = result.rows[0];
  if (!user || user.status !== 'active') {
    const error = new Error('This Stashbox Radio account is disabled or unavailable.');
    error.statusCode = 403;
    error.code = 'ACCOUNT_UNAVAILABLE';
    throw error;
  }

  await deps.client.query(`
    INSERT INTO ${deps.qname('user_roles')} (user_id, role, status, granted_by, approved_at)
    VALUES ($1, 'listener', 'approved', 'system', now())
    ON CONFLICT (user_id, role) DO NOTHING
  `, [user.id]);
  await deps.client.query(`
    INSERT INTO ${deps.qname('notification_preferences')} (user_id)
    VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
  `, [user.id]);
  return { identity, user };
}

async function findEventTable(deps) {
  for (const tableName of ['radio_events', 'song_events', 'events']) {
    try {
      const result = await deps.client.query(`SELECT * FROM ${deps.qname(tableName)} LIMIT 0`);
      return {
        qualifiedName: deps.qname(tableName),
        columns: new Set((result.fields || []).map(field => field.name))
      };
    } catch (error) {
      if (error?.code !== '42P01') throw error;
    }
  }
  return null;
}

async function loadSong(deps, songKey) {
  if (!songKey) return null;
  try {
    const result = await deps.client.query(`
      SELECT * FROM ${deps.qname('songs')}
      WHERE song_key = $1
      LIMIT 1
    `, [songKey]);
    return result.rows[0] || null;
  } catch (error) {
    if (error?.code === '42P01') return null;
    throw error;
  }
}

function songPresentation(song, fallback = {}) {
  return {
    songKey: cleanText(song?.song_key || fallback.song_key, 300),
    title: cleanText(song?.display_title || song?.song_name || fallback.display_title || fallback.song_key || 'A Stashbox Radio song', 300),
    artist: cleanText(song?.artist || fallback.artist, 300),
    imageUrl: cleanText(song?.resolved_artwork_url || song?.song_artwork_url || fallback.image_url, 2000) || null
  };
}

async function insertPersonalNotification(deps, {
  sourceKey,
  userId,
  headline,
  message,
  category = 'stashbox_news',
  imageUrl = null,
  actionLabel = null,
  actionUrl = null,
  priority = 45,
  expiresAt = null
}) {
  const id = deterministicId(PERSONAL_SOURCE_TYPE, sourceKey);
  const result = await deps.client.query(`
    INSERT INTO ${deps.qname('notifications')} (
      id, internal_title, headline, message, category, image_url, action_label, action_url,
      status, priority, pinned, dismissible, audience_type, artist_keys, target_user_ids,
      delivery_channels, publish_at, expires_at, created_by, source_type, source_key
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      'published', $9, false, true, 'specific_users', '[]'::jsonb, $10::jsonb,
      '["in_app"]'::jsonb, now(), $11, $12, $13, $14
    )
    ON CONFLICT (source_type, source_key) WHERE source_key IS NOT NULL DO NOTHING
    RETURNING id
  `, [
    id,
    `Personalized: ${sourceKey}`,
    headline,
    message,
    category,
    imageUrl,
    actionLabel,
    actionUrl,
    priority,
    JSON.stringify([userId]),
    expiresAt,
    PERSONAL_SOURCE_TYPE,
    PERSONAL_SOURCE_TYPE,
    sourceKey
  ]);
  return result.rowCount;
}

async function syncListenerAchievements(account, deps) {
  const counts = await deps.client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM ${deps.qname('user_favorites')} WHERE user_id = $1) AS favorites,
      (SELECT COUNT(*)::int FROM ${deps.qname('user_follows')} WHERE user_id = $1) AS follows,
      (SELECT COUNT(*)::int FROM ${deps.qname('playlists')} WHERE user_id = $1) AS playlists,
      (SELECT COUNT(*)::int FROM ${deps.qname('user_listening_history')} WHERE user_id = $1 AND (completed = true OR event_type = 'play_full')) AS full_tracks,
      (SELECT COALESCE(SUM(seconds_played), 0)::numeric FROM ${deps.qname('user_listening_history')} WHERE user_id = $1) AS listening_seconds
  `, [account.user.id]);
  const row = counts.rows[0] || {};
  const achievements = [
    {
      type: 'favorites',
      value: safeNumber(row.favorites),
      milestones: [10, 50, 100, 250],
      copy: milestone => ({
        headline: `${milestone} songs saved`,
        message: `You just saved your ${milestone}th favorite song on Stashbox Radio. Your collection is growing.`,
        actionLabel: 'Open Favorites',
        actionUrl: `${PLAYER_PATH}?account=favorites`
      })
    },
    {
      type: 'follows',
      value: safeNumber(row.follows),
      milestones: [5, 10, 25],
      copy: milestone => ({
        headline: `${milestone} artists followed`,
        message: `You are now following ${milestone} artists. Their eligible updates can appear in your personal notification feed.`,
        actionLabel: 'Open Account',
        actionUrl: `${PLAYER_PATH}?account=following`
      })
    },
    {
      type: 'playlists',
      value: safeNumber(row.playlists),
      milestones: [1, 5, 10],
      copy: milestone => ({
        headline: milestone === 1 ? 'Your first playlist' : `${milestone} playlists created`,
        message: milestone === 1
          ? 'You created your first Stashbox Radio playlist. Add songs and make it yours.'
          : `You have created ${milestone} personal playlists on Stashbox Radio.`,
        actionLabel: 'Open Playlists',
        actionUrl: `${PLAYER_PATH}?account=playlists`
      })
    },
    {
      type: 'full_tracks',
      value: safeNumber(row.full_tracks),
      milestones: [10, 50, 100, 500],
      copy: milestone => ({
        headline: `${milestone} songs completed`,
        message: `You have listened through ${milestone} complete songs on Stashbox Radio.`,
        actionLabel: 'Keep Listening',
        actionUrl: PLAYER_PATH
      })
    },
    {
      type: 'listening_hours',
      value: Math.floor(safeNumber(row.listening_seconds) / 3600),
      milestones: [10, 50, 100, 500],
      copy: milestone => ({
        headline: `${milestone} listening hours`,
        message: `You have spent ${milestone} hours listening on Stashbox Radio. You rock.`,
        actionLabel: 'Open Radio',
        actionUrl: PLAYER_PATH
      })
    }
  ];

  let created = 0;
  for (const achievement of achievements) {
    const milestone = highestReached(achievement.value, achievement.milestones);
    if (!milestone) continue;
    const copy = achievement.copy(milestone);
    created += await insertPersonalNotification(deps, {
      sourceKey: `listener:${account.user.id}:${achievement.type}:${milestone}`,
      userId: account.user.id,
      ...copy,
      priority: 55
    });
  }
  return created;
}

async function syncFavoriteLikeMilestones(account, deps, eventTable) {
  if (!eventTable?.columns.has('song_key') || !eventTable.columns.has('event_type')) return 0;
  const favorites = await deps.client.query(`
    SELECT song_key, display_title, artist
    FROM ${deps.qname('user_favorites')}
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 200
  `, [account.user.id]);
  const songKeys = favorites.rows.map(row => cleanText(row.song_key, 300)).filter(Boolean);
  if (!songKeys.length) return 0;

  const counts = await deps.client.query(`
    SELECT song_key::text AS song_key, COUNT(*)::int AS like_count
    FROM ${eventTable.qualifiedName}
    WHERE event_type = 'like' AND song_key = ANY($1::text[])
    GROUP BY song_key
    ORDER BY like_count DESC
  `, [songKeys]);
  const favoriteMap = new Map(favorites.rows.map(row => [cleanText(row.song_key, 300), row]));
  let created = 0;
  for (const row of counts.rows) {
    if (created >= 3) break;
    const milestone = highestReached(row.like_count, FAVORITE_LIKE_MILESTONES);
    if (!milestone) continue;
    const favorite = favoriteMap.get(cleanText(row.song_key, 300)) || {};
    const song = await loadSong(deps, row.song_key);
    const presentation = songPresentation(song, favorite);
    created += await insertPersonalNotification(deps, {
      sourceKey: `favorite-like:${account.user.id}:${presentation.songKey}:${milestone}`,
      userId: account.user.id,
      headline: `${presentation.title} reached ${milestone} likes`,
      message: `A song you saved${presentation.artist ? ` by ${presentation.artist}` : ''} is getting attention. Give it another spin.`,
      category: 'artist_update',
      imageUrl: presentation.imageUrl,
      actionLabel: 'Play Song',
      actionUrl: playerUrl(presentation.songKey),
      priority: 60
    });
  }
  return created;
}

async function syncDailyTopSong(deps, eventTable) {
  if (!eventTable?.columns.has('song_key') || !eventTable.columns.has('event_type') || !eventTable.columns.has('created_at')) return 0;
  const result = await deps.client.query(`
    SELECT song_key::text AS song_key, COUNT(*)::int AS play_count, MAX(created_at) AS latest_play
    FROM ${eventTable.qualifiedName}
    WHERE event_type = 'play_start'
      AND created_at >= ((date_trunc('day', now() AT TIME ZONE 'America/New_York')) AT TIME ZONE 'America/New_York')
    GROUP BY song_key
    HAVING COUNT(*) >= 3
    ORDER BY play_count DESC, latest_play DESC
    LIMIT 1
  `);
  if (!result.rowCount) return 0;

  const top = result.rows[0];
  const song = await loadSong(deps, top.song_key);
  const presentation = songPresentation(song, top);
  if (!presentation.songKey) return 0;
  const sourceKey = `daily-top-song:${easternDateKey()}`;
  const id = deterministicId(DAILY_SOURCE_TYPE, sourceKey);
  const artistText = presentation.artist ? ` by ${presentation.artist}` : '';
  const inserted = await deps.client.query(`
    INSERT INTO ${deps.qname('notifications')} (
      id, internal_title, headline, message, category, image_url, action_label, action_url,
      status, priority, pinned, dismissible, audience_type, artist_keys, target_user_ids,
      delivery_channels, publish_at, expires_at, created_by, source_type, source_key
    ) VALUES (
      $1, $2, $3, $4, 'stashbox_news', $5, 'Play Song', $6,
      'published', 35, false, true, 'public', '[]'::jsonb, '[]'::jsonb,
      '["in_app"]'::jsonb, now(), now() + interval '30 hours', $7, $8, $9
    )
    ON CONFLICT (source_type, source_key) WHERE source_key IS NOT NULL
    DO UPDATE SET
      headline = EXCLUDED.headline,
      message = EXCLUDED.message,
      image_url = EXCLUDED.image_url,
      action_url = EXCLUDED.action_url,
      publish_at = EXCLUDED.publish_at,
      expires_at = EXCLUDED.expires_at,
      updated_at = now()
    RETURNING id
  `, [
    id,
    `Daily top song ${easternDateKey()}`,
    `Today's most-played song: ${presentation.title}`,
    `${presentation.title}${artistText} leads today's qualified plays with ${safeNumber(top.play_count)} listens.`,
    presentation.imageUrl,
    playerUrl(presentation.songKey),
    DAILY_SOURCE_TYPE,
    DAILY_SOURCE_TYPE,
    sourceKey
  ]);
  return inserted.rowCount;
}

async function safelySyncPersonalized(account, deps) {
  const summary = { achievements: 0, favorite_milestones: 0, daily_top_song: 0 };
  try {
    const eventTable = await findEventTable(deps);
    try { summary.daily_top_song = await syncDailyTopSong(deps, eventTable); }
    catch (error) { console.warn('[personalized notifications] daily top song skipped', error?.message || error); }
    if (account) {
      try { summary.achievements = await syncListenerAchievements(account, deps); }
      catch (error) { console.warn('[personalized notifications] listener achievements skipped', error?.message || error); }
      try { summary.favorite_milestones = await syncFavoriteLikeMilestones(account, deps, eventTable); }
      catch (error) { console.warn('[personalized notifications] favorite milestones skipped', error?.message || error); }
    }
  } catch (error) {
    console.warn('[personalized notifications] sync skipped', error?.message || error);
  }
  return summary;
}

async function listFeed(account, deps, limit) {
  if (!account) {
    const result = await deps.client.query(`
      SELECT id, headline, message, category, image_url, action_label, action_url,
        priority, pinned, dismissible, publish_at, expires_at, source_type, created_at
      FROM ${deps.qname('notifications')}
      WHERE status = 'published'
        AND audience_type = 'public'
        AND (publish_at IS NULL OR publish_at <= now())
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY pinned DESC, priority DESC, publish_at DESC NULLS LAST, created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows;
  }

  const result = await deps.client.query(`
    SELECT DISTINCT
      n.id, n.headline, n.message, n.category, n.image_url, n.action_label, n.action_url,
      n.priority, n.pinned, n.dismissible, n.publish_at, n.expires_at, n.source_type, n.created_at
    FROM ${deps.qname('notifications')} n
    LEFT JOIN ${deps.qname('notification_preferences')} pref ON pref.user_id = $1
    WHERE n.status = 'published'
      AND (n.publish_at IS NULL OR n.publish_at <= now())
      AND (n.expires_at IS NULL OR n.expires_at > now())
      AND COALESCE(pref.in_app_enabled, true) = true
      AND (
        COALESCE(jsonb_array_length(pref.categories), 0) = 0
        OR pref.categories @> jsonb_build_array(n.category::text)
      )
      AND (
        n.audience_type = 'public'
        OR n.audience_type = 'all_registered_users'
        OR (
          n.audience_type = 'specific_users'
          AND (
            n.target_user_ids @> jsonb_build_array($1::text)
            OR n.target_user_ids @> jsonb_build_array($2::text)
          )
        )
        OR (
          n.audience_type = 'artist_followers'
          AND EXISTS (
            SELECT 1
            FROM ${deps.qname('user_follows')} f
            WHERE f.user_id = $1
              AND f.notifications_enabled = true
              AND n.artist_keys @> jsonb_build_array(f.artist_key::text)
          )
        )
        OR (
          n.audience_type = 'premium_members'
          AND EXISTS (
            SELECT 1 FROM ${deps.qname('user_roles')} r
            WHERE r.user_id = $1 AND r.role = 'premium_listener' AND r.status = 'approved'
          )
        )
      )
    ORDER BY n.pinned DESC, n.priority DESC, n.publish_at DESC NULLS LAST, n.created_at DESC
    LIMIT $3
  `, [account.user.id, account.identity.sub, limit]);

  if (result.rowCount) {
    await deps.client.query(`
      INSERT INTO ${deps.qname('user_notification_state')} (user_id, notification_id, delivered_at)
      SELECT $1, id, now()
      FROM unnest($2::text[]) AS delivered(id)
      ON CONFLICT (user_id, notification_id)
      DO UPDATE SET delivered_at = COALESCE(user_notification_state.delivered_at, EXCLUDED.delivered_at), updated_at = now()
    `, [account.user.id, result.rows.map(row => row.id)]);
  }
  return result.rows;
}

export function isPersonalizedNotificationFeedRequest(segments) {
  return segments[0] === 'radio' && segments[1] === 'notifications' && !segments[2];
}

export async function handlePersonalizedNotificationFeedRequest(event, deps) {
  if (deps.getMethod(event).toUpperCase() !== 'GET') {
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }
  await ensureNotificationTables(deps);
  await safelySyncRecentSongActivityNotifications(deps);
  const account = await syncAccount(event, deps);
  const personalizationSync = await safelySyncPersonalized(account, deps);
  const rawLimit = Number(event.queryStringParameters?.limit || 50);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.round(rawLimit))) : 50;
  const notifications = await listFeed(account, deps, limit);
  return deps.response(200, {
    success: true,
    notifications,
    count: notifications.length,
    personalized: Boolean(account),
    personalization_sync: personalizationSync
  });
}

export {
  easternDateKey,
  highestReached,
  syncDailyTopSong,
  syncFavoriteLikeMilestones,
  syncListenerAchievements
};
