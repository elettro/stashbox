import crypto from 'node:crypto';
import { createAwsSecretStore } from './youtube-oauth.mjs';

const DEFAULT_RADIO_API_BASE = 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev';
const EXPECTED_RADIO_API_HOST = 'd21fbe6u80.execute-api.us-east-1.amazonaws.com';
const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16', '3:4', '4:5', '1:1']);
const ALLOWED_DURATION_MODES = new Set(['full', 'promo', 'custom']);
const ACTIVE_RENDER_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);

function serviceError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function getHeader(event, name) {
  const target = String(name).toLowerCase();
  for (const [key, value] of Object.entries(event?.headers || {})) {
    if (String(key).toLowerCase() === target) return String(value || '');
  }
  return '';
}

function timingSafeEqualText(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function assertAdmin(event, config) {
  const supplied = getHeader(event, 'x-admin-token');
  if (!supplied || !timingSafeEqualText(supplied, config.admin_token)) {
    throw serviceError('unauthorized', 401);
  }
}

function parseBody(event = {}) {
  if (!event.body) return {};
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : String(event.body);
  try {
    return JSON.parse(text);
  } catch {
    throw serviceError('invalid_json_body', 400);
  }
}

function validateBridgeConfig(config = {}) {
  const baseUrl = String(config.radio_api_base_url || DEFAULT_RADIO_API_BASE).trim().replace(/\/$/, '');
  const adminToken = String(config.radio_api_admin_token || '').trim();
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw serviceError('radio_api_bridge_invalid_base_url', 500);
  }

  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== EXPECTED_RADIO_API_HOST ||
    parsed.pathname.replace(/\/$/, '') !== '/dev' ||
    parsed.search ||
    parsed.hash
  ) {
    throw serviceError('radio_api_bridge_invalid_base_url', 500);
  }

  if (!adminToken || adminToken === 'REPLACE_RADIO_DEV_ADMIN_TOKEN') {
    throw serviceError('radio_api_bridge_not_configured', 409, {
      required_config_field: 'radio_api_admin_token'
    });
  }

  return { baseUrl, adminToken };
}

function normalizeSongList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.songs)) return payload.songs;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function textPresent(value) {
  return Boolean(String(value || '').trim());
}

function scoreSong(song = {}) {
  const songKey = String(song.song_key || song.songKey || '').trim();
  const title = String(song.display_title || song.song_name || song.title || songKey).trim();
  const artist = String(song.artist || '').trim();
  const visibility = String(song.public_visibility || song.visibility || 'visible').trim().toLowerCase();
  const hasAudio = textPresent(song.audio_url || song.audioUrl);
  const hasArtwork = textPresent(song.song_artwork_url || song.artwork_url || song.artworkUrl);
  const hasVisualHints = Boolean(
    song.enhanced_visuals_enabled ||
    (Array.isArray(song.visual_assets) && song.visual_assets.length) ||
    Number(song.visual_asset_count || song.visual_count || 0) > 0
  );

  let score = 0;
  const reasons = [];
  if (hasAudio) {
    score += 50;
    reasons.push('audio_ready');
  }
  if (hasArtwork) {
    score += 15;
    reasons.push('artwork_ready');
  }
  if (hasVisualHints) {
    score += 15;
    reasons.push('visuals_indicated');
  }
  if (artist) score += 8;
  if (title) score += 7;
  if (Boolean(song.featured)) {
    score += 5;
    reasons.push('featured');
  }
  if (visibility === 'visible' || visibility === 'public') score += 5;
  if (visibility === 'hidden' || visibility === 'archived') score -= 30;

  const eligible = Boolean(songKey && title && hasAudio && visibility !== 'archived');
  if (!eligible) {
    if (!songKey) reasons.push('missing_song_key');
    if (!title) reasons.push('missing_title');
    if (!hasAudio) reasons.push('missing_audio');
    if (visibility === 'archived') reasons.push('archived');
  }

  return {
    song_key: songKey,
    title,
    artist,
    album_name: String(song.album_name || '').trim(),
    genre: String(song.genre || '').trim(),
    public_visibility: visibility,
    featured: Boolean(song.featured),
    audio_ready: hasAudio,
    artwork_ready: hasArtwork,
    visual_readiness: hasVisualHints ? 'indicated' : 'needs_vec_check',
    eligible,
    candidate_score: score,
    reasons
  };
}

function safeLimit(value, fallback = 20, maximum = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(Math.floor(numeric), maximum));
}

function normalizeJob(payload = {}) {
  const job = payload?.job || payload?.data?.job || payload?.data || payload;
  if (!job || typeof job !== 'object') return {};
  const status = String(job.status || '').toLowerCase();
  return {
    ...job,
    status,
    active: ACTIVE_RENDER_STATUSES.has(status),
    ready_for_staging: status === 'completed' && Boolean(job.output_url || job.outputs?.length)
  };
}

export function createVideoOrchestratorService({
  secretStore = createAwsSecretStore(),
  fetchImpl = globalThis.fetch,
  configSecretId = process.env.YOUTUBE_OAUTH_CONFIG_SECRET
} = {}) {
  if (!fetchImpl) throw new Error('fetch_unavailable');
  if (!configSecretId) throw new Error('youtube_oauth_config_secret_missing');

  async function loadConfig() {
    return secretStore.read(configSecretId);
  }

  async function authorize(event) {
    const config = await loadConfig();
    assertAdmin(event, config);
    return config;
  }

  async function radioRequest(config, pathname, { method = 'GET', body } = {}) {
    const bridge = validateBridgeConfig(config);
    if (!String(pathname).startsWith('/admin/')) {
      throw serviceError('radio_api_bridge_path_not_allowed', 500);
    }

    const response = await fetchImpl(`${bridge.baseUrl}${pathname}`, {
      method,
      headers: {
        'x-admin-token': bridge.adminToken,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw serviceError('radio_api_request_failed', 502, {
        downstream_status: response.status,
        downstream_path: pathname,
        downstream_error: String(payload?.error || payload?.message || 'unknown_error').slice(0, 240)
      });
    }
    return payload;
  }

  return {
    async candidates(event) {
      const config = await authorize(event);
      const payload = await radioRequest(config, '/admin/songs');
      const limit = safeLimit(event?.queryStringParameters?.limit, 20, 100);
      const candidates = normalizeSongList(payload)
        .map(scoreSong)
        .sort((left, right) => right.candidate_score - left.candidate_score || left.title.localeCompare(right.title));
      const eligible = candidates.filter((song) => song.eligible).slice(0, limit);

      return {
        mode: 'proposal_only',
        approval_required_before_render: true,
        evaluated_count: candidates.length,
        eligible_count: candidates.filter((song) => song.eligible).length,
        candidates: eligible
      };
    },

    async listJobs(event) {
      const config = await authorize(event);
      const limit = safeLimit(event?.queryStringParameters?.limit, 50, 250);
      const payload = await radioRequest(config, `/admin/video-factory/jobs?limit=${limit}`);
      const jobs = Array.isArray(payload?.jobs) ? payload.jobs.map(normalizeJob) : [];
      return { count: jobs.length, jobs };
    },

    async createDraft(event) {
      const config = await authorize(event);
      const input = parseBody(event);
      const songKey = String(input.song_key || '').trim();
      if (!songKey) throw serviceError('song_key_required', 422);

      const aspectRatio = String(input.aspect_ratio || '9:16').trim();
      if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) {
        throw serviceError('invalid_aspect_ratio', 422, { allowed: [...ALLOWED_ASPECT_RATIOS] });
      }

      const durationMode = String(input.duration_mode || 'promo').trim().toLowerCase();
      if (!ALLOWED_DURATION_MODES.has(durationMode)) {
        throw serviceError('invalid_duration_mode', 422, { allowed: [...ALLOWED_DURATION_MODES] });
      }
      const durationSeconds = durationMode === 'full' ? null : Number(input.duration_seconds ?? 30);
      if (durationMode !== 'full' && (!Number.isFinite(durationSeconds) || durationSeconds <= 0 || durationSeconds > 600)) {
        throw serviceError('invalid_duration_seconds', 422, { minimum: 1, maximum: 600 });
      }

      const draftPayload = {
        song_key: songKey,
        batch_name: String(input.batch_name || `Social Factory ${songKey}`).trim(),
        client_name: String(input.client_name || 'Stashbox').trim(),
        project_name: String(input.project_name || 'Social Factory').trim(),
        campaign_name: String(input.campaign_name || 'Social Content').trim(),
        duration_mode: durationMode,
        ...(durationMode === 'full' ? {} : { duration_seconds: durationSeconds }),
        aspect_ratio: aspectRatio,
        fps: Number(input.fps || 30),
        intro_enabled: input.intro_enabled ?? true,
        outro_enabled: input.outro_enabled ?? true,
        corner_bug_enabled: input.corner_bug_enabled ?? true,
        include_artist: input.include_artist ?? true,
        include_song: input.include_song ?? true,
        include_album: input.include_album ?? true,
        filename_template: String(
          input.filename_template || '{artist}_{song}_{duration}_{aspect}_v{variation}'
        ).trim(),
        metadata_comment: String(
          input.metadata_comment || 'Prepared by Stashbox Social Factory'
        ).trim()
      };

      const payload = await radioRequest(config, '/admin/video-factory/jobs', {
        method: 'POST',
        body: draftPayload
      });

      return {
        created: true,
        approval_required_before_launch: true,
        job: normalizeJob(payload?.job || payload),
        requested_recipe: draftPayload
      };
    },

    async getJob(event, jobId) {
      const config = await authorize(event);
      const safeJobId = String(jobId || '').trim();
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(safeJobId)) throw serviceError('invalid_render_job_id', 422);
      const payload = await radioRequest(config, `/admin/video-factory/jobs/${encodeURIComponent(safeJobId)}`);
      return { job: normalizeJob(payload?.job || payload) };
    },

    async launch(event, jobId) {
      const config = await authorize(event);
      const safeJobId = String(jobId || '').trim();
      if (!/^[a-zA-Z0-9-]{8,80}$/.test(safeJobId)) throw serviceError('invalid_render_job_id', 422);
      const input = parseBody(event);
      if (input.confirm_render !== true) {
        return {
          launched: false,
          mode: 'validation_only',
          approval_required: true,
          job_id: safeJobId
        };
      }
      const payload = await radioRequest(
        config,
        `/admin/video-factory/jobs/${encodeURIComponent(safeJobId)}/render`,
        { method: 'POST', body: {} }
      );
      return { launched: true, job: normalizeJob(payload?.job || payload), downstream: payload };
    }
  };
}
