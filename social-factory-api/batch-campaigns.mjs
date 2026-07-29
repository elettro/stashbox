import crypto from 'node:crypto';
import { createVideoOrchestratorService } from './video-orchestrator.mjs';

const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16']);
const ALLOWED_DURATION_MODES = new Set(['full', 'promo', 'custom']);
const NON_REUSABLE_STATUSES = new Set(['failed', 'cancelled', 'archived']);

function serviceError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
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

function boundedInteger(value, fallback, minimum, maximum, label) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) throw serviceError(`invalid_${label}`, 422);
  const integer = Math.floor(numeric);
  if (integer < minimum || integer > maximum) {
    throw serviceError(`invalid_${label}`, 422, { minimum, maximum });
  }
  return integer;
}

function cleanText(value, fallback = '', maximum = 120) {
  const text = String(value ?? fallback).trim().replace(/\s+/g, ' ');
  return text.slice(0, maximum);
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeSettings(input = {}) {
  const songCount = boundedInteger(input.song_count, 3, 1, 10, 'song_count');
  const variationsPerSong = boundedInteger(input.variations_per_song, 1, 1, 3, 'variations_per_song');
  if (songCount * variationsPerSong > 20) {
    throw serviceError('batch_job_limit_exceeded', 422, { maximum_jobs: 20 });
  }

  const aspectRatio = cleanText(input.aspect_ratio, '9:16', 8);
  if (!ALLOWED_ASPECT_RATIOS.has(aspectRatio)) {
    throw serviceError('youtube_aspect_ratio_not_supported', 422, {
      aspect_ratio: aspectRatio,
      allowed: [...ALLOWED_ASPECT_RATIOS]
    });
  }

  const durationMode = lower(input.duration_mode || 'promo');
  if (!ALLOWED_DURATION_MODES.has(durationMode)) {
    throw serviceError('invalid_duration_mode', 422, { allowed: [...ALLOWED_DURATION_MODES] });
  }

  const durationSeconds = durationMode === 'full'
    ? null
    : boundedInteger(input.duration_seconds, 30, 1, 600, 'duration_seconds');

  const campaignName = cleanText(input.campaign_name, 'Social Factory Test Batch', 100);
  if (!campaignName) throw serviceError('campaign_name_required', 422);

  const selectedSongKeys = [...new Set(stringList(input.selected_song_keys))].slice(0, 10);

  return {
    campaign_name: campaignName,
    song_count: selectedSongKeys.length || songCount,
    variations_per_song: variationsPerSong,
    aspect_ratio: aspectRatio,
    duration_mode: durationMode,
    duration_seconds: durationSeconds,
    fps: boundedInteger(input.fps, 30, 24, 60, 'fps'),
    genre: cleanText(input.genre, '', 80),
    artist: cleanText(input.artist, '', 120),
    require_visuals: input.require_visuals !== false,
    selected_song_keys: selectedSongKeys,
    intro_enabled: input.intro_enabled === true,
    outro_enabled: input.outro_enabled !== false,
    corner_bug_enabled: input.corner_bug_enabled !== false,
    include_artist: input.include_artist === true,
    include_song: input.include_song === true,
    include_album: input.include_album === true
  };
}

function selectSongs(candidates, settings) {
  const visible = candidates.filter((song) => {
    const visibility = lower(song.public_visibility);
    if (visibility !== 'visible' && visibility !== 'public') return false;
    if (settings.require_visuals && song.visual_readiness !== 'indicated') return false;
    if (settings.genre && lower(song.genre) !== lower(settings.genre)) return false;
    if (settings.artist && lower(song.artist) !== lower(settings.artist)) return false;
    return song.eligible !== false;
  });

  if (settings.selected_song_keys.length) {
    const byKey = new Map(visible.map((song) => [String(song.song_key), song]));
    const selected = settings.selected_song_keys.map((key) => byKey.get(key)).filter(Boolean);
    const missing = settings.selected_song_keys.filter((key) => !byKey.has(key));
    if (missing.length) {
      throw serviceError('selected_songs_not_eligible', 422, { song_keys: missing });
    }
    return selected;
  }

  return visible.slice(0, settings.song_count);
}

function recipeFor(song, settings, variationIndex) {
  const variation = String(variationIndex).padStart(2, '0');
  const title = cleanText(song.title || song.song_key, song.song_key, 100);
  return {
    song_key: String(song.song_key),
    batch_name: `${settings.campaign_name} - ${title} - v${variation}`.slice(0, 180),
    client_name: 'Stashbox',
    project_name: 'Social Factory',
    campaign_name: settings.campaign_name,
    duration_mode: settings.duration_mode,
    ...(settings.duration_mode === 'full' ? {} : { duration_seconds: settings.duration_seconds }),
    aspect_ratio: settings.aspect_ratio,
    fps: settings.fps,
    intro_enabled: settings.intro_enabled,
    outro_enabled: settings.outro_enabled,
    corner_bug_enabled: settings.corner_bug_enabled,
    include_artist: settings.include_artist,
    include_song: settings.include_song,
    include_album: settings.include_album,
    filename_template: '{artist}_{song}_{duration}_{aspect}_v{variation}',
    metadata_comment: `Prepared by Stashbox Social Factory batch plan for ${settings.campaign_name}`
  };
}

function createProposal(candidates, settings) {
  const selectedSongs = selectSongs(candidates, settings);
  if (!selectedSongs.length) {
    throw serviceError('no_matching_batch_candidates', 409, {
      genre: settings.genre,
      artist: settings.artist,
      require_visuals: settings.require_visuals
    });
  }

  const jobs = [];
  for (const song of selectedSongs) {
    for (let variation = 1; variation <= settings.variations_per_song; variation += 1) {
      jobs.push({
        song: {
          song_key: String(song.song_key),
          title: String(song.title || ''),
          artist: String(song.artist || ''),
          genre: String(song.genre || ''),
          candidate_score: Number(song.candidate_score || 0),
          visual_readiness: String(song.visual_readiness || '')
        },
        variation,
        recipe: recipeFor(song, settings, variation)
      });
    }
  }

  const fingerprint = JSON.stringify({
    settings,
    songs: selectedSongs.map((song) => song.song_key)
  });
  const planId = crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);

  return {
    plan_id: planId,
    mode: 'proposal_only',
    campaign_name: settings.campaign_name,
    approval_required_before_draft_creation: true,
    approval_required_before_render_launch: true,
    selected_song_count: selectedSongs.length,
    proposed_job_count: jobs.length,
    settings,
    selected_songs: selectedSongs,
    jobs
  };
}

function childEvent(event, body) {
  return {
    ...event,
    isBase64Encoded: false,
    body: JSON.stringify(body),
    queryStringParameters: null
  };
}

function reusableJob(job, recipe) {
  const status = lower(job.status);
  return !NON_REUSABLE_STATUSES.has(status) &&
    String(job.batch_name || '') === recipe.batch_name &&
    String(job.song_key || '') === recipe.song_key &&
    String(job.campaign_name || '') === recipe.campaign_name;
}

export function createBatchCampaignService({
  orchestrator = createVideoOrchestratorService()
} = {}) {
  async function buildPlan(event, input) {
    const settings = normalizeSettings(input);
    const candidateResult = await orchestrator.candidates({
      ...event,
      body: undefined,
      queryStringParameters: { limit: '100' }
    });
    const candidates = Array.isArray(candidateResult?.candidates) ? candidateResult.candidates : [];
    return createProposal(candidates, settings);
  }

  return {
    async plan(event) {
      return buildPlan(event, parseBody(event));
    },

    async createDrafts(event) {
      const input = parseBody(event);
      const proposal = await buildPlan(event, input);

      if (input.confirm_create_drafts !== true) {
        return {
          created: false,
          mode: 'validation_only',
          approval_required: true,
          proposal
        };
      }

      const jobList = await orchestrator.listJobs({
        ...event,
        body: undefined,
        queryStringParameters: { limit: '250' }
      });
      const existingJobs = Array.isArray(jobList?.jobs) ? jobList.jobs : [];
      const createdJobs = [];
      const skippedJobs = [];

      for (const proposed of proposal.jobs) {
        const existing = existingJobs.find((job) => reusableJob(job, proposed.recipe));
        if (existing) {
          skippedJobs.push({
            reason: 'existing_job_reused',
            job: existing,
            recipe: proposed.recipe
          });
          continue;
        }

        const result = await orchestrator.createDraft(childEvent(event, proposed.recipe));
        createdJobs.push({
          job: result.job,
          recipe: proposed.recipe
        });
        existingJobs.push(result.job);
      }

      return {
        created: true,
        mode: 'drafts_created',
        plan_id: proposal.plan_id,
        campaign_name: proposal.campaign_name,
        proposed_job_count: proposal.proposed_job_count,
        created_job_count: createdJobs.length,
        skipped_job_count: skippedJobs.length,
        approval_required_before_render_launch: true,
        renders_launched: false,
        created_jobs: createdJobs,
        skipped_jobs: skippedJobs,
        proposal
      };
    }
  };
}