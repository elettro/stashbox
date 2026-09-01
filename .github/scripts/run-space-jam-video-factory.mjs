const api = String(process.env.API_BASE || '').replace(/\/+$/, '');
const token = String(process.env.ADMIN_TOKEN || '').trim();
if (!api) throw new Error('API_BASE is missing.');
if (!token) throw new Error('ADMIN_TOKEN is missing.');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(pathname, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${api}${pathname}`, {
      method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-admin-token': token
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
    if (!response.ok) {
      throw new Error(`${method} ${pathname} returned ${response.status}: ${parsed?.error || parsed?.message || text || 'Unknown error'}`);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

const songsBody = await request('/admin/songs');
const songs = Array.isArray(songsBody?.songs) ? songsBody.songs : Array.isArray(songsBody) ? songsBody : [];
const song = songs.find(item => /space\s*jam/i.test([
  item.song_key,
  item.song_name,
  item.display_title,
  item.artist
].filter(Boolean).join(' ')));
if (!song) throw new Error('Space Jam was not found in the DEV Song CMS.');
console.log('SPACE_JAM_SONG=' + JSON.stringify({
  song_key: song.song_key,
  title: song.display_title || song.song_name,
  artist: song.artist,
  audio_url_present: Boolean(song.audio_url)
}));

const batchName = 'Space Jam First Full-Song Render';
const jobsBody = await request('/admin/video-factory/jobs?limit=250');
const jobs = Array.isArray(jobsBody?.jobs) ? jobsBody.jobs : [];
let job = jobs.find(item => item.batch_name === batchName) || null;

if (!job) {
  const created = await request('/admin/video-factory/jobs', {
    method: 'POST',
    body: {
      song_key: song.song_key,
      batch_name: batchName,
      client_name: 'Stashbox',
      project_name: 'Video Factory First Live Render',
      campaign_name: 'First Render',
      duration_mode: 'full',
      aspect_ratio: '16:9',
      fps: 30,
      intro_enabled: true,
      outro_enabled: true,
      corner_bug_enabled: true,
      include_artist: true,
      include_song: true,
      include_album: true,
      filename_template: '{artist}_{song}_full-song_16x9_v{variation}',
      metadata_comment: 'First live Stashbox Radio Video Factory render'
    }
  });
  job = created.job;
  console.log(`CREATED_JOB=${job.id}`);
} else {
  console.log(`REUSING_JOB=${job.id} STATUS=${job.status}`);
}

if (job.status === 'completed') {
  console.log('FINAL_JOB=' + JSON.stringify(job));
  process.exit(0);
}

if (['draft', 'failed', 'cancelled'].includes(job.status)) {
  const action = job.status === 'draft' ? 'render' : 'retry';
  const launched = await request(`/admin/video-factory/jobs/${job.id}/${action}`, {
    method: 'POST',
    body: {}
  });
  console.log('LAUNCH=' + JSON.stringify({
    job_id: launched.job_id,
    status: launched.status,
    task_arn: launched.task_arn
  }));
} else if (!['pending', 'preparing', 'rendering', 'uploading'].includes(job.status)) {
  throw new Error(`Space Jam job cannot be monitored from status ${job.status}.`);
}

const deadline = Date.now() + 85 * 60 * 1000;
let lastSignature = '';
while (Date.now() < deadline) {
  const currentBody = await request(`/admin/video-factory/jobs/${job.id}`);
  const current = currentBody.job;
  const runtime = current.render_recipe?.runtime || {};
  const signature = `${current.status}|${runtime.progress_percent ?? 0}|${runtime.status_message || ''}`;
  if (signature !== lastSignature) {
    console.log('PROGRESS=' + JSON.stringify({
      status: current.status,
      progress_percent: runtime.progress_percent ?? 0,
      message: runtime.status_message || '',
      error: current.error_message || ''
    }));
    lastSignature = signature;
  }

  if (current.status === 'completed') {
    console.log('FINAL_JOB=' + JSON.stringify({
      id: current.id,
      status: current.status,
      output_filename: current.output_filename,
      output_url: current.output_url,
      thumbnail_url: current.thumbnail_url,
      completed_at: current.completed_at,
      outputs: current.outputs || []
    }));
    process.exit(0);
  }
  if (current.status === 'failed' || current.status === 'cancelled') {
    throw new Error(`Render ended with status ${current.status}: ${current.error_message || runtime.status_message || 'No error detail.'}`);
  }
  await sleep(15000);
}

throw new Error('Space Jam render did not finish within 85 minutes.');
