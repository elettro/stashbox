import crypto from 'node:crypto';
import {
  VIDEO_FACTORY_DEFAULTS,
  buildInitialRenderRecipe,
  buildOutputFilename,
  getDimensionsForAspectRatio,
  normalizeDuration
} from './recipe.mjs';

export const VIDEO_FACTORY_STATUSES = Object.freeze([
  'draft',
  'pending',
  'preparing',
  'rendering',
  'uploading',
  'completed',
  'failed',
  'cancelled',
  'archived'
]);

const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);
const VALID_ASPECT_RATIOS = new Set(['16:9', '9:16', '3:4', '1:1']);

function requireDependency(name, value) {
  if (!value) throw new Error(`Video Factory dependency ${name} is required.`);
  return value;
}

function methodFor(event) {
  return String(event?.requestContext?.http?.method || event?.httpMethod || '').toUpperCase();
}

export function getVideoFactoryRouteMatch(segments = []) {
  const normalized = Array.isArray(segments) ? segments.filter(Boolean) : [];
  const isRoute = normalized[0] === 'admin' && normalized[1] === 'video-factory';
  if (!isRoute) return { isRoute: false, resource: '', jobId: '', action: '' };

  return {
    isRoute: true,
    resource: normalized[2] || '',
    jobId: normalized[3] || '',
    action: normalized[4] || ''
  };
}

export async function ensureVideoFactoryStorage({ client, qname }) {
  requireDependency('client', client);
  requireDependency('qname', qname);

  await client.query(`
    CREATE TABLE IF NOT EXISTS ${qname('video_render_batches')} (
      id text PRIMARY KEY,
      batch_name text NOT NULL,
      client_name text,
      project_name text,
      campaign_name text,
      song_key text NOT NULL,
      song_title text,
      artist text,
      album_name text,
      status text NOT NULL DEFAULT 'draft',
      request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ${qname('video_render_jobs')} (
      id text PRIMARY KEY,
      batch_id text NOT NULL REFERENCES ${qname('video_render_batches')}(id) ON DELETE CASCADE,
      song_key text NOT NULL,
      output_type text NOT NULL DEFAULT 'music_video',
      duration_mode text NOT NULL DEFAULT 'full',
      duration_seconds numeric,
      aspect_ratio text NOT NULL DEFAULT '16:9',
      width integer NOT NULL DEFAULT 1920,
      height integer NOT NULL DEFAULT 1080,
      fps integer NOT NULL DEFAULT 30,
      variation integer NOT NULL DEFAULT 1,
      status text NOT NULL DEFAULT 'draft',
      filename_template text NOT NULL,
      output_filename text NOT NULL,
      render_recipe jsonb NOT NULL DEFAULT '{}'::jsonb,
      overlay_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      metadata_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      output_url text,
      thumbnail_url text,
      error_message text,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS ${qname('video_render_outputs')} (
      id text PRIMARY KEY,
      job_id text NOT NULL REFERENCES ${qname('video_render_jobs')}(id) ON DELETE CASCADE,
      output_kind text NOT NULL DEFAULT 'master',
      s3_bucket text,
      s3_key text,
      output_url text,
      thumbnail_url text,
      mime_type text NOT NULL DEFAULT 'video/mp4',
      file_size_bytes bigint,
      duration_seconds numeric,
      width integer,
      height integer,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS video_render_batches_created_at_idx
      ON ${qname('video_render_batches')} (created_at DESC);
    CREATE INDEX IF NOT EXISTS video_render_jobs_batch_id_idx
      ON ${qname('video_render_jobs')} (batch_id);
    CREATE INDEX IF NOT EXISTS video_render_jobs_status_idx
      ON ${qname('video_render_jobs')} (status, created_at DESC);
    CREATE INDEX IF NOT EXISTS video_render_jobs_song_key_idx
      ON ${qname('video_render_jobs')} (song_key, created_at DESC);
    CREATE INDEX IF NOT EXISTS video_render_outputs_job_id_idx
      ON ${qname('video_render_outputs')} (job_id);
  `);
}

function normalizeCreateInput(input = {}) {
  const songKey = String(input.song_key || input.songKey || '').trim();
  if (!songKey) return { error: 'song_key is required.' };

  const aspectRatio = String(input.aspect_ratio || input.aspectRatio || VIDEO_FACTORY_DEFAULTS.aspect_ratio).trim();
  if (!VALID_ASPECT_RATIOS.has(aspectRatio)) return { error: 'aspect_ratio must be one of: 16:9, 9:16, 3:4, 1:1.' };

  let duration;
  let dimensions;
  try {
    duration = normalizeDuration(input);
    dimensions = getDimensionsForAspectRatio(aspectRatio, input);
  } catch (error) {
    return { error: error.message };
  }

  const fps = Number(input.fps || VIDEO_FACTORY_DEFAULTS.fps);
  if (!Number.isInteger(fps) || fps < 24 || fps > 60) return { error: 'fps must be a whole number between 24 and 60.' };

  return {
    payload: {
      song_key: songKey,
      batch_name: String(input.batch_name || input.batchName || '').trim(),
      client_name: String(input.client_name || input.clientName || '').trim(),
      project_name: String(input.project_name || input.projectName || '').trim(),
      campaign_name: String(input.campaign_name || input.campaignName || '').trim(),
      aspect_ratio: aspectRatio,
      width: dimensions.width,
      height: dimensions.height,
      fps,
      ...duration,
      output_type: String(input.output_type || input.outputType || VIDEO_FACTORY_DEFAULTS.output_type).trim(),
      filename_template: String(input.filename_template || input.filenameTemplate || VIDEO_FACTORY_DEFAULTS.filename_template).trim(),
      variation: 1,
      intro_enabled: input.intro_enabled ?? input.introEnabled ?? true,
      outro_enabled: input.outro_enabled ?? input.outroEnabled ?? true,
      corner_bug_enabled: input.corner_bug_enabled ?? input.cornerBugEnabled ?? true,
      include_artist: input.include_artist ?? input.includeArtist ?? true,
      include_song: input.include_song ?? input.includeSong ?? true,
      include_album: input.include_album ?? input.includeAlbum ?? true,
      metadata_comment: String(input.metadata_comment || input.metadataComment || '').trim()
    }
  };
}

async function loadSong(client, qname, songKey) {
  const result = await client.query(
    `SELECT song_key, song_name, display_title, artist, album_name, audio_url, song_artwork_url
     FROM ${qname('songs')}
     WHERE song_key = $1
     LIMIT 1`,
    [songKey]
  );
  return result.rows[0] || null;
}

function buildJobResponse(row) {
  return {
    id: row.id,
    batch_id: row.batch_id,
    batch_name: row.batch_name || '',
    client_name: row.client_name || '',
    project_name: row.project_name || '',
    campaign_name: row.campaign_name || '',
    song_key: row.song_key,
    song_title: row.song_title || '',
    artist: row.artist || '',
    album_name: row.album_name || '',
    output_type: row.output_type,
    duration_mode: row.duration_mode,
    duration_seconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    aspect_ratio: row.aspect_ratio,
    width: row.width,
    height: row.height,
    fps: row.fps,
    variation: row.variation,
    status: row.status,
    filename_template: row.filename_template,
    output_filename: row.output_filename,
    render_recipe: row.render_recipe || {},
    overlay_settings: row.overlay_settings || {},
    metadata_settings: row.metadata_settings || {},
    output_url: row.output_url || '',
    thumbnail_url: row.thumbnail_url || '',
    error_message: row.error_message || '',
    started_at: row.started_at || '',
    completed_at: row.completed_at || '',
    created_at: row.created_at || '',
    updated_at: row.updated_at || ''
  };
}

export async function createVideoFactoryDraft(input, { client, qname }) {
  const normalized = normalizeCreateInput(input);
  if (normalized.error) return { statusCode: 400, body: { success: false, error: normalized.error } };

  const payload = normalized.payload;
  const song = await loadSong(client, qname, payload.song_key);
  if (!song) return { statusCode: 404, body: { success: false, error: 'Song not found.' } };
  if (!String(song.audio_url || '').trim()) {
    return { statusCode: 400, body: { success: false, error: 'The selected song does not have an audio_url.' } };
  }

  const batchId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const songTitle = String(song.display_title || song.song_name || song.song_key).trim();
  const batchName = payload.batch_name || `${songTitle} Video Factory`;
  const recipe = buildInitialRenderRecipe({
    ...payload,
    song_title: songTitle,
    artist: song.artist,
    album_name: song.album_name,
    audio_url: song.audio_url,
    seed: crypto.randomUUID()
  });
  const outputFilename = buildOutputFilename(payload.filename_template, {
    ...recipe,
    job_id: jobId,
    batch_id: batchId
  });

  const overlaySettings = recipe.overlays;
  const metadataSettings = recipe.metadata;

  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO ${qname('video_render_batches')} (
        id, batch_name, client_name, project_name, campaign_name,
        song_key, song_title, artist, album_name, status, request_payload
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10::jsonb)`,
      [
        batchId,
        batchName,
        payload.client_name || null,
        payload.project_name || null,
        payload.campaign_name || null,
        song.song_key,
        songTitle,
        song.artist || null,
        song.album_name || null,
        JSON.stringify(input || {})
      ]
    );

    const jobResult = await client.query(
      `INSERT INTO ${qname('video_render_jobs')} (
        id, batch_id, song_key, output_type, duration_mode, duration_seconds,
        aspect_ratio, width, height, fps, variation, status,
        filename_template, output_filename, render_recipe, overlay_settings, metadata_settings
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,$13,$14::jsonb,$15::jsonb,$16::jsonb)
      RETURNING *`,
      [
        jobId,
        batchId,
        song.song_key,
        payload.output_type,
        payload.duration_mode,
        payload.duration_seconds,
        payload.aspect_ratio,
        payload.width,
        payload.height,
        payload.fps,
        payload.variation,
        payload.filename_template,
        outputFilename,
        JSON.stringify(recipe),
        JSON.stringify(overlaySettings),
        JSON.stringify(metadataSettings)
      ]
    );
    await client.query('COMMIT');

    return {
      statusCode: 201,
      body: {
        success: true,
        message: 'Video Factory render draft created.',
        job: buildJobResponse({
          ...jobResult.rows[0],
          batch_name: batchName,
          client_name: payload.client_name,
          project_name: payload.project_name,
          campaign_name: payload.campaign_name,
          song_title: songTitle,
          artist: song.artist,
          album_name: song.album_name
        })
      }
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function listVideoFactoryJobs({ client, qname, limit = 100 }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
  const result = await client.query(
    `SELECT
       j.*,
       b.batch_name,
       b.client_name,
       b.project_name,
       b.campaign_name,
       b.song_title,
       b.artist,
       b.album_name
     FROM ${qname('video_render_jobs')} j
     JOIN ${qname('video_render_batches')} b ON b.id = j.batch_id
     ORDER BY j.created_at DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map(buildJobResponse);
}

export async function getVideoFactoryJob(jobId, { client, qname }) {
  const result = await client.query(
    `SELECT
       j.*,
       b.batch_name,
       b.client_name,
       b.project_name,
       b.campaign_name,
       b.song_title,
       b.artist,
       b.album_name
     FROM ${qname('video_render_jobs')} j
     JOIN ${qname('video_render_batches')} b ON b.id = j.batch_id
     WHERE j.id = $1
     LIMIT 1`,
    [jobId]
  );
  if (!result.rowCount) return null;

  const outputResult = await client.query(
    `SELECT * FROM ${qname('video_render_outputs')} WHERE job_id = $1 ORDER BY created_at DESC`,
    [jobId]
  );
  return { ...buildJobResponse(result.rows[0]), outputs: outputResult.rows };
}

export async function getVideoFactorySummary({ client, qname }) {
  const result = await client.query(
    `SELECT
       COUNT(*)::int AS total_jobs,
       COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_jobs,
       COUNT(*) FILTER (WHERE status = ANY($1::text[]))::int AS active_jobs,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_jobs,
       COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_jobs,
       MAX(created_at) AS latest_job_at
     FROM ${qname('video_render_jobs')}`,
    [Array.from(ACTIVE_STATUSES)]
  );
  return result.rows[0] || {};
}

export async function handleAdminVideoFactoryRoute(event, dependencies = {}) {
  const client = requireDependency('client', dependencies.client);
  const qname = requireDependency('qname', dependencies.qname);
  const response = requireDependency('response', dependencies.response);
  const parseBody = requireDependency('parseBody', dependencies.parseBody);
  const getRouteSegments = requireDependency('getRouteSegments', dependencies.getRouteSegments);
  const requireAdmin = requireDependency('requireAdmin', dependencies.requireAdmin);

  if (methodFor(event) === 'OPTIONS') return response(204, {});
  await requireAdmin(event);
  await ensureVideoFactoryStorage({ client, qname });

  const method = methodFor(event);
  const routeMatch = getVideoFactoryRouteMatch(getRouteSegments(event));
  if (!routeMatch.isRoute) return response(404, { success: false, error: 'Not found.' });

  if (routeMatch.resource === 'summary' && method === 'GET') {
    const summary = await getVideoFactorySummary({ client, qname });
    return response(200, { success: true, summary });
  }

  if (routeMatch.resource !== 'jobs') return response(404, { success: false, error: 'Not found.' });

  if (!routeMatch.jobId && method === 'GET') {
    const jobs = await listVideoFactoryJobs({
      client,
      qname,
      limit: event?.queryStringParameters?.limit
    });
    return response(200, { success: true, count: jobs.length, jobs });
  }

  if (!routeMatch.jobId && method === 'POST') {
    const created = await createVideoFactoryDraft(parseBody(event), { client, qname });
    return response(created.statusCode, created.body);
  }

  if (routeMatch.jobId && !routeMatch.action && method === 'GET') {
    const job = await getVideoFactoryJob(routeMatch.jobId, { client, qname });
    return job
      ? response(200, { success: true, job })
      : response(404, { success: false, error: 'Video Factory job not found.' });
  }

  return response(404, { success: false, error: 'Not found.' });
}
