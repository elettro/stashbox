const api = String(process.env.API_BASE || '').replace(/\/+$/, '');
const token = String(process.env.ADMIN_TOKEN || '').trim();
if (!api) throw new Error('API_BASE is missing.');
if (!token) throw new Error('STASHBOX_DEV_ADMIN_TOKEN is missing.');

const headers = { accept: 'application/json', 'x-admin-token': token };

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

function selectedIds(section = {}) {
  const excluded = new Set([
    ...(Array.isArray(section.excluded_clip_ids) ? section.excluded_clip_ids : []),
    ...(Array.isArray(section.excluded_image_ids) ? section.excluded_image_ids : [])
  ].map(String));
  return [...new Set([
    ...(Array.isArray(section.active_clip_ids) ? section.active_clip_ids : []),
    ...(Array.isArray(section.active_image_ids) ? section.active_image_ids : [])
  ].map(String).filter(Boolean))].filter(id => !excluded.has(id));
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

const songsBody = await request('/admin/songs');
const songs = Array.isArray(songsBody?.songs) ? songsBody.songs : Array.isArray(songsBody) ? songsBody : [];
const song = songs.find(item => /dub\s*reggae\s*0?1/i.test(`${item.song_key || ''} ${item.display_title || ''} ${item.song_name || ''}`));
if (!song) throw new Error('DUB REGGAE 01 was not found.');

const encodedSongKey = encodeURIComponent(song.song_key);
const recipeBody = await request(`/admin/vec/recipe?song_key=${encodedSongKey}`);
if (!recipeBody?.found || !recipeBody?.recipe) throw new Error('DUB REGGAE 01 has no saved VEC recipe.');
const recipe = recipeBody.recipe;
const enabledFolders = (Array.isArray(recipe.folders) ? recipe.folders : []).filter(folder => folder?.enabled);
if (!enabledFolders.length) throw new Error('DUB REGGAE 01 VEC recipe has no enabled folder.');

const expectedFolderClipIds = new Set();
const folderSummary = [];
for (const folder of enabledFolders) {
  const folderId = String(folder.folder_id || folder.id || '').trim();
  if (!folderId) continue;
  const body = await request(`/radio/visuals/folders/${encodeURIComponent(folderId)}/assets`);
  const selected = new Set(selectedIds(folder));
  const selectedClips = (Array.isArray(body?.assets) ? body.assets : [])
    .filter(asset => selected.has(String(asset.id || asset.asset_id)) && String(asset.asset_type || asset.type) === 'clip');
  selectedClips.forEach(asset => expectedFolderClipIds.add(String(asset.id || asset.asset_id)));
  folderSummary.push({
    folder_id: folderId,
    folder_name: body?.folder_name || '',
    selected_clip_count: selectedClips.length
  });
}

if (expectedFolderClipIds.size < 20) {
  throw new Error(`DUB REGGAE 01 resolved only ${expectedFolderClipIds.size} selected folder clips; render was not launched.`);
}
console.log('VEC_PREFLIGHT=' + JSON.stringify({
  song_key: song.song_key,
  visual_mode: recipe.visual_mode,
  shuffle: recipe.shuffle,
  artwork: recipe.artwork,
  folders: folderSummary,
  selected_folder_clip_count: expectedFolderClipIds.size
}));

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const batchName = `DUB REGGAE 01 VEC Montage ${timestamp}`;
const createBody = await request('/admin/video-factory/jobs', {
  method: 'POST',
  body: {
    song_key: song.song_key,
    client_name: 'Stashbox',
    project_name: 'VEC Recipe Montage Verification',
    batch_name: batchName,
    duration_mode: 'full',
    duration_seconds: null,
    aspect_ratio: '16:9',
    fps: 30,
    intro_enabled: true,
    outro_enabled: true,
    corner_bug_enabled: true,
    include_artist: true,
    include_song: true,
    include_album: true,
    filename_template: '{artist}_{song}_{duration}_{aspect}_v{variation}'
  }
});
let job = createBody.job;
if (!job?.id) throw new Error('Video Factory job ID was not returned.');
console.log('DRAFT_CREATED=' + JSON.stringify({ id: job.id, output_filename: job.output_filename, batch_name: batchName }));

const launch = await request(`/admin/video-factory/jobs/${encodeURIComponent(job.id)}/render`, {
  method: 'POST',
  body: {}
});
console.log('RENDER_LAUNCHED=' + JSON.stringify(launch));

const terminal = new Set(['completed', 'failed', 'cancelled']);
const startedAt = Date.now();
const timeoutMs = 48 * 60 * 1000;
let lastStatus = '';
let lastProgress = -1;
let timelineVerified = false;
let timelineSummary = null;

while (Date.now() - startedAt < timeoutMs) {
  const jobsBody = await request('/admin/video-factory/jobs?limit=250');
  const jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
  job = jobs.find(item => item.id === job.id);
  if (!job) throw new Error('Video Factory job disappeared from Render History.');

  const runtime = job.render_recipe?.runtime || {};
  const progress = Number(runtime.progress_percent ?? 0);
  if (job.status !== lastStatus || progress !== lastProgress) {
    console.log('RENDER_STATUS=' + JSON.stringify({
      id: job.id,
      status: job.status,
      progress_percent: progress,
      message: runtime.status_message || '',
      error_message: job.error_message || '',
      updated_at: job.updated_at
    }));
    lastStatus = job.status;
    lastProgress = progress;
  }

  const timeline = Array.isArray(job.render_recipe?.timeline) ? job.render_recipe.timeline : [];
  if (!timelineVerified && timeline.length) {
    const timelineClipIds = timeline
      .filter(item => item.type === 'clip')
      .map(item => String(item.asset_id || ''));
    const matchedExpected = [...new Set(timelineClipIds.filter(id => expectedFolderClipIds.has(id)))];
    const artworkSegments = timeline.filter(item => item.asset_id === 'song-artwork');
    const eligibleCount = Number(job.render_recipe?.visuals?.eligible_asset_count || 0);
    timelineSummary = {
      timeline_segment_count: timeline.length,
      timeline_clip_segment_count: timelineClipIds.length,
      unique_expected_folder_clips_used: matchedExpected.length,
      eligible_asset_count: eligibleCount,
      artwork_segments: artworkSegments.map(item => ({
        start_seconds: item.start_seconds,
        duration_seconds: item.duration_seconds,
        source: item.source
      })),
      first_segments: timeline.slice(0, 8).map(item => ({
        asset_id: item.asset_id,
        type: item.type,
        source: item.source,
        start_seconds: item.start_seconds,
        duration_seconds: item.duration_seconds
      }))
    };
    console.log('FROZEN_VEC_TIMELINE=' + JSON.stringify(timelineSummary));

    const validStartArtwork = artworkSegments.some(item => Number(item.start_seconds) === 0 && Number(item.duration_seconds) >= 2.9);
    if (eligibleCount < 24 || matchedExpected.length < 10 || !validStartArtwork) {
      await request(`/admin/video-factory/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST', body: {} }).catch(() => null);
      throw new Error(`Frozen timeline failed VEC verification: ${JSON.stringify(timelineSummary)}`);
    }
    timelineVerified = true;
  }

  if (terminal.has(job.status)) break;
  await sleep(15000);
}

if (!terminal.has(job.status)) throw new Error(`Render timed out with status ${job.status}.`);
if (job.status !== 'completed') throw new Error(`Render ended with status ${job.status}: ${job.error_message || 'No error returned.'}`);
if (!timelineVerified) throw new Error('Render completed without a verifiable frozen VEC timeline.');

const preview = await request(`/admin/video-factory/jobs/${encodeURIComponent(job.id)}/preview`);
const thumbnail = await request(`/admin/video-factory/jobs/${encodeURIComponent(job.id)}/thumbnail`);
if (!preview.url) throw new Error('Completed render did not return a signed MP4 preview URL.');
if (!thumbnail.url) throw new Error('Completed render did not return a signed thumbnail URL.');
const rangeResponse = await fetch(preview.url, { headers: { range: 'bytes=0-0' } });
if (![200, 206].includes(rangeResponse.status)) throw new Error(`Signed MP4 verification returned HTTP ${rangeResponse.status}.`);

console.log('DUB_VEC_RENDER_COMPLETED=' + JSON.stringify({
  job_id: job.id,
  song_key: job.song_key,
  output_filename: job.output_filename,
  width: job.width,
  height: job.height,
  fps: job.fps,
  completed_at: job.completed_at,
  signed_mp4_verified: true,
  signed_thumbnail_created: true,
  timeline: timelineSummary
}));
