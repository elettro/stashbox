import crypto from 'node:crypto';

const ACTIVITY_SOURCE_TYPE = 'activity_engine';
const ACTIVITY_EVENT_TYPES = new Set(['like', 'share']);
const ACTIVITY_MAX_PER_HOUR = 10;
const ACTIVITY_LOOKBACK_HOURS = 8;
const ACTIVITY_CANDIDATE_LIMIT = 20;
const ACTIVITY_DEDUPE_MINUTES = 30;
const ACTIVITY_EXPIRY_HOURS = 24;

function cleanText(value, maxLength = 5000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function activityBucketStart(value, minutes = ACTIVITY_DEDUPE_MINUTES) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const bucketMs = Math.max(1, Number(minutes) || ACTIVITY_DEDUPE_MINUTES) * 60_000;
  return new Date(Math.floor(date.getTime() / bucketMs) * bucketMs);
}

function activityHourStart(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMinutes(0, 0, 0);
  return date;
}

function buildActivitySourceKey(eventType, songIdentity, createdAt) {
  const bucket = activityBucketStart(createdAt);
  const normalizedType = cleanText(eventType, 40).toLowerCase();
  const normalizedSong = cleanText(songIdentity, 250);
  if (!ACTIVITY_EVENT_TYPES.has(normalizedType) || !normalizedSong || !bucket) return '';
  return `${normalizedType}:${normalizedSong}:${bucket.toISOString()}`;
}

function buildActivityCopy(eventType, title, artist = '') {
  const cleanTitle = cleanText(title, 250) || 'A Stashbox Radio song';
  const cleanArtist = cleanText(artist, 250);
  const songDescription = cleanArtist ? `“${cleanTitle}” by ${cleanArtist}` : `“${cleanTitle}”`;
  if (eventType === 'share') {
    return {
      headline: `${cleanTitle} was shared`,
      message: `A listener shared ${songDescription} from Stashbox Radio.`,
      action_label: 'Open Song'
    };
  }
  return {
    headline: `${cleanTitle} was liked`,
    message: `A listener liked ${songDescription} on Stashbox Radio.`,
    action_label: 'Play Song'
  };
}

async function ensureNotificationActivityColumns({ client, qname }) {
  await client.query(`ALTER TABLE ${qname('notifications')} ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'`);
  await client.query(`ALTER TABLE ${qname('notifications')} ADD COLUMN IF NOT EXISTS source_key TEXT`);
  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS notifications_source_key_unique_idx ON ${qname('notifications')} (source_type, source_key) WHERE source_key IS NOT NULL`);
  await client.query(`CREATE INDEX IF NOT EXISTS notifications_source_hour_idx ON ${qname('notifications')} (source_type, publish_at DESC)`);
}

async function findActivityEventTable({ client, qname }) {
  for (const tableName of ['radio_events', 'song_events', 'events']) {
    try {
      const result = await client.query(`SELECT * FROM ${qname(tableName)} LIMIT 0`);
      return {
        tableName,
        qualifiedName: qname(tableName),
        columns: new Set((result.fields || []).map((field) => field.name))
      };
    } catch (error) {
      if (error?.code !== '42P01') throw error;
    }
  }
  return null;
}

function optionalEventColumn(columns, names, alias, fallback = 'NULL::text') {
  const column = names.find((name) => columns.has(name));
  return column ? `${column}::text AS ${alias}` : `${fallback} AS ${alias}`;
}

async function loadActivitySong({ client, qname }, eventRow) {
  const songKey = cleanText(eventRow.song_key, 250);
  const songId = cleanText(eventRow.song_id, 250);
  try {
    const result = await client.query(
      `SELECT * FROM ${qname('songs')}
       WHERE ($1::text <> '' AND song_key = $1)
          OR ($2::text <> '' AND id::text = $2)
       LIMIT 1`,
      [songKey, songId]
    );
    return result.rows[0] || null;
  } catch (error) {
    if (error?.code === '42P01') return null;
    throw error;
  }
}

function activityPlayerUrl(songKey) {
  const playerPath = cleanText(process.env.PUBLIC_PLAYER_PATH || '/radio/', 500) || '/radio/';
  const normalizedPath = `${playerPath.replace(/\/+$/, '')}/`;
  return `${normalizedPath}?song=${encodeURIComponent(songKey)}`;
}

async function syncRecentSongActivityNotifications(deps) {
  const { client, qname } = deps;
  const eventTable = await findActivityEventTable(deps);
  if (!eventTable) return { created: 0, reason: 'no_event_table' };
  const { columns, qualifiedName } = eventTable;
  if (!columns.has('event_type') || !columns.has('created_at')) return { created: 0, reason: 'event_columns_missing' };
  if (!columns.has('song_key') && !columns.has('song_id')) return { created: 0, reason: 'song_identity_missing' };

  const result = await client.query(`
    SELECT
      ${optionalEventColumn(columns, ['song_key'], 'song_key')},
      ${optionalEventColumn(columns, ['song_id'], 'song_id')},
      ${optionalEventColumn(columns, ['display_title'], 'event_display_title')},
      ${optionalEventColumn(columns, ['song_name'], 'event_song_name')},
      ${optionalEventColumn(columns, ['artist'], 'event_artist')},
      event_type::text AS event_type,
      created_at
    FROM ${qualifiedName}
    WHERE event_type IN ('like', 'share')
      AND created_at >= now() - interval '${ACTIVITY_LOOKBACK_HOURS} hours'
    ORDER BY created_at DESC
    LIMIT $1
  `, [ACTIVITY_CANDIDATE_LIMIT]);

  if (!result.rowCount) return { created: 0, reason: 'no_recent_activity' };

  const existingCounts = await client.query(`
    SELECT date_trunc('hour', publish_at) AS hour_start, COUNT(*)::int AS notification_count
    FROM ${qname('notifications')}
    WHERE source_type = $1
      AND publish_at >= now() - interval '${ACTIVITY_LOOKBACK_HOURS} hours'
    GROUP BY 1
  `, [ACTIVITY_SOURCE_TYPE]);
  const countsByHour = new Map(existingCounts.rows.map((row) => [new Date(row.hour_start).toISOString(), Number(row.notification_count || 0)]));

  let created = 0;
  for (const eventRow of result.rows) {
    const eventType = cleanText(eventRow.event_type, 40).toLowerCase();
    const songIdentity = cleanText(eventRow.song_key || eventRow.song_id, 250);
    const publishAt = new Date(eventRow.created_at);
    const hourStart = activityHourStart(publishAt);
    const sourceKey = buildActivitySourceKey(eventType, songIdentity, publishAt);
    if (!ACTIVITY_EVENT_TYPES.has(eventType) || !songIdentity || !hourStart || !sourceKey) continue;

    const hourKey = hourStart.toISOString();
    if ((countsByHour.get(hourKey) || 0) >= ACTIVITY_MAX_PER_HOUR) continue;

    const song = await loadActivitySong(deps, eventRow);
    const songKey = cleanText(song?.song_key || eventRow.song_key || '', 250);
    if (!songKey) continue;
    const title = cleanText(song?.display_title || song?.song_name || eventRow.event_display_title || eventRow.event_song_name || songKey, 250);
    const artist = cleanText(song?.artist || eventRow.event_artist || '', 250);
    const imageUrl = cleanText(song?.resolved_artwork_url || song?.song_artwork_url || '', 2000) || null;
    const copy = buildActivityCopy(eventType, title, artist);
    const id = `activity-${crypto.createHash('sha256').update(sourceKey).digest('hex').slice(0, 32)}`;
    const expiresAt = new Date(publishAt.getTime() + ACTIVITY_EXPIRY_HOURS * 60 * 60 * 1000);

    const insert = await client.query(`
      INSERT INTO ${qname('notifications')} (
        id, internal_title, headline, message, category, image_url, action_label, action_url,
        status, priority, pinned, dismissible, audience_type, artist_keys, target_user_ids,
        delivery_channels, publish_at, expires_at, created_by, source_type, source_key
      ) VALUES (
        $1, $2, $3, $4, 'artist_update', $5, $6, $7,
        'published', 20, false, true, 'public', '[]'::jsonb, '[]'::jsonb,
        '["in_app"]'::jsonb, $8, $9, $10, $11, $12
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `, [
      id,
      `Automatic ${eventType}: ${title}`,
      copy.headline,
      copy.message,
      imageUrl,
      copy.action_label,
      activityPlayerUrl(songKey),
      publishAt.toISOString(),
      expiresAt.toISOString(),
      ACTIVITY_SOURCE_TYPE,
      ACTIVITY_SOURCE_TYPE,
      sourceKey
    ]);

    if (insert.rowCount) {
      created += 1;
      countsByHour.set(hourKey, (countsByHour.get(hourKey) || 0) + 1);
    }
  }

  return { created };
}

async function safelySyncRecentSongActivityNotifications(deps) {
  try {
    return await syncRecentSongActivityNotifications(deps);
  } catch (error) {
    console.warn('[Stashbox Radio Notifications] activity sync skipped', {
      message: error?.message || String(error),
      code: error?.code || undefined
    });
    return { created: 0, reason: 'sync_error' };
  }
}

export {
  ACTIVITY_MAX_PER_HOUR,
  activityBucketStart,
  activityHourStart,
  buildActivityCopy,
  buildActivitySourceKey,
  ensureNotificationActivityColumns,
  safelySyncRecentSongActivityNotifications,
  syncRecentSongActivityNotifications
};
