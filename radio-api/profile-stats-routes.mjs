import { ensureAccountTables } from './account-routes.mjs';

function cleanInteger(value, fallback = 0, minimum = -840, maximum = 840) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.round(number))) : fallback;
}

function routeError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function localDateKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function streakFromDates(dateValues, timezoneOffsetMinutes) {
  const dates = new Set(dateValues.filter(Boolean));
  if (!dates.size) return 0;

  const shiftedNow = new Date(Date.now() - timezoneOffsetMinutes * 60 * 1000);
  let cursor = new Date(Date.UTC(shiftedNow.getUTCFullYear(), shiftedNow.getUTCMonth(), shiftedNow.getUTCDate()));
  if (!dates.has(localDateKey(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);

  let streak = 0;
  while (dates.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

function percentageRows(rows) {
  const cleaned = rows
    .map(row => ({ genre: String(row.genre || 'Other').trim() || 'Other', weight: Math.max(0, Number(row.weight || 0)) }))
    .filter(row => row.weight > 0);
  const total = cleaned.reduce((sum, row) => sum + row.weight, 0) || 1;
  return cleaned.slice(0, 5).map(row => ({
    genre: row.genre,
    percent: Math.max(1, Math.round(row.weight / total * 100))
  }));
}

export function isProfileStatsRequest(segments) {
  return segments[0] === 'radio' && segments[1] === 'me' && segments[2] === 'profile-stats';
}

export async function handleProfileStatsRequest(event, deps) {
  if (deps.getMethod(event).toUpperCase() !== 'GET') {
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }

  const identity = await deps.verifyIdentity(event, { required: true });
  await ensureAccountTables(deps);

  const userResult = await deps.client.query(`
    SELECT id FROM ${deps.qname('users')}
    WHERE cognito_sub = $1 AND status = 'active'
    LIMIT 1
  `, [identity.sub]);
  if (!userResult.rowCount) throw routeError(404, 'ACCOUNT_NOT_FOUND', 'Listener account not found.');

  const userId = userResult.rows[0].id;
  const timezoneOffsetMinutes = cleanInteger(event?.queryStringParameters?.timezone_offset_minutes, 0);
  const qualifiedPlay = `(seconds_played > 0 OR completed = true OR event_type IN ('play_full', 'video_full'))`;

  const [countsResult, datesResult, genresResult] = await Promise.all([
    deps.client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM ${deps.qname('playlists')} WHERE user_id = $1) AS playlists,
        (SELECT COUNT(*)::int FROM ${deps.qname('user_favorites')} WHERE user_id = $1) AS favorites,
        (SELECT COUNT(*)::int FROM ${deps.qname('user_follows')} WHERE user_id = $1) AS following,
        (SELECT COUNT(*)::int
           FROM ${deps.qname('user_listening_history')}
          WHERE user_id = $1 AND ${qualifiedPlay}) AS qualified_plays,
        (SELECT COUNT(DISTINCT song_key)::int
           FROM ${deps.qname('user_listening_history')}
          WHERE user_id = $1 AND ${qualifiedPlay}) AS unique_songs_played,
        (SELECT COALESCE(SUM(seconds_played), 0)::numeric
           FROM ${deps.qname('user_listening_history')}
          WHERE user_id = $1 AND ${qualifiedPlay}) AS total_seconds_played,
        (SELECT COUNT(*)::int
           FROM ${deps.qname('user_listening_history')}
          WHERE user_id = $1) AS history_events
    `, [userId]),
    deps.client.query(`
      SELECT DISTINCT ((listened_at - ($2::int * interval '1 minute'))::date)::text AS local_date
      FROM ${deps.qname('user_listening_history')}
      WHERE user_id = $1
        AND ${qualifiedPlay}
      ORDER BY local_date DESC
      LIMIT 4000
    `, [userId, timezoneOffsetMinutes]),
    deps.client.query(`
      SELECT
        COALESCE(NULLIF(h.metadata->>'genre', ''), NULLIF(s.genre, ''), 'Other') AS genre,
        SUM(GREATEST(h.seconds_played, 1))::numeric AS weight
      FROM ${deps.qname('user_listening_history')} h
      LEFT JOIN ${deps.qname('songs')} s ON s.song_key = h.song_key
      WHERE h.user_id = $1
        AND (h.seconds_played > 0 OR h.completed = true OR h.event_type IN ('play_full', 'video_full'))
      GROUP BY 1
      ORDER BY weight DESC, genre
      LIMIT 5
    `, [userId])
  ]);

  const counts = countsResult.rows[0] || {};
  const activeDates = datesResult.rows.map(row => row.local_date).filter(Boolean);

  return deps.response(200, {
    success: true,
    stats: {
      playlists: Number(counts.playlists || 0),
      favorites: Number(counts.favorites || 0),
      following: Number(counts.following || 0),
      qualified_plays: Number(counts.qualified_plays || 0),
      unique_songs_played: Number(counts.unique_songs_played || 0),
      total_seconds_played: Number(counts.total_seconds_played || 0),
      history_events: Number(counts.history_events || 0),
      listening_streak_days: streakFromDates(activeDates, timezoneOffsetMinutes),
      active_dates: activeDates.slice(0, 14),
      top_genres: percentageRows(genresResult.rows)
    }
  });
}
