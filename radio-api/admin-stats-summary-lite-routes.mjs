// DEV-only lightweight summary for the private Radio Admin dashboard.
// The legacy statsSummary() endpoint also recalculates song stats, product stats,
// recent events, and other payloads that this dashboard already fetches separately.
// This route preserves the summary/today/device/event-type fields the dashboard
// consumes while avoiding those duplicate scans and payloads.

const CACHE_TTL_MS = 30 * 1000;
let cachedPayload = null;
let cacheExpiresAt = 0;

function zeroSummary() {
  return {
    total_events: 0,
    events_last_24h: 0,
    events_last_7d: 0,
    play_starts: 0,
    full_plays: 0,
    partial_plays: 0,
    skips: 0,
    likes: 0,
    shares: 0,
    video_clicks: 0,
    product_clicks: 0,
    total_listening_seconds: 0,
    total_seconds_played: 0,
    average_seconds_played: 0,
    average_completion_percent: 0,
    songs_tracked: 0,
    total_plays: 0,
    total_likes: 0,
    total_shares: 0,
    total_video_clicks: 0,
    skip_count: 0
  };
}

function zeroToday() {
  return {
    events_today: 0,
    plays_today: 0,
    likes_today: 0,
    shares_today: 0,
    product_clicks_today: 0,
    video_clicks_today: 0
  };
}

export function isAdminStatsSummaryLiteRequest(segments) {
  return segments[0] === 'admin'
    && segments[1] === 'stats'
    && segments[2] === 'summary-lite'
    && !segments[3];
}

async function tableColumns(deps, tableName) {
  const result = await deps.client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
  `, [deps.schema, tableName]);
  return new Set(result.rows.map(row => String(row.column_name || '')));
}

function eventCount(columns, values, alias) {
  if (!columns.has('event_type')) return `0::int AS ${alias}`;
  const list = (Array.isArray(values) ? values : [values])
    .map(value => `'${String(value).replace(/'/g, "''")}'`)
    .join(', ');
  return `COUNT(*) FILTER (WHERE event_type IN (${list}))::int AS ${alias}`;
}

function eventCountToday(columns, values, alias) {
  if (!columns.has('event_type') || !columns.has('created_at')) return `0::int AS ${alias}`;
  const list = (Array.isArray(values) ? values : [values])
    .map(value => `'${String(value).replace(/'/g, "''")}'`)
    .join(', ');
  return `COUNT(*) FILTER (WHERE event_type IN (${list}) AND created_at >= CURRENT_DATE)::int AS ${alias}`;
}

function timeCount(columns, condition, alias) {
  return columns.has('created_at')
    ? `COUNT(*) FILTER (WHERE created_at >= ${condition})::int AS ${alias}`
    : `0::int AS ${alias}`;
}

async function buildPayload(deps) {
  const columns = await tableColumns(deps, 'radio_events');
  if (!columns.size) {
    return {
      success: true,
      summary: zeroSummary(),
      today: zeroToday(),
      devices: [],
      event_types: [],
      generated_at: new Date().toISOString(),
      source: 'summary-lite'
    };
  }

  const secondsColumn = columns.has('seconds_played')
    ? 'seconds_played'
    : columns.has('duration_seconds')
      ? 'duration_seconds'
      : '';
  const completionColumn = columns.has('completion_percent') ? 'completion_percent' : '';
  const deviceColumn = ['device_type', 'device', 'browser', 'platform'].find(column => columns.has(column)) || '';

  const aggregateSql = `
    SELECT
      COUNT(*)::int AS total_events,
      ${timeCount(columns, "now() - interval '24 hours'", 'events_last_24h')},
      ${timeCount(columns, "now() - interval '7 days'", 'events_last_7d')},
      ${eventCount(columns, ['play_start', 'play'], 'play_starts')},
      ${eventCount(columns, ['play_full', 'complete'], 'full_plays')},
      ${eventCount(columns, 'play_partial', 'partial_plays')},
      ${eventCount(columns, ['skip', 'next_click', 'random_click'], 'skips')},
      ${eventCount(columns, 'like', 'likes')},
      ${eventCount(columns, 'share', 'shares')},
      ${eventCount(columns, ['video_click', 'video_open'], 'video_clicks')},
      ${eventCount(columns, 'product_click', 'product_clicks')},
      ${secondsColumn ? `COALESCE(SUM(${secondsColumn}), 0)::int` : '0::int'} AS total_seconds_played,
      ${secondsColumn ? `COALESCE(AVG(${secondsColumn}), 0)::float` : '0::float'} AS average_seconds_played,
      ${completionColumn ? `COALESCE(AVG(${completionColumn}), 0)::float` : '0::float'} AS average_completion_percent,
      ${timeCount(columns, 'CURRENT_DATE', 'events_today')},
      ${eventCountToday(columns, ['play_start', 'play'], 'plays_today')},
      ${eventCountToday(columns, 'like', 'likes_today')},
      ${eventCountToday(columns, 'share', 'shares_today')},
      ${eventCountToday(columns, 'product_click', 'product_clicks_today')},
      ${eventCountToday(columns, ['video_click', 'video_open'], 'video_clicks_today')}
    FROM ${deps.qname('radio_events')}
  `;

  const [aggregateResult, devicesResult, eventTypesResult] = await Promise.all([
    deps.client.query(aggregateSql),
    deviceColumn
      ? deps.client.query(`
          SELECT COALESCE(NULLIF(${deviceColumn}::text, ''), 'unknown') AS device_type,
                 COUNT(*)::int AS event_count
          FROM ${deps.qname('radio_events')}
          GROUP BY 1
          ORDER BY event_count DESC
          LIMIT 10
        `)
      : Promise.resolve({ rows: [] }),
    columns.has('event_type')
      ? deps.client.query(`
          SELECT event_type, COUNT(*)::int AS event_count
          FROM ${deps.qname('radio_events')}
          GROUP BY event_type
          ORDER BY event_count DESC
        `)
      : Promise.resolve({ rows: [] })
  ]);

  const row = aggregateResult.rows[0] || {};
  const summary = {
    ...zeroSummary(),
    total_events: Number(row.total_events || 0),
    events_last_24h: Number(row.events_last_24h || 0),
    events_last_7d: Number(row.events_last_7d || 0),
    play_starts: Number(row.play_starts || 0),
    full_plays: Number(row.full_plays || 0),
    partial_plays: Number(row.partial_plays || 0),
    skips: Number(row.skips || 0),
    likes: Number(row.likes || 0),
    shares: Number(row.shares || 0),
    video_clicks: Number(row.video_clicks || 0),
    product_clicks: Number(row.product_clicks || 0),
    total_listening_seconds: Number(row.total_seconds_played || 0),
    total_seconds_played: Number(row.total_seconds_played || 0),
    average_seconds_played: Number(row.average_seconds_played || 0),
    average_completion_percent: Number(row.average_completion_percent || 0)
  };
  summary.total_plays = summary.play_starts;
  summary.total_likes = summary.likes;
  summary.total_shares = summary.shares;
  summary.total_video_clicks = summary.video_clicks;
  summary.skip_count = summary.skips;

  return {
    success: true,
    summary,
    today: {
      events_today: Number(row.events_today || 0),
      plays_today: Number(row.plays_today || 0),
      likes_today: Number(row.likes_today || 0),
      shares_today: Number(row.shares_today || 0),
      product_clicks_today: Number(row.product_clicks_today || 0),
      video_clicks_today: Number(row.video_clicks_today || 0)
    },
    devices: devicesResult.rows,
    event_types: eventTypesResult.rows,
    generated_at: new Date().toISOString(),
    source: 'summary-lite'
  };
}

export async function handleAdminStatsSummaryLiteRequest(event, deps) {
  if (deps.getMethod(event).toUpperCase() !== 'GET') {
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }

  // Hard DEV guard. This optimization is intentionally not available in PROD.
  if (deps.schema !== 'radio_dev') {
    return deps.response(404, { success: false, error: 'Not found.' });
  }

  await deps.requireAdmin(event);

  const now = Date.now();
  if (cachedPayload && cacheExpiresAt > now) {
    return deps.response(200, { ...cachedPayload, cache: 'warm' });
  }

  let payload;
  try {
    payload = await buildPayload(deps);
  } catch (error) {
    if (error?.code !== '42P01') throw error;
    payload = {
      success: true,
      summary: zeroSummary(),
      today: zeroToday(),
      devices: [],
      event_types: [],
      generated_at: new Date().toISOString(),
      source: 'summary-lite'
    };
  }

  cachedPayload = payload;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return deps.response(200, { ...payload, cache: 'fresh' });
}
