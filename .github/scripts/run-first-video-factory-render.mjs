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
    }
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

const infra = await request('/admin/video-factory/infrastructure');
console.log('INFRA=' + JSON.stringify({
  configured: infra.configured,
  cluster_status: infra.cluster_status,
  running_tasks: infra.running_tasks,
  pending_tasks: infra.pending_tasks,
  output_bucket: infra.output_bucket,
  task_definition_arn: infra.task_definition_arn
}));
if (!infra.configured || infra.cluster_status !== 'ACTIVE') {
  throw new Error('Video Factory infrastructure is not ready.');
}

const songsBody = await request('/admin/songs');
const songs = Array.isArray(songsBody?.songs) ? songsBody.songs : Array.isArray(songsBody) ? songsBody : [];
const song = songs.find(item => /space\s*jam/i.test(`${item.song_key || ''} ${item.display_title || ''} ${item.song_name || ''}`));
if (!song) {
  console.log('AVAILABLE_SONGS=' + JSON.stringify(songs.slice(0, 50).map(item => ({
    song_key: item.song_key,
    title: item.display_title || item.song_name,
    artist: item.artist
  }))));
  throw new Error('Space Jam was not found in TRUE DEV songs.');
}
console.log('SELECTED_SONG=' + JSON.stringify({ song_key: song.song_key, title: song.display_title || song.song_name, artist: song.artist }));

const batchName = 'Space Jam First Full-Song Render';
let jobsBody = await request('/admin/video-factory/jobs?limit=250');
let jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
let job = jobs.find(item => item.batch_name === batchName && item.song_key === song.song_key);

if (!job) {
  const createBody = await request('/admin/video-factory/jobs', {
    method: 'POST',
    body: JSON.stringify({
      song_key: song.song_key,
      client_name: 'Stashbox',
      project_name: 'Video Factory First Render',
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
    })
  });
  job = createBody.job;
  console.log('DRAFT_CREATED=' + JSON.stringify({ id: job.id, output_filename: job.output_filename }));
} else {
  console.log('EXISTING_JOB=' + JSON.stringify({ id: job.id, status: job.status, output_filename: job.output_filename }));
}

if (!job?.id) throw new Error('Video Factory job ID was not returned.');

if (job.status === 'draft') {
  const launch = await request(`/admin/video-factory/jobs/${encodeURIComponent(job.id)}/render`, {
    method: 'POST',
    body: '{}'
  });
  console.log('RENDER_LAUNCHED=' + JSON.stringify(launch));
} else if (job.status === 'failed' || job.status === 'cancelled') {
  const retry = await request(`/admin/video-factory/jobs/${encodeURIComponent(job.id)}/retry`, {
    method: 'POST',
    body: '{}'
  });
  console.log('RENDER_RETRIED=' + JSON.stringify(retry));
} else if (job.status === 'completed') {
  console.log('RENDER_ALREADY_COMPLETED');
} else {
  console.log(`RENDER_ALREADY_ACTIVE status=${job.status}`);
}

const terminal = new Set(['completed', 'failed', 'cancelled']);
const startedAt = Date.now();
const timeoutMs = 42 * 60 * 1000;
let lastStatus = '';
let lastProgress = -1;

while (Date.now() - startedAt < timeoutMs) {
  jobsBody = await request('/admin/video-factory/jobs?limit=250');
  jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
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

  if (terminal.has(job.status)) break;
  await sleep(15000);
}

if (!terminal.has(job.status)) {
  throw new Error(`Render did not reach a terminal state before timeout. Last status: ${job.status}.`);
}
if (job.status !== 'completed') {
  throw new Error(`Render ended with status ${job.status}: ${job.error_message || 'No error message returned.'}`);
}

const preview = await request(`/admin/video-factory/jobs/${encodeURIComponent(job.id)}/preview`);
const thumbnail = await request(`/admin/video-factory/jobs/${encodeURIComponent(job.id)}/thumbnail`);
if (!preview.url) throw new Error('Completed render did not return a signed MP4 preview URL.');
if (!thumbnail.url) throw new Error('Completed render did not return a signed thumbnail URL.');

const rangeResponse = await fetch(preview.url, { headers: { range: 'bytes=0-0' } });
if (![200, 206].includes(rangeResponse.status)) {
  throw new Error(`Signed MP4 verification returned HTTP ${rangeResponse.status}.`);
}

console.log('FIRST_RENDER_COMPLETED=' + JSON.stringify({
  job_id: job.id,
  song_key: job.song_key,
  artist: job.artist,
  song_title: job.song_title,
  output_filename: job.output_filename,
  output_url: job.output_url,
  thumbnail_url: job.thumbnail_url,
  width: job.width,
  height: job.height,
  fps: job.fps,
  completed_at: job.completed_at,
  signed_mp4_verified: true,
  signed_thumbnail_created: true
}));
