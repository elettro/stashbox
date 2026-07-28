import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API_BASE = String(process.env.API_BASE || '').replace(/\/+$/, '');
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
const JOB_ID = String(process.env.JOB_ID || 'ed85c085-40d8-425c-90af-3385821a1e34').trim();
const RESULT_PATH = String(process.env.RESULT_PATH || 'radio-api/docs/VIDEO_FACTORY_LONG_TITLE_3X4_RETRY_RESULT.md');
const OUTPUT_DIR = String(process.env.OUTPUT_DIR || '/tmp/video-factory-long-title-3x4-retry');
const FFMPEG_PATH = String(process.env.FFMPEG_PATH || '/usr/bin/ffmpeg');
const FFPROBE_PATH = String(process.env.FFPROBE_PATH || '/usr/bin/ffprobe');
const ACTIVE = new Set(['pending', 'preparing', 'rendering', 'uploading']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const report = {
  status: 'failed', started_at: new Date().toISOString(), completed_at: '',
  original_job_id: JOB_ID, retried_job_id: JOB_ID, initial_status: '',
  initial_error_message: '', initial_runtime: {}, retry_response: {}, final_status: '',
  final_error_message: '', final_runtime: {}, width: 0, height: 0,
  duration_seconds: 0, frame_rate: '', video_streams: 0, audio_streams: 0,
  downloaded_bytes: 0, output_filename: '', frames: [], error: ''
};

const safe = value => String(value ?? '').replace(/`/g, '\\`');

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
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text.slice(0, 2000) }; }
  if (!response.ok && !allowFailure) {
    throw new Error(`${options.method || 'GET'} ${pathname} returned ${response.status}: ${body.error || body.message || JSON.stringify(body).slice(0, 2000)}`);
  }
  return { response, body };
}

async function waitForNoActiveJob() {
  const deadline = Date.now() + 45 * 60 * 1000;
  while (Date.now() < deadline) {
    const { body } = await request('/admin/video-factory/jobs?limit=250');
    const active = (body.jobs || []).find(job => ACTIVE.has(job.status));
    if (!active) return;
    console.log(`[queue] Waiting for ${active.id} (${active.status})`);
    await sleep(15000);
  }
  throw new Error('Video Factory remained busy for more than 45 minutes.');
}

function probe(filePath) {
  const stdout = execFileSync(FFPROBE_PATH, [
    '-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration', '-of', 'json', filePath
  ], { encoding: 'utf8', timeout: 120000, maxBuffer: 30 * 1024 * 1024 });
  const parsed = JSON.parse(stdout || '{}');
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find(stream => stream.codec_type === 'video');
  return {
    width: Number(video?.width || 0), height: Number(video?.height || 0),
    duration_seconds: Number(parsed.format?.duration || 0), frame_rate: String(video?.r_frame_rate || ''),
    video_streams: streams.filter(stream => stream.codec_type === 'video').length,
    audio_streams: streams.filter(stream => stream.codec_type === 'audio').length
  };
}

function capture(videoPath, timestamp, outputPath) {
  execFileSync(FFMPEG_PATH, [
    '-hide_banner', '-loglevel', 'error', '-ss', String(timestamp), '-i', videoPath,
    '-frames:v', '1', '-q:v', '2', '-y', outputPath
  ], { encoding: 'utf8', timeout: 120000, maxBuffer: 20 * 1024 * 1024 });
  return fs.statSync(outputPath).size;
}

function writeReport() {
  const lines = [
    '# Video Factory Long-Title 3:4 Retry Validation', '',
    `Status: ${safe(report.status)}`, `Started: ${safe(report.started_at)}`,
    `Completed: ${safe(report.completed_at)}`, '',
    `- Original job ID: \`${safe(report.original_job_id)}\``,
    `- Retried job ID: \`${safe(report.retried_job_id)}\``,
    `- Initial status: ${safe(report.initial_status)}`,
    `- Initial error message: ${safe(report.initial_error_message)}`,
    `- Initial runtime: \`${safe(JSON.stringify(report.initial_runtime))}\``,
    `- Retry response: \`${safe(JSON.stringify(report.retry_response))}\``,
    `- Final status: ${safe(report.final_status)}`,
    `- Final error message: ${safe(report.final_error_message)}`,
    `- Final runtime: \`${safe(JSON.stringify(report.final_runtime))}\``,
    `- Dimensions: ${report.width}×${report.height}`,
    `- Duration: ${report.duration_seconds} seconds`,
    `- Frame rate: ${safe(report.frame_rate)}`,
    `- Video streams: ${report.video_streams}`,
    `- Audio streams: ${report.audio_streams}`,
    `- Downloaded bytes: ${report.downloaded_bytes}`,
    `- Output filename: \`${safe(report.output_filename)}\``,
    `- Frames: ${report.frames.map(frame => `${frame.timestamp}s (${frame.filename})`).join(', ')}`,
    report.error ? `- Error: ${safe(report.error)}` : '- Error: none', ''
  ];
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, lines.join('\n'));
}

async function main() {
  if (!API_BASE || !ADMIN_TOKEN) throw new Error('API_BASE and ADMIN_TOKEN are required.');
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  try {
    const before = await request(`/admin/video-factory/jobs/${encodeURIComponent(JOB_ID)}`);
    const initial = before.body.job || {};
    report.initial_status = initial.status || '';
    report.initial_error_message = initial.error_message || '';
    report.initial_runtime = initial.render_recipe?.runtime || {};

    await waitForNoActiveJob();
    const retry = await request(`/admin/video-factory/jobs/${encodeURIComponent(JOB_ID)}/retry`, { method: 'POST', body: '{}' });
    report.retry_response = retry.body;
    report.retried_job_id = retry.body.job?.id || retry.body.job_id || JOB_ID;

    const deadline = Date.now() + 60 * 60 * 1000;
    let finalJob = null;
    let last = '';
    while (Date.now() < deadline) {
      const current = await request(`/admin/video-factory/jobs/${encodeURIComponent(report.retried_job_id)}`);
      const job = current.body.job || {};
      const runtime = job.render_recipe?.runtime || {};
      const marker = `${job.status}:${runtime.progress_percent || 0}:${runtime.status_message || ''}`;
      if (marker !== last) { console.log(marker); last = marker; }
      if (job.status === 'completed' || ['failed', 'cancelled'].includes(job.status)) { finalJob = job; break; }
      await sleep(15000);
    }
    if (!finalJob) throw new Error('Retry did not reach a terminal state within 60 minutes.');

    report.final_status = finalJob.status || '';
    report.final_error_message = finalJob.error_message || '';
    report.final_runtime = finalJob.render_recipe?.runtime || {};
    report.output_filename = finalJob.output_filename || '';
    if (finalJob.status !== 'completed') {
      throw new Error(`Retried job ended as ${finalJob.status}: ${finalJob.error_message || report.final_runtime.status_message || ''}`);
    }

    const download = await request(`/admin/video-factory/jobs/${encodeURIComponent(report.retried_job_id)}/download`);
    if (!download.body.url) throw new Error('Download endpoint did not return a URL.');
    const response = await fetch(download.body.url);
    if (!response.ok) throw new Error(`Signed download returned ${response.status}.`);
    const videoPath = path.join(OUTPUT_DIR, report.output_filename || 'long-title-3x4.mp4');
    fs.writeFileSync(videoPath, Buffer.from(await response.arrayBuffer()));
    report.downloaded_bytes = fs.statSync(videoPath).size;
    Object.assign(report, probe(videoPath));
    if (report.width !== 1080 || report.height !== 1440) throw new Error(`Retry dimensions were ${report.width}x${report.height}.`);
    if (report.video_streams !== 1 || report.audio_streams < 1) throw new Error('Retry stream validation failed.');

    for (const timestamp of [0.5, 3, 7.5, 12, 14.5]) {
      const filename = `3x4-retry-${String(timestamp).replace('.', '_')}s.jpg`;
      const outputPath = path.join(OUTPUT_DIR, filename);
      report.frames.push({ timestamp, filename, bytes: capture(videoPath, timestamp, outputPath) });
    }
    report.status = 'completed';
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
  try { fs.mkdirSync(OUTPUT_DIR, { recursive: true }); writeReport(); } catch {}
  console.error(error.stack || error.message); process.exitCode = 1;
});
