import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const API_BASE = String(process.env.API_BASE || '').replace(/\/+$/, '');
const ADMIN_TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
const OUTPUT_DIR = String(process.env.OUTPUT_DIR || '/tmp/video-factory-portrait-qa');
const REPORT_PATH = String(
  process.env.REPORT_PATH || 'radio-api/docs/VIDEO_FACTORY_PORTRAIT_VISUAL_QA.md'
);
const FFMPEG_PATH = String(process.env.FFMPEG_PATH || '/usr/bin/ffmpeg');
const FFPROBE_PATH = String(process.env.FFPROBE_PATH || '/usr/bin/ffprobe');
const RUN_ID = String(process.env.GITHUB_RUN_ID || 'unknown');

const JOBS = [
  {
    label: '3x4',
    ratio: '3:4',
    jobId: '2b50fca5-67ee-499f-a1ac-760f23ddd1be',
    expectedWidth: 1080,
    expectedHeight: 1440
  },
  {
    label: '4x5',
    ratio: '4:5',
    jobId: '66329e25-bec7-4921-8ea4-c96977c2cba8',
    expectedWidth: 1080,
    expectedHeight: 1350
  }
];

function ensureConfig() {
  if (!API_BASE) throw new Error('API_BASE is required.');
  if (!ADMIN_TOKEN) throw new Error('ADMIN_TOKEN is required.');
  if (!fs.existsSync(FFMPEG_PATH)) throw new Error(`FFmpeg not found at ${FFMPEG_PATH}.`);
  if (!fs.existsSync(FFPROBE_PATH)) throw new Error(`FFprobe not found at ${FFPROBE_PATH}.`);
}

async function apiRequest(pathname) {
  const response = await fetch(`${API_BASE}${pathname}`, {
    headers: {
      accept: 'application/json',
      'x-admin-token': ADMIN_TOKEN
    }
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 1000) };
  }
  if (!response.ok) {
    throw new Error(
      `GET ${pathname} returned ${response.status}: ${body.error || body.message || JSON.stringify(body)}`
    );
  }
  return body;
}

function probeVideo(filePath) {
  const stdout = execFileSync(
    FFPROBE_PATH,
    [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,width,height,r_frame_rate:format=duration',
      '-of', 'json',
      filePath
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 120000 }
  );
  const parsed = JSON.parse(stdout || '{}');
  const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
  const video = streams.find(stream => stream.codec_type === 'video');
  return {
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    frameRate: String(video?.r_frame_rate || ''),
    duration: Number(parsed.format?.duration || 0),
    videoStreams: streams.filter(stream => stream.codec_type === 'video').length,
    audioStreams: streams.filter(stream => stream.codec_type === 'audio').length
  };
}

function captureFrame(videoPath, timestamp, outputPath) {
  execFileSync(
    FFMPEG_PATH,
    [
      '-hide_banner', '-loglevel', 'error',
      '-ss', String(timestamp),
      '-i', videoPath,
      '-frames:v', '1',
      '-q:v', '2',
      '-y', outputPath
    ],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 120000 }
  );
  const stat = fs.statSync(outputPath);
  if (stat.size < 1000) throw new Error(`Captured frame is unexpectedly small: ${outputPath}`);
  return stat.size;
}

function writeReport(results) {
  const lines = [
    '# Video Factory Portrait Visual QA Artifact',
    '',
    `- GitHub Actions run ID: \`${RUN_ID}\``,
    `- Artifact name: \`video-factory-portrait-visual-qa\``,
    `- Captured: ${new Date().toISOString()}`,
    `- Status: ${results.every(result => result.status === 'completed') ? 'completed' : 'failed'}`,
    ''
  ];

  for (const result of results) {
    lines.push(
      `## ${result.ratio}`,
      '',
      `- Status: ${result.status}`,
      `- Job ID: \`${result.jobId}\``,
      `- Dimensions: ${result.width}×${result.height}`,
      `- Duration: ${result.duration} seconds`,
      `- Frame rate: ${result.frameRate}`,
      `- Video streams: ${result.videoStreams}`,
      `- Audio streams: ${result.audioStreams}`,
      `- MP4 bytes: ${result.videoBytes}`,
      `- Frames: ${result.frames.map(frame => `${frame.timestamp}s (${frame.filename})`).join(', ')}`,
      result.error ? `- Error: ${result.error}` : '- Error: none',
      ''
    );
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function processJob(job) {
  const result = {
    ...job,
    status: 'failed',
    width: 0,
    height: 0,
    duration: 0,
    frameRate: '',
    videoStreams: 0,
    audioStreams: 0,
    videoBytes: 0,
    frames: [],
    error: ''
  };

  try {
    const jobBody = await apiRequest(`/admin/video-factory/jobs/${job.jobId}`);
    if (jobBody.job?.status !== 'completed') {
      throw new Error(`Job status is ${jobBody.job?.status || 'unknown'}, expected completed.`);
    }

    const downloadBody = await apiRequest(`/admin/video-factory/jobs/${job.jobId}/download`);
    if (!downloadBody.url) throw new Error('Download endpoint did not return a signed URL.');

    const ratioDir = path.join(OUTPUT_DIR, job.label);
    fs.mkdirSync(ratioDir, { recursive: true });
    const videoPath = path.join(ratioDir, `${job.label}.mp4`);
    const download = await fetch(downloadBody.url);
    if (!download.ok) throw new Error(`Signed MP4 download returned ${download.status}.`);
    fs.writeFileSync(videoPath, Buffer.from(await download.arrayBuffer()));
    result.videoBytes = fs.statSync(videoPath).size;

    const probe = probeVideo(videoPath);
    Object.assign(result, {
      width: probe.width,
      height: probe.height,
      duration: Math.round(probe.duration * 1000) / 1000,
      frameRate: probe.frameRate,
      videoStreams: probe.videoStreams,
      audioStreams: probe.audioStreams
    });

    if (probe.width !== job.expectedWidth || probe.height !== job.expectedHeight) {
      throw new Error(
        `Video dimensions are ${probe.width}x${probe.height}; expected ${job.expectedWidth}x${job.expectedHeight}.`
      );
    }

    const timestamps = [0.5, 3, 7.5, 12, 14.5].filter(value => value < probe.duration);
    for (const timestamp of timestamps) {
      const filename = `${job.label}-${String(timestamp).replace('.', '_')}s.jpg`;
      const outputPath = path.join(ratioDir, filename);
      const bytes = captureFrame(videoPath, timestamp, outputPath);
      result.frames.push({ timestamp, filename, bytes });
    }

    result.status = 'completed';
  } catch (error) {
    result.error = error.message;
  }

  return result;
}

async function main() {
  ensureConfig();
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const results = [];
  for (const job of JOBS) results.push(await processJob(job));

  fs.writeFileSync(path.join(OUTPUT_DIR, 'manifest.json'), JSON.stringify({ runId: RUN_ID, results }, null, 2));
  writeReport(results);

  if (results.some(result => result.status !== 'completed')) process.exitCode = 1;
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
