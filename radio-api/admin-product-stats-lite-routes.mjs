// DEV-only lightweight Product Analytics route.
// The legacy product stats path scans the event table once for summary totals,
// once for grouped products, and once for recent clicks. This version folds the
// summary totals into the grouped-product query with window aggregates, reducing
// the normal path to two event-table passes while preserving the dashboard shape.

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

function parseLimit(event, fallback = 25, maximum = 200) {
  const raw = Number(event?.queryStringParameters?.limit || fallback);
  return Number.isFinite(raw) ? Math.max(1, Math.min(maximum, Math.round(raw))) : fallback;
}

function emptySummary() {
  return {
    total_product_clicks: 0,
    unique_products_clicked: 0,
    product_clicks_last_24h: 0,
    product_clicks_last_7d: 0
  };
}

export function isAdminProductStatsLiteRequest(segments) {
  return segments[0] === 'admin'
    && segments[1] === 'stats'
    && segments[2] === 'products-lite'
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

function recentCount(columns, intervalSql, alias) {
  return columns.has('created_at')
    ? `COUNT(*) FILTER (WHERE created_at >= ${intervalSql})::int AS ${alias}`
    : `0::int AS ${alias}`;
}

async function buildPayload(event, deps) {
  const limit = parseLimit(event);
  const columns = await tableColumns(deps, 'radio_events');
  if (!columns.size) {
    return { success: true, summary: emptySummary(), products: [], recent_clicks: [], limit, generated_at: new Date().toISOString(), source: 'products-lite' };
  }

  const productColumn = columns.has('product_url')
    ? 'product_url'
    : columns.has('product_id')
      ? 'product_id'
      : '';

  if (!productColumn) {
    if (!columns.has('event_type')) {
      return { success: true, summary: emptySummary(), products: [], recent_clicks: [], limit, generated_at: new Date().toISOString(), source: 'products-lite' };
    }

    const summaryResult = await deps.client.query(`
      SELECT
        COUNT(*)::int AS total_product_clicks,
        0::int AS unique_products_clicked,
        ${recentCount(columns, "now() - interval '24 hours'", 'product_clicks_last_24h')},
        ${recentCount(columns, "now() - interval '7 days'", 'product_clicks_last_7d')}
      FROM ${deps.qname('radio_events')}
      WHERE event_type = 'product_click'
    `);

    return {
      success: true,
      summary: summaryResult.rows[0] || emptySummary(),
      products: [],
      recent_clicks: [],
      limit,
      message: 'Product click events exist, but public-safe product detail is not stored yet.',
      generated_at: new Date().toISOString(),
      source: 'products-lite'
    };
  }

  const productFilter = columns.has('event_type')
    ? `(event_type = 'product_click' OR NULLIF(${productColumn}::text, '') IS NOT NULL)`
    : `NULLIF(${productColumn}::text, '') IS NOT NULL`;
  const uniqueSessions = columns.has('session_id')
    ? 'COUNT(DISTINCT session_id)::int'
    : '0::int';
  const lastClicked = columns.has('created_at')
    ? 'MAX(created_at)'
    : 'NULL::timestamptz';
  const clicks24 = columns.has('created_at')
    ? `COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int`
    : '0::int';
  const clicks7d = columns.has('created_at')
    ? `COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int`
    : '0::int';

  const groupedResult = await deps.client.query(`
    WITH product_groups AS (
      SELECT
        ${productColumn}::text AS product_url,
        COUNT(*)::int AS click_count,
        ${uniqueSessions} AS unique_sessions,
        ${lastClicked} AS last_clicked_at,
        ${clicks24} AS clicks_24h,
        ${clicks7d} AS clicks_7d
      FROM ${deps.qname('radio_events')}
      WHERE ${productFilter}
        AND NULLIF(${productColumn}::text, '') IS NOT NULL
      GROUP BY 1
    )
    SELECT
      product_url,
      click_count,
      click_count AS product_clicks,
      unique_sessions,
      last_clicked_at,
      ARRAY[]::text[] AS song_titles,
      SUM(click_count) OVER () AS total_product_clicks,
      (COUNT(*) OVER ())::int AS unique_products_clicked,
      SUM(clicks_24h) OVER () AS product_clicks_last_24h,
      SUM(clicks_7d) OVER () AS product_clicks_last_7d
    FROM product_groups
    ORDER BY click_count DESC, last_clicked_at DESC NULLS LAST
    LIMIT $1
  `, [limit]);

  let recentRows = [];
  if (columns.has('created_at')) {
    const songKey = columns.has('song_key') ? 'song_key' : `''::text AS song_key`;
    const songId = columns.has('song_id') ? 'song_id' : `NULL::text AS song_id`;
    const device = columns.has('device_type') ? 'device_type' : `''::text AS device_type`;
    const eventType = columns.has('event_type') ? 'event_type' : `''::text AS event_type`;
    const recentResult = await deps.client.query(`
      SELECT
        created_at,
        ${songKey},
        ${songId},
        ${productColumn}::text AS product_url,
        ${device},
        ${eventType},
        ''::text AS song_title,
        ''::text AS artist
      FROM ${deps.qname('radio_events')}
      WHERE ${productFilter}
        AND NULLIF(${productColumn}::text, '') IS NOT NULL
      ORDER BY created_at DESC NULLS LAST
      LIMIT $1
    `, [limit]);
    recentRows = recentResult.rows;
  }

  const first = groupedResult.rows[0] || {};
  const summary = groupedResult.rowCount
    ? {
        total_product_clicks: Number(first.total_product_clicks || 0),
        unique_products_clicked: Number(first.unique_products_clicked || 0),
        product_clicks_last_24h: Number(first.product_clicks_last_24h || 0),
        product_clicks_last_7d: Number(first.product_clicks_last_7d || 0)
      }
    : emptySummary();

  const products = groupedResult.rows.map(row => ({
    product_url: row.product_url,
    click_count: Number(row.click_count || 0),
    product_clicks: Number(row.product_clicks || 0),
    unique_sessions: Number(row.unique_sessions || 0),
    last_clicked_at: row.last_clicked_at,
    song_titles: Array.isArray(row.song_titles) ? row.song_titles : []
  }));

  return {
    success: true,
    summary,
    products,
    recent_clicks: recentRows,
    limit,
    generated_at: new Date().toISOString(),
    source: 'products-lite'
  };
}

export async function handleAdminProductStatsLiteRequest(event, deps) {
  if (deps.getMethod(event).toUpperCase() !== 'GET') {
    return deps.response(405, { success: false, error: 'Method not allowed.' });
  }
  if (deps.schema !== 'radio_dev') {
    return deps.response(404, { success: false, error: 'Not found.' });
  }

  await deps.requireAdmin(event);
  const limit = parseLimit(event);
  const key = String(limit);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return deps.response(200, { ...cached.payload, cache: 'warm' });
  }

  let payload;
  try {
    payload = await buildPayload(event, deps);
  } catch (error) {
    if (error?.code !== '42P01') throw error;
    payload = { success: true, summary: emptySummary(), products: [], recent_clicks: [], limit, generated_at: new Date().toISOString(), source: 'products-lite' };
  }

  cache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
  return deps.response(200, { ...payload, cache: 'fresh' });
}
