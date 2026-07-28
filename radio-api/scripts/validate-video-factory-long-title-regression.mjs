import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API_BASE = String(process.env.API_BASE || '').replace(/\/+$/, '');
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
const RESULT_PATH = String(process.env.RESULT_PATH || 'radio-api/docs/VIDEO_FACTORY_LONG_TITLE_REGRESSION_RESULT.md');
const OUTPUT_DIR = String(process.env.OUTPUT_DIR || '/tmp/video-factory-long-title-regression');
const FFMPEG_PATH = String(process.env.FFMPEG_PATH || '/usr/bin/ffmpeg');
const FFPROBE_PATH = String(process.env.FFPROBE_PATH || '/usr/bin/ffprobe');
const RUN_ID = String(process.env.GITHUB_RUN_ID || 'unknown');
const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const FORMATS = [
  { ratio: '3:4', label: '3x4', width: 1080, height: 1440 },
  { ratio: '4:5', label: '4x5', width: 1080, height: 1350 },
  { ratio: '9:16', label: '9x16', width: 1080, height: 1920 }
];

const report = {
  status: 'failed', started_at: new Date().toISOString(), completed_at: '', run_id: RUN_ID,
  song_key: '', song_title: '', artist: '', album: '', title_length: 0, artist_length: 0,
  combined_length: 0, candidate_songs: [], renders: [], error: ''
};

function ensureConfig() {
  if (!API_BASE) throw new Error('API_BASE is required.');
  if (!ADMIN_TOKEN) throw new Error('ADMIN_TOKEN is required.');
  if (!fs.existsSync(FFMPEG_PATH)) throw new Error(`FFmpeg not found at ${FFMPEG_PATH}.`);
  if (!fs.existsSync(FFPROBE_PATH)) throw new Error(`FFprobe not found at ${FFPROBE_PATH}.`);
}

async function request(pathname, options = {}, allowFailure = false) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'x-admin-token': ADMIN_TOKEN,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 1000) }; }
  if (!response.ok && !allowFailure) {
    const detail = body.error || body.message || JSON.stringify(body).slice(0, 1000);
    throw new Error(`${options.method || 'GET'} ${pathname} returned ${response.status}: ${detail}`);
  }
  return { response, body };
}

const safe = value => String(value ?? '').replace(/`/g, '\\`');
const chooseTitle = song => String(song.display_title || song.song_name || song.song_key || '').trim();
function songScore(song) {
  return chooseTitle(song).length * 3 + String(song.artist || '').trim().length * 2 + String(song.album_name || '').trim().length;
}

async function chooseStressSong() {
  const { body } = await request('/admin/songs');
  const songs = Array.isArray(body.songs) ? body.songs : Array.isArray(body) ? body : [];
  const eligible = songs.filter(song => String(song.audio_url || '').trim())
    .map(song => ({ song, score: songScore(song) }))
    .sort((left, right) => right.score - left.score);
  if (!eligible.length) throw new Error('No DEV song with audio was available for the long-title test.');
  report.candidate_songs = eligible.slice(0, 5).map(({ song, score }) => ({
    song_key: song.song_key, artist: String(song.artist || ''), title: chooseTitle(song),
    album: String(song.album_name || ''), score
  }));
  const selected = eligible[0].song;
  report.song_key = selected.song_key;
  report.song_title = chooseTitle(selected);
  report.artist = String(selected.artist || '');
  report.album = String(selected.album_name || '');
  report.title_length = report.song_title.length;
  report.artist_length = report.artist.length;
  report.combined_length = report.title_length + report.artist_length;
  return selected;
}

async function waitForNoActiveJob() {
  const deadline = Date.now() + 60 * 60 * 1000;
  while (Date.now() < deadline) {
    const { body } = await request('/admin/video-factory/jobs?limit=250');
    const active = (body.jobs || []).find(job => ACTIVE_STATUSES.has(job.status));
    if (!active) return;
    console.log(`[queue] Waiting for active job ${active.id} (${active.status})`);
    await sleep(15000);
  }
  throw new Error('Video Factory remained busy for more than 60 minutes.');
}

function probeVideo(filePath) {
  const stdout = execFileSync(FFPROBE_PATH, [
    '-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', filePath
  ], { encoding: 'utf8', maxBuffer: 30 * 1024 * 1024, timeout: 120000 });
  const parsed = JSON.parse(stdout || '{}');
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find(stream => stream.codec_type === 'video');
  return {
    width: Number(video?.width || 0), height: Number(video?.height || 0),
    frame_rate: String(video?.r_frame_rate || ''), duration_seconds: Number(parsed.format?.duration || 0),
    video_streams: streams.filter(stream => stream.codec_type === 'video').length,
    audio_streams: streams.filter(stream => stream.codec_type === 'audio').length
  };
}

function captureFrame(videoPath, timestamp, outputPath) {
  execFileSync(FFMPEG_PATH, [
    '-hide_banner', '-loglevel', 'error', '-ss', String(timestamp), '-i', videoPath,
    '-frames:v', '1', '-q:v', '2', '-y', outputPath
  ], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 120000 });
  const bytes = fs.statSync(outputPath).size;
  if (bytes < 1000) throw new Error(`Captured frame is unexpectedly small: ${outputPath}`);
  return bytes;
}

function collectMediaUrls(value, urls = new Set()) {
  if (Array.isArray(value)) { for (const item of value) collectMediaUrls(item, urls); return urls; }
  if (!value || typeof value !== 'object') return urls;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') {
      const clean = item.toLowerCase().split('?')[0];
      if (key.toLowerCase().includes('url') || /\.(mp4|mov|webm|m4v|jpg|jpeg|png|webp|gif)$/.test(clean)) urls.add(item);
    } else collectMediaUrls(item, urls);
  }
  return urls;
}

function summarizeRecipe(recipe) {
  const urls = [...collectMediaUrls(recipe)];
  const imageUrls = urls.filter(url => /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url));
  const videoUrls = urls.filter(url => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url));
  return { unique_media_urls: urls.length, image_urls: imageUrls.length, video_urls: videoUrls.length, mixed_media: imageUrls.length > 0 && videoUrls.length > 0 };
}

function makeRecord(format) {
  return {
    ratio: format.ratio, label: format.label, status: 'failed', job_id: '', batch_id: '',
    draft_width: 0, draft_height: 0, output_width: 0, output_height: 0,
    probed_width: 0, probed_height: 0, duration_seconds: 0, frame_rate: '',
    video_streams: 0, audio_streams: 0, downloaded_bytes: 0, output_filename: '',
    filename_has_ratio: false, filename_has_resolution: false, unique_media_urls: 0,
    image_urls: 0, video_urls: 0, mixed_media: false, frames: [], error: ''
  };
}

async function createAndRender(song, format) {
  await waitForNoActiveJob();
  const record = makeRecord(format);
  report.renders.push(record);
  try {
    const { body: draftBody } = await request('/admin/video-factory/jobs', {
      method: 'POST',
      body: JSON.stringify({
        song_key: song.song_key, batch_name: `Long Title Stress ${format.ratio}`,
        client_name: 'Stashbox Radio', project_name: 'Video Factory DEV Validation',
        campaign_name: 'Long Title and Existing Ratio Regression', output_type: 'music_video',
        duration_mode: 'custom', duration_seconds: 15, aspect_ratio: format.ratio, fps: 30,
        intro_enabled: true, outro_enabled: true, corner_bug_enabled: true,
        include_artist: true, include_song: true, include_album: true,
        filename_template: '{artist}_{song}_{resolution}_{duration}_{aspect}_v{variation}',
        metadata_comment: `Automated DEV long-title stress and ${format.ratio} validation.`
      })
    });
    const created = draftBody.job;
    if (!created?.id) throw new Error(`${format.ratio} draft response did not include a job ID.`);
    record.job_id = created.id;
    record.batch_id = created.batch_id || '';
    record.draft_width = Number(created.width || 0);
    record.draft_height = Number(created.height || 0);
    record.output_filename = String(created.output_filename || '');
    if (record.draft_width !== format.width || record.draft_height !== format.height) {
      throw new Error(`${format.ratio} draft dimensions were ${record.draft_width}x${record.draft_height}; expected ${format.width}x${format.height}.`);
    }

    await request(`/admin/video-factory/jobs/${encodeURIComponent(created.id)}/render`, { method: 'POST', body: '{}' });
    const deadline = Date.now() + 60 * 60 * 1000;
    let completedJob = null;
    let lastMarker = '';
    while (Date.now() < deadline) {
      const { body } = await request(`/admin/video-factory/jobs/${encodeURIComponent(created.id)}`);
      const job = body.job;
      const runtime = job.render_recipe?.runtime || {};
      const marker = `${job.status}:${runtime.progress_percent || 0}:${runtime.status_message || ''}`;
      if (marker !== lastMarker) { console.log(`[${format.ratio}] ${marker}`); lastMarker = marker; }
      if (job.status === 'completed') { completedJob = job; break; }
      if (['failed', 'cancelled'].includes(job.status)) {
        throw new Error(`${format.ratio} render ended as ${job.status}: ${runtime.error || runtime.status_message || ''}`);
      }
      await sleep(15000);
    }
    if (!completedJob) throw new Error(`${format.ratio} render did not complete within 60 minutes.`);

    const outputs = Array.isArray(completedJob.outputs) ? completedJob.outputs : [];
    const output = outputs[0] || completedJob.output || {};
    record.output_width = Number(output.width || completedJob.width || 0);
    record.output_height = Number(output.height || completedJob.height || 0);
    record.output_filename = String(output.filename || completedJob.output_filename || record.output_filename);
    record.filename_has_ratio = record.output_filename.includes(format.label);
    record.filename_has_resolution = record.output_filename.includes(`${format.width}x${format.height}`);
    Object.assign(record, summarizeRecipe(completedJob.render_recipe || {}));

    const { body: downloadBody } = await request(`/admin/video-factory/jobs/${encodeURIComponent(created.id)}/download`);
    if (!downloadBody.url) throw new Error(`${format.ratio} download endpoint did not return a signed URL.`);
    const formatDir = path.join(OUTPUT_DIR, format.label);
    fs.mkdirSync(formatDir, { recursive: true });
    const videoPath = path.join(formatDir, record.output_filename || `${format.label}.mp4`);
    const download = await fetch(downloadBody.url);
    if (!download.ok) throw new Error(`${format.ratio} signed download returned ${download.status}.`);
    fs.writeFileSync(videoPath, Buffer.from(await download.arrayBuffer()));
    record.downloaded_bytes = fs.statSync(videoPath).size;

    const probe = probeVideo(videoPath);
    record.probed_width = probe.width;
    record.probed_height = probe.height;
    record.duration_seconds = Math.round(probe.duration_seconds * 1000) / 1000;
    record.frame_rate = probe.frame_rate;
    record.video_streams = probe.video_streams;
    record.audio_streams = probe.audio_streams;
    if (probe.width !== format.width || probe.height !== format.height) throw new Error(`${format.ratio} MP4 dimensions were ${probe.width}x${probe.height}.`);
    if (probe.video_streams !== 1 || probe.audio_streams < 1) throw new Error(`${format.ratio} MP4 stream validation failed.`);
    if (probe.duration_seconds < 14 || probe.duration_seconds > 16) throw new Error(`${format.ratio} MP4 duration was ${probe.duration_seconds} seconds.`);
    if (!record.filename_has_ratio || !record.filename_has_resolution) {
      throw new Error(`${format.ratio} filename missing ratio or resolution: ${record.output_filename}`);
    }

    for (const timestamp of [0.5, 3, 7.5, 12, 14.5].filter(value => value < probe.duration_seconds)) {
      const filename = `${format.label}-${String(timestamp).replace('.', '_')}s.jpg`;
      const outputPath = path.join(formatDir, filename);
      record.frames.push({ timestamp, filename, bytes: captureFrame(videoPath, timestamp, outputPath) });
    }
    record.status = 'completed';
  } catch (error) {
    record.error = error.message;
    console.error(`[${format.ratio}] ${error.stack || error.message}`);
  }
}

function writeReport() {
  const lines = [
    '# Video Factory Long-Title and Regression Validation', '',
    `Status: ${safe(report.status)}`, `Started: ${safe(report.started_at)}`,
    `Completed: ${safe(report.completed_at)}`, `GitHub Actions run ID: \`${safe(report.run_id)}\``, '',
    `- Song: ${safe(report.artist)} — ${safe(report.song_title)}`, `- Album: ${safe(report.album)}`,
    `- Song key: \`${safe(report.song_key)}\``, `- Title length: ${report.title_length} characters`,
    `- Artist length: ${report.artist_length} characters`,
    `- Combined artist/title length: ${report.combined_length} characters`, '', '## Candidate Songs', ''
  ];
  for (const candidate of report.candidate_songs) {
    lines.push(`- ${safe(candidate.artist)} — ${safe(candidate.title)} (${candidate.title.length}+${candidate.artist.length} chars; score ${candidate.score})`);
  }
  lines.push('');
  for (const render of report.renders) {
    lines.push(
      `## ${safe(render.ratio)} Render`, '', `- Status: ${safe(render.status)}`,
      `- Job ID: \`${safe(render.job_id)}\``, `- Batch ID: \`${safe(render.batch_id)}\``,
      `- Draft dimensions: ${render.draft_width}×${render.draft_height}`,
      `- Output-record dimensions: ${render.output_width}×${render.output_height}`,
      `- Probed dimensions: ${render.probed_width}×${render.probed_height}`,
      `- Duration: ${render.duration_seconds} seconds`, `- Frame rate: ${safe(render.frame_rate)}`,
      `- Video streams: ${render.video_streams}`, `- Audio streams: ${render.audio_streams}`,
      `- Downloaded bytes: ${render.downloaded_bytes}`, `- Output filename: \`${safe(render.output_filename)}\``,
      `- Filename contains ratio: ${render.filename_has_ratio ? 'yes' : 'no'}`,
      `- Filename contains resolution: ${render.filename_has_resolution ? 'yes' : 'no'}`,
      `- Unique recipe media URLs: ${render.unique_media_urls}`, `- Recipe image URLs: ${render.image_urls}`,
      `- Recipe video URLs: ${render.video_urls}`, `- Mixed image/video recipe: ${render.mixed_media ? 'yes' : 'no'}`,
      `- Frames: ${render.frames.map(frame => `${frame.timestamp}s (${frame.filename})`).join(', ')}`,
      render.error ? `- Error: ${safe(render.error)}` : '- Error: none', ''
    );
  }
  lines.push(report.error ? `Error: ${safe(report.error)}` : 'Error: none', '');
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, `${lines.join('\n')}\n`);
}

async function main() {
  ensureConfig();
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  try {
    const song = await chooseStressSong();
    for (const format of FORMATS) await createAndRender(song, format);
    report.status = report.renders.every(render => render.status === 'completed') ? 'completed' : 'failed';
    if (report.status !== 'completed') report.error = 'One or more format validations failed.';
  } catch (error) {
    report.status = 'failed'; report.error = error.message; console.error(error.stack || error.message);
  } finally {
    report.completed_at = new Date().toISOString();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(report, null, 2));
    writeReport();
  }
  if (report.status !== 'completed') process.exitCode = 1;
}

main().catch(error => {
  report.status = 'failed'; report.completed_at = new Date().toISOString(); report.error = error.message;
  try {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify(report, null, 2));
    writeReport();
  } catch {}
  console.error(error.stack || error.message); process.exitCode = 1;
});
