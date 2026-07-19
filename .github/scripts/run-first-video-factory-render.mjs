const api = String(process.env.API_BASE || '').replace(/\/+$/, '');
const token = String(process.env.ADMIN_TOKEN || '').trim();
if (!api) throw new Error('API_BASE is missing.');
if (!token) throw new Error('STASHBOX_DEV_ADMIN_TOKEN is missing.');

const headers = { accept: 'application/json', 'x-admin-token': token };
const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);
const MOTION_DIRECTIONS = new Set([
  'left-to-right',
  'right-to-left',
  'top-to-bottom',
  'bottom-to-top',
  'top-left-to-bottom-right',
  'bottom-right-to-top-left',
  'top-right-to-bottom-left',
  'bottom-left-to-top-right'
]);

async function request(pathname, options = {}) {
  const response = await fetch(`${api}${pathname}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const error = new Error(`${pathname} returned ${response.status}: ${body?.error || body?.message || text || 'Unknown error'}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clean(value) {
  return String(value || '').trim();
}

function activeIds(section = {}, type = 'image') {
  const activeField = type === 'clip' ? 'active_clip_ids' : 'active_image_ids';
  const excludedField = type === 'clip' ? 'excluded_clip_ids' : 'excluded_image_ids';
  const excluded = new Set((Array.isArray(section[excludedField]) ? section[excludedField] : []).map(String));
  return [...new Set((Array.isArray(section[activeField]) ? section[activeField] : [])
    .map(String)
    .filter(Boolean))]
    .filter(id => !excluded.has(id));
}

function recipeAssetCounts(recipe = {}) {
  let imageCount = activeIds(recipe.song_assets, 'image').length;
  let clipCount = activeIds(recipe.song_assets, 'clip').length;

  for (const folder of Array.isArray(recipe.folders) ? recipe.folders : []) {
    if (!folder?.enabled) continue;
    imageCount += activeIds(folder, 'image').length;
    clipCount += activeIds(folder, 'clip').length;
  }
  for (const borrowed of Array.isArray(recipe.borrowed_song_assets) ? recipe.borrowed_song_assets : []) {
    if (!borrowed?.enabled) continue;
    imageCount += activeIds(borrowed, 'image').length;
    clipCount += activeIds(borrowed, 'clip').length;
  }
  return { imageCount, clipCount, totalCount: imageCount + clipCount };
}

async function waitForJob(jobId, predicate, timeoutMs = 8 * 60 * 1000) {
  const startedAt = Date.now();
  let lastState = '';
  while (Date.now() - startedAt < timeoutMs) {
    const jobsBody = await request('/admin/video-factory/jobs?limit=250');
    const jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
    const job = jobs.find(item => item.id === jobId);
    if (!job) throw new Error(`Video Factory job ${jobId} disappeared.`);
    const runtime = job.render_recipe?.runtime || {};
    const state = `${job.status}:${runtime.progress_percent ?? 0}:${runtime.status_message || ''}`;
    if (state !== lastState) {
      console.log('JOB_STATUS=' + JSON.stringify({
        id: job.id,
        song_key: job.song_key,
        status: job.status,
        progress_percent: Number(runtime.progress_percent || 0),
        message: runtime.status_message || '',
        error_message: job.error_message || ''
      }));
      lastState = state;
    }
    if (predicate(job)) return job;
    await sleep(5000);
  }
  throw new Error(`Timed out waiting for Video Factory job ${jobId}.`);
}

async function cancelAndArchive(job) {
  let latest = job;
  if (ACTIVE_STATUSES.has(latest.status)) {
    await request(`/admin/video-factory/jobs/${encodeURIComponent(latest.id)}/cancel`, {
      method: 'POST',
      body: {}
    }).catch(() => null);
    latest = await waitForJob(latest.id, item => TERMINAL_STATUSES.has(item.status), 2 * 60 * 1000);
  }
  if (latest.status !== 'archived' && !ACTIVE_STATUSES.has(latest.status)) {
    await request(`/admin/video-factory/jobs/${encodeURIComponent(latest.id)}/archive`, {
      method: 'POST',
      body: {}
    }).catch(() => null);
  }
}

const infra = await request('/admin/video-factory/infrastructure');
if (!infra.configured || infra.cluster_status !== 'ACTIVE') {
  throw new Error('Video Factory infrastructure is not ready.');
}
console.log('INFRA=' + JSON.stringify({
  configured: infra.configured,
  cluster_status: infra.cluster_status,
  task_definition_arn: infra.task_definition_arn
}));

const existingJobsBody = await request('/admin/video-factory/jobs?limit=250');
const existingJobs = Array.isArray(existingJobsBody?.jobs) ? existingJobsBody.jobs : [];
const unrelatedActive = existingJobs.find(job => ACTIVE_STATUSES.has(job.status));
if (unrelatedActive) {
  throw new Error(`A render is already active (${unrelatedActive.id}). Live Ken Burns verification was not started.`);
}

const songsBody = await request('/admin/songs');
const songs = (Array.isArray(songsBody?.songs) ? songsBody.songs : Array.isArray(songsBody) ? songsBody : [])
  .filter(song => clean(song.song_key) && clean(song.audio_url));

const candidates = [];
for (let index = 0; index < songs.length; index += 6) {
  const batch = songs.slice(index, index + 6);
  const resolved = await Promise.all(batch.map(async song => {
    try {
      const body = await request(`/admin/vec/recipe?song_key=${encodeURIComponent(song.song_key)}`);
      if (!body?.found || !body?.recipe || clean(body.recipe.visual_mode || 'custom') === 'artwork_only') return null;
      const counts = recipeAssetCounts(body.recipe);
      if (!counts.imageCount) return null;
      return { song, recipe: body.recipe, ...counts };
    } catch {
      return null;
    }
  }));
  candidates.push(...resolved.filter(Boolean));
}

candidates.sort((left, right) => {
  const leftImageOnly = left.clipCount === 0 ? 1 : 0;
  const rightImageOnly = right.clipCount === 0 ? 1 : 0;
  if (rightImageOnly !== leftImageOnly) return rightImageOnly - leftImageOnly;
  const leftRatio = left.imageCount / Math.max(1, left.totalCount);
  const rightRatio = right.imageCount / Math.max(1, right.totalCount);
  if (rightRatio !== leftRatio) return rightRatio - leftRatio;
  return right.imageCount - left.imageCount;
});

if (!candidates.length) throw new Error('No saved VEC recipe with selected still images was found.');
console.log('KEN_BURNS_CANDIDATES=' + JSON.stringify(candidates.slice(0, 8).map(candidate => ({
  song_key: candidate.song.song_key,
  title: candidate.song.display_title || candidate.song.song_name || candidate.song.song_key,
  artist: candidate.song.artist || '',
  image_count: candidate.imageCount,
  clip_count: candidate.clipCount,
  saved_render_settings: candidate.recipe.render_settings || null
}))));

let verifiedJob = null;
let verifiedTimeline = null;
let verifiedCandidate = null;
const maxAttempts = Math.min(8, candidates.length);

for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
  const candidate = candidates[attempt];
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const createBody = await request('/admin/video-factory/jobs', {
    method: 'POST',
    body: {
      song_key: candidate.song.song_key,
      client_name: 'Stashbox',
      project_name: 'Ken Burns DEV Verification',
      batch_name: `Ken Burns 3 Second Still Verification ${timestamp}`,
      duration_mode: 'custom',
      duration_seconds: 12,
      aspect_ratio: '16:9',
      fps: 30,
      intro_enabled: true,
      outro_enabled: true,
      corner_bug_enabled: true,
      include_artist: true,
      include_song: true,
      include_album: true,
      filename_template: '{artist}_{song}_ken-burns-dev_{aspect}_v{variation}'
    }
  });
  let job = createBody.job;
  if (!job?.id) throw new Error('Video Factory job ID was not returned.');
  console.log('DRAFT_CREATED=' + JSON.stringify({
    attempt: attempt + 1,
    id: job.id,
    song_key: candidate.song.song_key,
    output_filename: job.output_filename
  }));

  await request(`/admin/video-factory/jobs/${encodeURIComponent(job.id)}/render`, {
    method: 'POST',
    body: {}
  });

  job = await waitForJob(job.id, item => {
    const timeline = Array.isArray(item.render_recipe?.timeline) ? item.render_recipe.timeline : [];
    return timeline.length > 0 || TERMINAL_STATUSES.has(item.status);
  });

  if (TERMINAL_STATUSES.has(job.status) && job.status !== 'completed') {
    await cancelAndArchive(job);
    console.log('ATTEMPT_SKIPPED=' + JSON.stringify({ id: job.id, reason: `terminal-${job.status}` }));
    continue;
  }

  const timeline = Array.isArray(job.render_recipe?.timeline) ? job.render_recipe.timeline : [];
  const stillSegments = timeline.filter(item => item.type === 'image' && item.asset_id !== 'song-artwork');
  if (!stillSegments.length) {
    await cancelAndArchive(job);
    console.log('ATTEMPT_SKIPPED=' + JSON.stringify({ id: job.id, reason: 'no-non-artwork-still-in-frozen-timeline' }));
    continue;
  }

  const visuals = job.render_recipe?.visuals || {};
  if (Number(visuals.still_image_duration_seconds) !== 3) {
    await cancelAndArchive(job);
    throw new Error(`Live frozen recipe used still_image_duration_seconds=${visuals.still_image_duration_seconds}; expected 3.`);
  }
  if (visuals.ken_burns_enabled !== true) {
    await cancelAndArchive(job);
    throw new Error(`Live frozen recipe used ken_burns_enabled=${visuals.ken_burns_enabled}; expected true.`);
  }

  for (const segment of stillSegments) {
    const duration = Number(segment.duration_seconds);
    const motion = segment.motion || {};
    if (!(duration > 0 && duration <= 3.001)) {
      await cancelAndArchive(job);
      throw new Error(`Still segment ${segment.asset_id} has invalid duration ${duration}.`);
    }
    if (!motion.enabled || !MOTION_DIRECTIONS.has(clean(motion.direction))) {
      await cancelAndArchive(job);
      throw new Error(`Still segment ${segment.asset_id} is missing valid Ken Burns direction metadata.`);
    }
    if (!['in', 'out'].includes(clean(motion.zoom_mode))) {
      await cancelAndArchive(job);
      throw new Error(`Still segment ${segment.asset_id} is missing randomized zoom in/out metadata.`);
    }
    const maxZoom = Number(motion.max_zoom);
    if (maxZoom < 1.06 || maxZoom > 1.09) {
      await cancelAndArchive(job);
      throw new Error(`Still segment ${segment.asset_id} has excessive zoom ${maxZoom}.`);
    }
  }

  verifiedJob = job;
  verifiedTimeline = timeline;
  verifiedCandidate = candidate;
  console.log('LIVE_FROZEN_KEN_BURNS=' + JSON.stringify({
    id: job.id,
    song_key: candidate.song.song_key,
    still_image_duration_seconds: visuals.still_image_duration_seconds,
    ken_burns_enabled: visuals.ken_burns_enabled,
    timeline_segment_count: timeline.length,
    still_segments: stillSegments.map(segment => ({
      asset_id: segment.asset_id,
      start_seconds: segment.start_seconds,
      duration_seconds: segment.duration_seconds,
      motion: segment.motion
    }))
  }));
  break;
}

if (!verifiedJob) throw new Error(`None of the first ${maxAttempts} image-enabled VEC recipes placed a still in the 12-second verification timeline.`);

verifiedJob = await waitForJob(verifiedJob.id, item => TERMINAL_STATUSES.has(item.status), 15 * 60 * 1000);
if (verifiedJob.status !== 'completed') {
  throw new Error(`Ken Burns verification render ended with status ${verifiedJob.status}: ${verifiedJob.error_message || 'No error returned.'}`);
}

const preview = await request(`/admin/video-factory/jobs/${encodeURIComponent(verifiedJob.id)}/preview`);
const thumbnail = await request(`/admin/video-factory/jobs/${encodeURIComponent(verifiedJob.id)}/thumbnail`);
if (!preview.url) throw new Error('Completed render did not return a signed MP4 preview URL.');
if (!thumbnail.url) throw new Error('Completed render did not return a signed thumbnail URL.');
const rangeResponse = await fetch(preview.url, { headers: { range: 'bytes=0-0' } });
if (![200, 206].includes(rangeResponse.status)) {
  throw new Error(`Signed MP4 verification returned HTTP ${rangeResponse.status}.`);
}

console.log('KEN_BURNS_RENDER_COMPLETED=' + JSON.stringify({
  job_id: verifiedJob.id,
  song_key: verifiedCandidate.song.song_key,
  artist: verifiedCandidate.song.artist || '',
  title: verifiedCandidate.song.display_title || verifiedCandidate.song.song_name || verifiedCandidate.song.song_key,
  output_filename: verifiedJob.output_filename,
  width: verifiedJob.width,
  height: verifiedJob.height,
  fps: verifiedJob.fps,
  completed_at: verifiedJob.completed_at,
  signed_mp4_verified: true,
  signed_thumbnail_created: true,
  timeline_segment_count: verifiedTimeline.length
}));
