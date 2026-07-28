import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API_BASE = String(process.env.API_BASE || '').replace(/\/+$/, '');
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
const RESULT_PATH = String(
  process.env.RESULT_PATH || 'radio-api/docs/VIDEO_FACTORY_3X4_4X5_VALIDATION_RESULT.md'
);
const FFPROBE_PATH = String(process.env.FFPROBE_PATH || '/usr/bin/ffprobe').trim();
const PREFERRED_3X4_JOB_ID = String(
  process.env.EXISTING_3X4_JOB_ID || '2b50fca5-67ee-499f-a1ac-760f23ddd1be'
).trim();

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

function writeReport() {
  const lines = [
    '# Video Factory 3:4 and 4:5 DEV Validation',
    '',
    `Status: ${safe(report.status)}`,
    `Started: ${safe(report.started_at)}`,
    `Completed: ${safe(report.completed_at)}`,
    '',
    `- Deployment probe: ${safe(report.deployment_probe)}`,
    `- Invalid 2:1 ratio rejected: ${report.invalid_ratio_rejected ? 'yes' : 'no'}`,
    `- Song: ${safe(report.artist)} — ${safe(report.song_title)}`,
    `- Song key: \`${safe(report.song_key)}\``,
    `- FFprobe executable: \`${safe(FFPROBE_PATH)}\``,
    ''
  ];

  for (const render of report.renders) {
    lines.push(
      `## ${safe(render.aspect_ratio)} Render`,
      '',
      `- Status: ${safe(render.status)}`,
      `- Reused existing render: ${render.reused_existing ? 'yes' : 'no'}`,
      `- Job ID: \`${safe(render.job_id)}\``,
      `- Batch ID: \`${safe(render.batch_id)}\``,
      `- Draft dimensions: ${safe(render.draft_width)}×${safe(render.draft_height)}`,
      `- Output-record dimensions: ${safe(render.output_width)}×${safe(render.output_height)}`,
      `- Probed dimensions: ${safe(render.probed_width)}×${safe(render.probed_height)}`,
      `- Duration: ${safe(render.duration_seconds)} seconds`,
      `- Frame rate: ${safe(render.frame_rate)}`,
      `- Video streams: ${safe(render.video_streams)}`,
      `- Audio streams: ${safe(render.audio_streams)}`,
      `- Downloaded bytes: ${safe(render.downloaded_bytes)}`,
      `- Download content type: ${safe(render.download_content_type)}`,
      `- Output filename: \`${safe(render.output_filename)}\``,
      `- Private bucket: \`${safe(render.output_bucket)}\``,
      `- Private key: \`${safe(render.output_key)}\``,
      `- Progress: ${safe(render.progress_percent)}%`,
      `- Status message: ${safe(render.status_message)}`,
      render.error ? `- Error: ${safe(render.error)}` : '- Error: none',
      ''
    );
  }

  lines.push(report.error ? `Error: ${safe(report.error)}` : 'Error: none', '');
  fs.mkdirSync(path.dirname(RESULT_PATH), { recursive: true });
  fs.writeFileSync(RESULT_PATH, lines.join('\n'));
}

function probeVideo(filePath) {
  try {
    const stdout = execFileSync(
      FFPROBE_PATH,
      [
        '-v',
        'error',
        '-show_entries',
        'stream=index,codec_type,width,height,r_frame_rate:format=duration',
        '-of',
        'json',
        filePath
      ],
      {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 120000,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    const parsed = JSON.parse(stdout || '{}');
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
  } catch (error) {
    const stderr = Buffer.isBuffer(error.stderr) ? error.stderr.toString('utf8') : String(error.stderr || '');
    const stdout = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : String(error.stdout || '');
    throw new Error(
      `ffprobe inspection failed. code=${error.status ?? error.code ?? 'unknown'} signal=${error.signal || 'none'} message=${error.message}; stderr=${stderr.slice(-2000)}; stdout=${stdout.slice(-1000)}`
    );
  }
}

async function verifyApiContract() {
  const probe = await request(
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

  if (probe.response.status !== 404 || !/song not found/i.test(String(probe.body.error || ''))) {
    throw new Error(
      `DEV API did not accept the 4:5 contract. Status ${probe.response.status}: ${probe.body.error || probe.body.message || ''}`
    );
  }
  report.deployment_probe = '4:5 accepted by DEV API';

  const invalid = await request(
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
    invalid.response.status === 400 && /aspect_ratio/i.test(String(invalid.body.error || invalid.body.message || ''));
  if (!report.invalid_ratio_rejected) {
    throw new Error(`Invalid 2:1 ratio was not rejected correctly. Status ${invalid.response.status}.`);
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

function makeEntry(aspectRatio, reusedExisting) {
  return {
    aspect_ratio: aspectRatio,
    reused_existing: reusedExisting,
    status: 'failed',
    job_id: '',
    batch_id: '',
    draft_width: 0,
    draft_height: 0,
    output_width: 0,
    output_height: 0,
    probed_width: 0,
    probed_height: 0,
    duration_seconds: 0,
    frame_rate: '',
    video_streams: 0,
    audio_streams: 0,
    downloaded_bytes: 0,
    download_content_type: '',
    output_filename: '',
    output_bucket: '',
    output_key: '',
    progress_percent: 0,
    status_message: '',
    error: ''
  };
}

async function getCompletedJob(jobId) {
  const { body } = await request(`/admin/video-factory/jobs/${encodeURIComponent(jobId)}`);
  if (body.job?.status !== 'completed') {
    throw new Error(`Existing job ${jobId} is ${body.job?.status || 'missing'}, not completed.`);
  }
  return body.job;
}

async function findReusable3x4Job() {
  if (PREFERRED_3X4_JOB_ID) {
    try {
      return await getCompletedJob(PREFERRED_3X4_JOB_ID);
    } catch (error) {
      console.log(`[3:4] Preferred job unavailable: ${error.message}`);
    }
  }

  const { body } = await request('/admin/video-factory/jobs?limit=250');
  const match = (body.jobs || []).find(
    job =>
      job.status === 'completed' &&
      job.aspect_ratio === '3:4' &&
      Number(job.width) === 1080 &&
      Number(job.height) === 1440 &&
      Number(job.duration_seconds) === 15
  );
  if (!match) throw new Error('No completed 15-second 3:4 render was found for reuse.');
  return getCompletedJob(match.id);
}

async function createAndComplete4x5(song) {
  await waitForNoActiveJob();
  const { body: jobsBody } = await request('/admin/video-factory/jobs?limit=250');
  const existing = (jobsBody.jobs || []).find(
    job =>
      job.status === 'completed' &&
      job.aspect_ratio === '4:5' &&
      Number(job.width) === 1080 &&
      Number(job.height) === 1350 &&
      Number(job.duration_seconds) === 15
  );
  if (existing) return { job: await getCompletedJob(existing.id), reused: true };

  const { body: draftBody } = await request('/admin/video-factory/jobs', {
    method: 'POST',
    body: JSON.stringify({
      song_key: song.song_key,
      batch_name: 'Portrait Ratio Validation 4:5',
      client_name: 'Stashbox Radio',
      project_name: 'Video Factory DEV Validation',
      campaign_name: '3x4 and 4x5 Validation',
      output_type: 'music_video',
      duration_mode: 'custom',
      duration_seconds: 15,
      aspect_ratio: '4:5',
      fps: 30,
      intro_enabled: true,
      outro_enabled: true,
      corner_bug_enabled: true,
      include_artist: true,
      include_song: true,
      include_album: true,
      filename_template: '{artist}_{song}_{duration}_{aspect}_v{variation}',
      metadata_comment: 'Automated DEV validation for 4:5.'
    })
  });

  const created = draftBody.job;
  if (!created?.id) throw new Error('4:5 draft response did not include a job ID.');
  if (created.aspect_ratio !== '4:5' || Number(created.width) !== 1080 || Number(created.height) !== 1350) {
    throw new Error(`4:5 draft returned ${created.aspect_ratio} ${created.width}x${created.height}.`);
  }

  await request(`/admin/video-factory/jobs/${created.id}/render`, { method: 'POST', body: '{}' });
  const deadline = Date.now() + 45 * 60 * 1000;
  let lastMarker = '';

  while (Date.now() < deadline) {
    const { body } = await request(`/admin/video-factory/jobs/${created.id}`);
    const job = body.job;
    const runtime = job.render_recipe?.runtime || {};
    const marker = `${job.status}:${runtime.progress_percent || 0}:${runtime.status_message || ''}`;
    if (marker !== lastMarker) {
      console.log(`[4:5] ${marker}`);
      lastMarker = marker;
    }
    if (job.status === 'completed') return { job, reused: false };
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.error_message || `4:5 render ended with status ${job.status}.`);
    }
    await sleep(15000);
  }

  throw new Error('Timed out waiting for the 4:5 render.');
}

async function inspectJob(job, expectedAspect, expectedWidth, expectedHeight, reusedExisting) {
  const entry = makeEntry(expectedAspect, reusedExisting);
  report.renders.push(entry);

  try {
    entry.job_id = job.id;
    entry.batch_id = job.batch_id;
    entry.draft_width = Number(job.width || 0);
    entry.draft_height = Number(job.height || 0);
    entry.output_filename = job.output_filename || '';
    entry.progress_percent = Number(job.render_recipe?.runtime?.progress_percent || 100);
    entry.status_message = job.render_recipe?.runtime?.status_message || 'Render completed.';

    if (
      job.aspect_ratio !== expectedAspect ||
      entry.draft_width !== expectedWidth ||
      entry.draft_height !== expectedHeight
    ) {
      throw new Error(
        `Job dimensions were ${job.aspect_ratio} ${entry.draft_width}x${entry.draft_height}; expected ${expectedAspect} ${expectedWidth}x${expectedHeight}.`
      );
    }

    const output = Array.isArray(job.outputs)
      ? job.outputs.find(item => item.output_kind === 'master') || job.outputs[0]
      : null;
    if (!output) throw new Error('Completed job did not include a master output record.');

    entry.output_bucket = output.s3_bucket || '';
    entry.output_key = output.s3_key || '';
    entry.output_width = Number(output.width || 0);
    entry.output_height = Number(output.height || 0);

    const { body: signed } = await request(`/admin/video-factory/jobs/${job.id}/download`);
    if (!signed.url) throw new Error('Download endpoint did not return a signed URL.');

    const target = `/tmp/video-factory-${expectedAspect.replace(':', 'x')}-${job.id}.mp4`;
    const download = await fetch(signed.url);
    entry.download_content_type = download.headers.get('content-type') || '';
    if (!download.ok) throw new Error(`Signed download returned ${download.status}.`);

    const bytes = Buffer.from(await download.arrayBuffer());
    fs.writeFileSync(target, bytes);
    entry.downloaded_bytes = bytes.length;
    if (bytes.length < 10000) {
      throw new Error(`Downloaded MP4 was unexpectedly small at ${bytes.length} bytes.`);
    }

    console.log(
      `[${expectedAspect}] Downloaded ${bytes.length} bytes as ${entry.download_content_type || 'unknown content type'} to ${target}`
    );

    const media = probeVideo(target);
    entry.probed_width = media.width;
    entry.probed_height = media.height;
    entry.duration_seconds = Math.round(media.duration_seconds * 1000) / 1000;
    entry.frame_rate = media.frame_rate;
    entry.video_streams = media.video_streams;
    entry.audio_streams = media.audio_streams;

    if (media.width !== expectedWidth || media.height !== expectedHeight) {
      throw new Error(`Rendered MP4 was ${media.width}x${media.height}; expected ${expectedWidth}x${expectedHeight}.`);
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
    if (!fs.existsSync(FFPROBE_PATH)) throw new Error(`FFprobe executable not found at ${FFPROBE_PATH}.`);

    await verifyApiContract();
    const { body: infrastructure } = await request('/admin/video-factory/infrastructure');
    if (!infrastructure.success || !infrastructure.configured) {
      throw new Error('Video Factory infrastructure did not return configured=true.');
    }

    const song = await chooseSong();
    const job3x4 = await findReusable3x4Job();
    await inspectJob(job3x4, '3:4', 1080, 1440, true);

    const result4x5 = await createAndComplete4x5(song);
    await inspectJob(result4x5.job, '4:5', 1080, 1350, result4x5.reused);

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
