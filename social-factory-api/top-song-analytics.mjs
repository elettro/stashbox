const DEFAULT_RADIO_API_BASE = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const METRICS = new Map([
  ['plays', ['total_plays', 'play_count', 'plays', 'total_play_count', 'play_start_count']],
  ['full_plays', ['full_play_count', 'total_full_plays', 'full_plays', 'play_full_count']],
  ['likes', ['like_count', 'total_likes', 'likes']],
  ['shares', ['share_count', 'total_shares', 'shares']],
  ['share_visits', ['share_link_visits', 'share_visit_count', 'share_visits']],
  ['video_clicks', ['video_clicks', 'video_click_count']],
  ['product_clicks', ['product_clicks', 'product_click_count']],
  ['listening_seconds', ['total_seconds_played', 'listening_seconds', 'seconds_played']]
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

function firstNumber(row, fields = []) {
  for (const field of fields) {
    if (row?.[field] === null || row?.[field] === undefined || row?.[field] === '') continue;
    const parsed = Number(row[field]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
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

function normalizeGenreValue(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text = clean(value);
  if (!text) return [];
  return text.split(/[,/|]/).map((item) => item.trim()).filter(Boolean);
}

function songKey(row = {}) {
  return clean(row.song_key || row.key || row.id);
}

async function fetchJson(fetchImpl, url, headers) {
  const response = await fetchImpl(url, { method: 'GET', headers });
  const payload = await response.json().catch(() => ({}));
  return { response, payload, url };
}

async function fetchCatalog(fetchImpl, baseUrl, headers) {
  const candidates = ['/radio/songs', '/songs', '/admin/songs'];
  const failures = [];
  for (const path of candidates) {
    const result = await fetchJson(fetchImpl, `${baseUrl}${path}`, headers);
    if (result.response.ok && normalizeRows(result.payload).length) return result;
    failures.push({
      path,
      status: result.response.status,
      error: clean(result.payload?.error || result.payload?.message || 'empty_or_invalid_catalog')
    });
  }
  throw serviceError('radio_catalog_request_failed', 502, { attempted_routes: failures });
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
      const metricFields = METRICS.get(metric);

      if (!metricFields) {
        throw serviceError('unsupported_metric', 422, { supported_metrics: [...METRICS.keys()] });
      }

      if (period !== 'all_time') {
        throw serviceError('period_analytics_not_ready', 409, {
          requested_period: period,
          supported_periods: ['all_time'],
          next_backend_requirement: 'date-window aggregation over Radio event records'
        });
      }

      const baseUrl = String(radioApiBase).replace(/\/$/, '');
      const headers = radioApiAdminToken ? { 'x-admin-token': radioApiAdminToken } : {};
      const analyticsResult = await fetchJson(fetchImpl, `${baseUrl}/dashboard/songs`, headers);
      if (!analyticsResult.response.ok) {
        throw serviceError('radio_analytics_request_failed', 502, {
          downstream_status: analyticsResult.response.status,
          downstream_error: clean(analyticsResult.payload?.error || analyticsResult.payload?.message || 'unknown_error')
        });
      }

      const catalogResult = await fetchCatalog(fetchImpl, baseUrl, headers);
      const analyticsPayload = analyticsResult.payload;
      const catalogPayload = catalogResult.payload;

      const catalogBySongKey = new Map(
        normalizeRows(catalogPayload)
          .filter((row) => songKey(row))
          .map((row) => [songKey(row), row])
      );

      const rows = normalizeRows(analyticsPayload)
        .map((row) => {
          const key = songKey(row);
          const catalog = catalogBySongKey.get(key) || {};
          const primaryGenre = clean(row.genre || row.primary_genre || catalog.genre || catalog.primary_genre);
          const secondaryGenre = clean(row.secondary_genre || catalog.secondary_genre);
          const genreValues = [
            ...normalizeGenreValue(primaryGenre),
            ...normalizeGenreValue(secondaryGenre)
          ];
          const metrics = {
            plays: firstNumber(row, METRICS.get('plays')),
            full_plays: firstNumber(row, METRICS.get('full_plays')),
            likes: firstNumber(row, METRICS.get('likes')),
            shares: firstNumber(row, METRICS.get('shares')),
            share_visits: firstNumber(row, METRICS.get('share_visits')),
            video_clicks: firstNumber(row, METRICS.get('video_clicks')),
            product_clicks: firstNumber(row, METRICS.get('product_clicks')),
            listening_seconds: firstNumber(row, METRICS.get('listening_seconds'))
          };

          return {
            song_key: key,
            title: clean(row.display_title || row.song_name || row.title || row.name || catalog.display_title || catalog.song_name || catalog.title || catalog.name),
            artist: clean(row.artist || row.artist_name || catalog.artist || catalog.artist_name || 'Stashbox'),
            genre: primaryGenre || secondaryGenre || 'Other',
            secondary_genre: secondaryGenre,
            genre_values: genreValues,
            metric_total: firstNumber(row, metricFields),
            metrics
          };
        })
        .filter((row) => row.song_key)
        .filter((row) => !artist || row.artist.toLowerCase().includes(artist))
        .filter((row) => !genre || row.genre_values.some((value) => value.toLowerCase().includes(genre)))
        .sort((left, right) => right.metric_total - left.metric_total || left.title.localeCompare(right.title))
        .slice(0, limit)
        .map(({ genre_values, ...row }, index) => ({ rank: index + 1, ...row }));

      return {
        mode: 'read_only_analytics',
        metric,
        period,
        artist_filter: clean(query.artist),
        genre_filter: clean(query.genre),
        catalog_route: new URL(catalogResult.url).pathname,
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
