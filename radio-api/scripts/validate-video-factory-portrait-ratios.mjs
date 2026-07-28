import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const API_BASE = String(process.env.API_BASE || '').replace(/\/+$/, '');
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
const RESULT_PATH = String(
  process.env.RESULT_PATH || 'radio-api/docs/VIDEO_FACTORY_3X4_4X5_VALIDATION_RESULT.md'
);

const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const report = {
  status: 'failed',
  started_at: new Date().toISOString(),
  completed_at: '',
  deployment_probe: '',
  invalid_ratio_rejected: false,
  song_key: '',
  song_title: '',
  artist: '',
  renders: [],
  error: ''
};

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
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 1000) };
  }

  if (!response.ok && !allowFailure) {
    const detail = body.error || body.message || JSON.stringify(body).slice(0, 1000);
    throw new Error(`${options.method || 'GET'} ${pathname} returned ${response.status}: ${detail}`);
  }

  return { response, body };
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function safe(value) {
  return String(value ?? '').replace(/`/g, '\\`');
}

function renderMarkdown(data) {
  const lines = [
    '# Video Factory 3:4 and 4:5 DEV Validation',
    '',
    `Status: ${safe(data.status)}`,
    `Started: ${safe(data.started_at)}`,
    `Completed: ${safe(data.completed_at)}`,
    '',
    `- Deployment probe: ${safe(data.deployment_probe)}`,
    `- Invalid 2:1 ratio rejected: ${data.invalid_ratio_rejected ? 'yes' : 'no'}`,
    `- Song: ${safe(data.artist)} — ${safe(data.song_title)}`,
    `- Song key: \`${safe(data.song_key)}\``,
    ''
  ];

  for (const render of data.renders) {
    lines.push(
      `## ${safe(render.aspect_ratio)} Render`,
      '',
      `- Status: ${safe(render.status)}`,
      `- Job ID: \`${safe(render.job_id)}\``,
      `- Batch ID: \`${safe(render.batch_id)}\``,
      `- Draft dimensions: ${safe(render.draft_width)}×${safe(render.draft_height)}`,
      `- Probed dimensions: ${safe(render.probed_width)}×${safe(render.probed_height)}`,
      `- Duration: ${safe(render.duration_seconds)} seconds`,
      `- Frame rate: ${safe(render.frame_rate)}`,
      `- Video streams: ${safe(render.video_streams)}`,
      `- Audio streams: ${safe(render.audio_streams)}`,
      `- Output filename: \`${safe(render.output_filename)}\``,
      `- Private bucket: \`${safe(render.output_bucket)}\``,
      `- Private key: \`${safe(render.output_key)}\``,
      `- Progress: ${safe(render.progress_percent)}%`,
      `- Status message: ${safe(render.status_message)}`,
      render.error ? `- Error: ${safe(render.error)}` : '- Error: none',
      ''
    );
  }

  lines.push(data.error ? `Error: ${safe(data.error)}` : 'Error: none', '');
  return lines.join('\n');
}

function writeReport() {
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, renderMarkdown(report));
}

function probeVideo(filePath) {
  const processResult = spawnSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'stream=index,codec_type,width,height,r_frame_rate:format=duration',
      '-of',
      'json',
      filePath
    ],
    { encoding: 'utf8' }
  );

  if (processResult.status !== 0) {
    throw new Error(`ffprobe failed: ${processResult.stderr || processResult.stdout}`);
  }

  const parsed = JSON.parse(processResult.stdout || '{}');
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find(stream => stream.codec_type === 'video');

  return {
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    frame_rate: String(video?.r_frame_rate || ''),
    duration_seconds: Number(parsed.format?.duration || 0),
    video_streams: streams.filter(stream => stream.codec_type === 'video').length,
    audio_streams: streams.filter(stream => stream.codec_type === 'audio').length
  };
}

async function waitForPortraitApi() {
  const deadline = Date.now() + 10 * 60 * 1000;
  let lastMarker = '';

  while (Date.now() < deadline) {
    const { response, body } = await request(
      '/admin/video-factory/jobs',
      {
        method: 'POST',
        body: JSON.stringify({
          song_key: '__portrait_ratio_probe__',
          duration_mode: 'custom',
          duration_seconds: 1,
          aspect_ratio: '4:5',
          fps: 30
        })
      },
      true
    );

    const marker = `${response.status}:${body.error || body.message || ''}`;
    if (marker !== lastMarker) {
      console.log(`[portrait API probe] ${marker}`);
      lastMarker = marker;
    }

    if (response.status === 404 && /song not found/i.test(String(body.error || body.message || ''))) {
      report.deployment_probe = '4:5 accepted by DEV API';
      return;
    }

    await sleep(15000);
  }

  throw new Error('DEV API did not accept 4:5 within 10 minutes.');
}

async function verifyInvalidRatioRejection() {
  const { response, body } = await request(
    '/admin/video-factory/jobs',
    {
      method: 'POST',
      body: JSON.stringify({
        song_key: '__invalid_ratio_probe__',
        duration_mode: 'custom',
        duration_seconds: 1,
        aspect_ratio: '2:1',
        fps: 30
      })
    },
    true
  );

  report.invalid_ratio_rejected =
    response.status === 400 && /aspect_ratio/i.test(String(body.error || body.message || ''));

  if (!report.invalid_ratio_rejected) {
    throw new Error(`Invalid 2:1 ratio was not rejected correctly. Status ${response.status}.`);
  }
}

async function chooseSong() {
  const { body } = await request('/admin/songs');
  const songs = Array.isArray(body.songs) ? body.songs : Array.isArray(body) ? body : [];

  const song =
    songs.find(item => {
      const title = normalize(item.display_title || item.song_name);
      const key = normalize(item.song_key);
      return title === 'space jam' || title.includes('space jam') || key.includes('space jam');
    }) || songs.find(item => String(item.audio_url || '').trim());

  if (!song) throw new Error('No DEV song with audio was available for portrait validation.');

  report.song_key = song.song_key;
  report.song_title = song.display_title || song.song_name || song.song_key;
  report.artist = song.artist || '';
  return song;
}

async function waitForNoActiveJob() {
  const deadline = Date.now() + 45 * 60 * 1000;

  while (Date.now() < deadline) {
    const { body } = await request('/admin/video-factory/jobs?limit=250');
    const active = (body.jobs || []).find(job => ACTIVE_STATUSES.has(job.status));
    if (!active) return;

    console.log(`[queue] Waiting for active job ${active.id} (${active.status})`);
    await sleep(15000);
  }

  throw new Error('Video Factory remained busy for more than 45 minutes.');
}

async function renderRatio(song, aspectRatio, expectedWidth, expectedHeight) {
  await waitForNoActiveJob();

  const entry = {
    aspect_ratio: aspectRatio,
    status: 'failed',
    job_id: '',
    batch_id: '',
    draft_width: 0,
    draft_height: 0,
    probed_width: 0,
    probed_height: 0,
    duration_seconds: 0,
    frame_rate: '',
    video_streams: 0,
    audio_streams: 0,
    output_filename: '',
    output_bucket: '',
    output_key: '',
    progress_percent: 0,
    status_message: '',
    error: ''
  };
  report.renders.push(entry);

  try {
    const { body: draftBody } = await request('/admin/video-factory/jobs', {
      method: 'POST',
      body: JSON.stringify({
        song_key: song.song_key,
        batch_name: `Portrait Ratio Validation ${aspectRatio}`,
        client_name: 'Stashbox Radio',
        project_name: 'Video Factory DEV Validation',
        campaign_name: '3x4 and 4x5 Validation',
        output_type: 'music_video',
        duration_mode: 'custom',
        duration_seconds: 15,
        aspect_ratio: aspectRatio,
        fps: 30,
        intro_enabled: true,
        outro_enabled: true,
        corner_bug_enabled: true,
        include_artist: true,
        include_song: true,
        include_album: true,
        filename_template: '{artist}_{song}_{duration}_{aspect}_v{variation}',
        metadata_comment: `Automated DEV validation for ${aspectRatio}.`
      })
    });

    const created = draftBody.job;
    if (!created?.id) throw new Error('Draft response did not include a job ID.');

    entry.job_id = created.id;
    entry.batch_id = created.batch_id;
    entry.draft_width = Number(created.width || 0);
    entry.draft_height = Number(created.height || 0);
    entry.output_filename = created.output_filename || '';

    if (
      created.aspect_ratio !== aspectRatio ||
      entry.draft_width !== expectedWidth ||
      entry.draft_height !== expectedHeight
    ) {
      throw new Error(
        `Draft dimensions were ${created.aspect_ratio} ${entry.draft_width}x${entry.draft_height}; expected ${aspectRatio} ${expectedWidth}x${expectedHeight}.`
      );
    }

    await request(`/admin/video-factory/jobs/${created.id}/render`, {
      method: 'POST',
      body: '{}'
    });

    const deadline = Date.now() + 45 * 60 * 1000;
    let completedJob = null;
    let lastMarker = '';

    while (Date.now() < deadline) {
      const { body } = await request(`/admin/video-factory/jobs/${created.id}`);
      const job = body.job;
      const runtime = job.render_recipe?.runtime || {};
      entry.progress_percent = Number(runtime.progress_percent || (job.status === 'completed' ? 100 : 0));
      entry.status_message = runtime.status_message || '';

      const marker = `${job.status}:${entry.progress_percent}:${entry.status_message}`;
      if (marker !== lastMarker) {
        console.log(`[${aspectRatio}] ${marker}`);
        lastMarker = marker;
      }

      if (job.status === 'completed') {
        completedJob = job;
        break;
      }
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(job.error_message || `Render ended with status ${job.status}.`);
      }

      await sleep(15000);
    }

    if (!completedJob) throw new Error(`Timed out waiting for ${aspectRatio} render.`);

    const output = Array.isArray(completedJob.outputs)
      ? completedJob.outputs.find(item => item.output_kind === 'master') || completedJob.outputs[0]
      : null;
    entry.output_bucket = output?.s3_bucket || '';
    entry.output_key = output?.s3_key || '';
    entry.output_filename = completedJob.output_filename || entry.output_filename;

    const { body: signed } = await request(`/admin/video-factory/jobs/${created.id}/download`);
    if (!signed.url) throw new Error('Download endpoint did not return a signed URL.');

    const target = `/tmp/video-factory-${aspectRatio.replace(':', 'x')}-${created.id}.mp4`;
    const download = await fetch(signed.url);
    if (!download.ok) throw new Error(`Signed download returned ${download.status}.`);
    fs.writeFileSync(target, Buffer.from(await download.arrayBuffer()));

    const media = probeVideo(target);
    entry.probed_width = media.width;
    entry.probed_height = media.height;
    entry.duration_seconds = Math.round(media.duration_seconds * 1000) / 1000;
    entry.frame_rate = media.frame_rate;
    entry.video_streams = media.video_streams;
    entry.audio_streams = media.audio_streams;

    if (media.width !== expectedWidth || media.height !== expectedHeight) {
      throw new Error(
        `Rendered MP4 was ${media.width}x${media.height}; expected ${expectedWidth}x${expectedHeight}.`
      );
    }
    if (media.duration_seconds < 14 || media.duration_seconds > 16.5) {
      throw new Error(`Rendered MP4 duration was ${media.duration_seconds}; expected about 15 seconds.`);
    }
    if (media.video_streams < 1) throw new Error('Rendered MP4 has no video stream.');
    if (media.audio_streams < 1) throw new Error('Rendered MP4 has no audio stream.');

    entry.status = 'completed';
    return entry;
  } catch (error) {
    entry.error = error.message;
    throw error;
  }
}

async function main() {
  try {
    if (!API_BASE) throw new Error('API_BASE is missing.');
    if (!ADMIN_TOKEN) throw new Error('STASHBOX_DEV_ADMIN_TOKEN is missing.');

    await waitForPortraitApi();
    await verifyInvalidRatioRejection();

    const { body: infrastructure } = await request('/admin/video-factory/infrastructure');
    if (!infrastructure.success || !infrastructure.configured) {
      throw new Error('Video Factory infrastructure did not return configured=true.');
    }

    const song = await chooseSong();
    await renderRatio(song, '3:4', 1080, 1440);
    await renderRatio(song, '4:5', 1080, 1350);

    report.status = 'completed';
    report.completed_at = new Date().toISOString();
  } catch (error) {
    report.status = 'failed';
    report.completed_at = new Date().toISOString();
    report.error = error.message;
    console.error(error.stack || error.message);
    process.exitCode = 1;
  } finally {
    writeReport();
  }
}

await main();
