const DEFAULT_RADIO_API_BASE = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const METRICS = new Map([
  ['plays', 'total_plays'],
  ['full_plays', 'full_play_count'],
  ['likes', 'like_count'],
  ['shares', 'share_count'],
  ['share_visits', 'share_link_visits'],
  ['video_clicks', 'video_clicks'],
  ['product_clicks', 'product_clicks'],
  ['listening_seconds', 'total_seconds_played']
]);

function serviceError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function clean(value) {
  return String(value || '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function limitValue(value) {
  const parsed = Math.round(Number(value || 5));
  return Math.max(1, Math.min(parsed || 5, 25));
}

function normalizeRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.songs)) return payload.songs;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

export function createTopSongAnalyticsService({
  fetchImpl = globalThis.fetch,
  radioApiBase = process.env.RADIO_API_BASE_URL || DEFAULT_RADIO_API_BASE,
  radioApiAdminToken = process.env.RADIO_API_ADMIN_TOKEN || ''
} = {}) {
  if (!fetchImpl) throw new Error('fetch_unavailable');

  return {
    async topSongs(event = {}) {
      const query = event.queryStringParameters || {};
      const metric = clean(query.metric || 'plays').toLowerCase();
      const period = clean(query.period || 'all_time').toLowerCase();
      const artist = clean(query.artist).toLowerCase();
      const genre = clean(query.genre).toLowerCase();
      const limit = limitValue(query.limit);
      const field = METRICS.get(metric);

      if (!field) {
        throw serviceError('unsupported_metric', 422, { supported_metrics: [...METRICS.keys()] });
      }

      if (period !== 'all_time') {
        throw serviceError('period_analytics_not_ready', 409, {
          requested_period: period,
          supported_periods: ['all_time'],
          next_backend_requirement: 'date-window aggregation over Radio event records'
        });
      }

      const url = `${String(radioApiBase).replace(/\/$/, '')}/dashboard/songs`;
      const headers = radioApiAdminToken ? { 'x-admin-token': radioApiAdminToken } : {};
      const response = await fetchImpl(url, { method: 'GET', headers });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw serviceError('radio_analytics_request_failed', 502, {
          downstream_status: response.status,
          downstream_error: clean(payload?.error || payload?.message || 'unknown_error')
        });
      }

      const rows = normalizeRows(payload)
        .map((row) => ({
          song_key: clean(row.song_key || row.key || row.id),
          title: clean(row.display_title || row.song_name || row.title || row.name),
          artist: clean(row.artist || row.artist_name || 'Stashbox'),
          genre: clean(row.genre || row.primary_genre || 'Other'),
          metric_total: number(row[field]),
          metrics: {
            plays: number(row.total_plays),
            full_plays: number(row.full_play_count),
            likes: number(row.like_count ?? row.total_likes),
            shares: number(row.share_count ?? row.total_shares),
            share_visits: number(row.share_link_visits),
            video_clicks: number(row.video_clicks),
            product_clicks: number(row.product_clicks),
            listening_seconds: number(row.total_seconds_played)
          }
        }))
        .filter((row) => row.song_key)
        .filter((row) => !artist || row.artist.toLowerCase().includes(artist))
        .filter((row) => !genre || row.genre.toLowerCase().includes(genre))
        .sort((left, right) => right.metric_total - left.metric_total || left.title.localeCompare(right.title))
        .slice(0, limit)
        .map((row, index) => ({ rank: index + 1, ...row }));

      return {
        mode: 'read_only_analytics',
        metric,
        period,
        artist_filter: clean(query.artist),
        genre_filter: clean(query.genre),
        count: rows.length,
        songs: rows,
        campaign_song_keys: rows.map((row) => row.song_key),
        publishing_triggered: false,
        mutation_performed: false,
        generated_at: new Date().toISOString()
      };
    }
  };
}
