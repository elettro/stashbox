from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Expected marker missing in {path}: {old[:100]!r}")
    file_path.write_text(text.replace(old, new, 1))


index = "social-factory-api/index.mjs"
replace_once(
    index,
    "import { createRequestAuthenticator } from './request-auth.mjs';\n",
    "import { createRequestAuthenticator } from './request-auth.mjs';\n"
    "import { createTopSongAnalyticsService } from './top-song-analytics.mjs';\n",
)
replace_once(index, "const SERVICE_VERSION = '0.7.0';", "const SERVICE_VERSION = '0.8.0';")
replace_once(
    index,
    "  batchScheduler = null,\n  requestAuthenticator = process.env.SOCIAL_CUSTOM_GPT_SECRET ? createRequestAuthenticator() : null\n",
    "  batchScheduler = null,\n  topSongAnalytics = null,\n  requestAuthenticator = process.env.SOCIAL_CUSTOM_GPT_SECRET ? createRequestAuthenticator() : null\n",
)
replace_once(
    index,
    "  let resolvedBatchScheduler = batchScheduler;\n",
    "  let resolvedBatchScheduler = batchScheduler;\n  let resolvedTopSongAnalytics = topSongAnalytics;\n",
)
replace_once(
    index,
    "  function getBatchScheduler() {\n    if (!resolvedBatchScheduler) {\n      resolvedBatchScheduler = createBatchScheduleService({ scheduler: getReviewScheduler() });\n    }\n    return resolvedBatchScheduler;\n  }\n\n  return async function socialFactoryHandler(event = {}) {",
    "  function getBatchScheduler() {\n    if (!resolvedBatchScheduler) {\n      resolvedBatchScheduler = createBatchScheduleService({ scheduler: getReviewScheduler() });\n    }\n    return resolvedBatchScheduler;\n  }\n\n  function getTopSongAnalytics() {\n    if (!resolvedTopSongAnalytics) resolvedTopSongAnalytics = createTopSongAnalyticsService();\n    return resolvedTopSongAnalytics;\n  }\n\n  return async function socialFactoryHandler(event = {}) {",
)
replace_once(
    index,
    "            radioApiBridgeSupported: true,\n            batchCampaignPlanningSupported: true,",
    "            radioApiBridgeSupported: true,\n            topSongAnalyticsSupported: true,\n            batchCampaignPlanningSupported: true,",
)
replace_once(
    index,
    "      if (method === 'GET' && path === '/social/orchestration/candidates') {",
    "      if (method === 'GET' && path === '/social/analytics/top-songs') {\n"
    "        return json(200, { ok: true, ...(await getTopSongAnalytics().topSongs(event)) });\n"
    "      }\n\n"
    "      if (method === 'GET' && path === '/social/orchestration/candidates') {",
)

auth = "social-factory-api/request-auth.mjs"
replace_once(
    auth,
    "  if (method === 'GET' && path === '/social/orchestration/candidates') return 'songs:read';",
    "  if (method === 'GET' && path === '/social/analytics/top-songs') return 'songs:read';\n"
    "  if (method === 'GET' && path === '/social/orchestration/candidates') return 'songs:read';",
)

schema_path = Path("custom-gpt/stashbox-radio/openapi.yaml")
schema = schema_path.read_text()
schema = schema.replace("  version: 0.8.1", "  version: 0.9.0", 1)
analytics_path = """  /social/analytics/top-songs:
    get:
      operationId: getTopSongAnalytics
      summary: Rank Stashbox songs by an all-time engagement metric using live Radio dashboard totals.
      description: Read-only song analytics. This operation never creates drafts, renders, schedules, uploads, or publications.
      parameters:
        - name: metric
          in: query
          required: true
          schema:
            type: string
            enum: [plays, full_plays, likes, shares, share_visits, video_clicks, product_clicks, listening_seconds]
        - name: limit
          in: query
          required: false
          schema:
            type: integer
            minimum: 1
            maximum: 25
            default: 5
        - name: period
          in: query
          required: false
          schema:
            type: string
            enum: [all_time]
            default: all_time
        - name: artist
          in: query
          required: false
          schema:
            type: string
        - name: genre
          in: query
          required: false
          schema:
            type: string
      responses:
        '200':
          description: Ranked songs with exact metric totals.
          content:
            application/json:
              schema:
                type: object
                additionalProperties: true
"""
if "/social/analytics/top-songs:" not in schema:
    marker = "  /social/orchestration/candidates:\n"
    if marker not in schema:
        raise SystemExit("OpenAPI insertion marker missing")
    schema = schema.replace(marker, analytics_path + marker, 1)
schema_path.write_text(schema)

print("Top-song analytics wiring complete")
