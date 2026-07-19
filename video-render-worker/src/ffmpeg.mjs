import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function stringValue(value) {
  return String(value || '').trim();
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => {
      const text = chunk.toString();
      stderr += text;
      if (options.streamStderr) process.stderr.write(text);
    });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) return resolve({ stdout, stderr });
      const error = new Error(`${command} exited with code ${code}. ${stderr.slice(-2000)}`);
      error.code = code;
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

export async function probeDuration(filePath) {
  const result = await runCommand('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ]);
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine media duration for ${filePath}.`);
  }
  return duration;
}

function segmentVideoFilter({ width, height, fps, duration }) {
  const fadeDuration = Math.min(0.3, Math.max(0.08, duration / 8));
  const fadeOutStart = Math.max(0, duration - fadeDuration);
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `fps=${fps}`,
    'setsar=1',
    'format=yuv420p',
    `fade=t=in:st=0:d=${fadeDuration.toFixed(3)}`,
    `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}`
  ].join(',');
}

export async function renderTimelineSegment(segment, options = {}) {
  const width = Number(options.width || 1920);
  const height = Number(options.height || 1080);
  const fps = Number(options.fps || 30);
  const duration = Number(segment.duration_seconds);
  const outputPath = options.outputPath;
  const filter = segmentVideoFilter({ width, height, fps, duration });
  const commonOutput = [
    '-t', duration.toFixed(3),
    '-vf', filter,
    '-an',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '21',
    '-pix_fmt', 'yuv420p',
    '-r', String(fps),
    '-video_track_timescale', '90000',
    '-movflags', '+faststart',
    outputPath
  ];

  if (segment.type === 'color') {
    return runCommand('ffmpeg', [
      '-y',
      '-f', 'lavfi',
      '-i', `color=c=black:s=${width}x${height}:r=${fps}`,
      ...commonOutput
    ], { streamStderr: options.streamStderr });
  }

  if (!options.inputPath) {
    throw new Error(`Input file is required for timeline segment ${segment.index}.`);
  }
  if (segment.type === 'image') {
    return runCommand('ffmpeg', [
      '-y',
      '-loop', '1',
      '-i', options.inputPath,
      ...commonOutput
    ], { streamStderr: options.streamStderr });
  }

  return runCommand('ffmpeg', [
    '-y',
    '-stream_loop', '-1',
    '-i', options.inputPath,
    ...commonOutput
  ], { streamStderr: options.streamStderr });
}

export async function concatenateSegments(segmentPaths, outputPath, workDir) {
  if (!segmentPaths.length) throw new Error('At least one timeline segment is required.');
  await mkdir(workDir, { recursive: true });
  const concatPath = path.join(workDir, 'segments.txt');
  const lines = segmentPaths
    .map(filePath => `file '${filePath.replace(/'/g, "'\\''")}'`)
    .join('\n');
  await writeFile(concatPath, `${lines}\n`, 'utf8');
  await runCommand('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', concatPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath
  ]);
}

export function escapeDrawtext(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function between(start, end) {
  return `between(t\\,${Number(start).toFixed(3)}\\,${Number(end).toFixed(3)})`;
}

function drawText({ fontFile, text, size, x, y, enable, box = true, opacity = 0.52 }) {
  const options = [
    `fontfile=${escapeDrawtext(fontFile)}`,
    `text='${escapeDrawtext(text)}'`,
    'fontcolor=white',
    `fontsize=${Math.round(size)}`,
    `x=${x}`,
    `y=${y}`,
    'shadowcolor=black@0.8',
    'shadowx=2',
    'shadowy=2'
  ];
  if (box) options.push('box=1', `boxcolor=black@${opacity}`, 'boxborderw=18');
  if (enable) options.push(`enable='${enable}'`);
  return `drawtext=${options.join(':')}`;
}

export function buildOverlayFilter(
  recipe,
  totalDuration,
  fontFile = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
) {
  const overlays = recipe?.overlays || {};
  const metadata = recipe?.metadata || {};
  const height = Number(recipe?.height || 1080);
  const title = stringValue(metadata.title || recipe?.song_title);
  const artist = stringValue(metadata.artist || recipe?.artist);
  const album = stringValue(metadata.album || recipe?.album_name);
  const introDuration = Math.min(numberValue(overlays.intro_duration_seconds, 4), totalDuration);
  const outroDuration = Math.min(numberValue(overlays.outro_duration_seconds, 5), totalDuration);
  const outroStart = Math.max(0, totalDuration - outroDuration);
  const filters = [];
  const titleSize = Math.max(34, height * 0.058);
  const secondarySize = Math.max(24, height * 0.034);
  const identityX = 'w*0.05';

  const addIdentityBlock = (start, end) => {
    const enable = between(start, end);
    if (overlays.include_artist !== false && artist) {
      filters.push(drawText({
        fontFile,
        text: artist,
        size: secondarySize,
        x: identityX,
        y: 'h*0.67',
        enable
      }));
    }
    if (overlays.include_song !== false && title) {
      filters.push(drawText({
        fontFile,
        text: title,
        size: titleSize,
        x: identityX,
        y: 'h*0.75',
        enable
      }));
    }
    if (overlays.include_album !== false && album) {
      filters.push(drawText({
        fontFile,
        text: album,
        size: secondarySize * 0.82,
        x: identityX,
        y: 'h*0.86',
        enable
      }));
    }
  };

  if (overlays.intro_enabled !== false && introDuration > 0) {
    addIdentityBlock(0, introDuration);
  }
  if (overlays.outro_enabled !== false && outroDuration > 0) {
    addIdentityBlock(outroStart, totalDuration);
  }
  if (overlays.corner_bug_enabled !== false) {
    filters.push(drawText({
      fontFile,
      text: 'STASHBOX RADIO',
      size: Math.max(18, height * 0.021),
      x: 'w-text_w-32',
      y: '28',
      box: true,
      opacity: 0.38
    }));
  }

  return filters.join(',');
}

export async function renderFinalVideo(options = {}) {
  const recipe = options.recipe || {};
  const totalDuration = Number(options.totalDuration);
  const audioStart = Math.max(0, numberValue(recipe?.audio?.start_seconds, 0));
  const overlayFilter = buildOverlayFilter(recipe, totalDuration, options.fontFile);
  const args = ['-y', '-i', options.visualsPath];
  if (audioStart > 0) args.push('-ss', audioStart.toFixed(3));
  args.push('-i', options.audioPath);
  args.push('-map', '0:v:0', '-map', '1:a:0');
  if (overlayFilter) args.push('-vf', overlayFilter);
  args.push(
    '-t', totalDuration.toFixed(3),
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '19',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '320k',
    '-ar', '48000',
    '-movflags', '+faststart',
    '-metadata', `title=${stringValue(recipe?.metadata?.title || recipe?.song_title)}`,
    '-metadata', `artist=${stringValue(recipe?.metadata?.artist || recipe?.artist)}`,
    '-metadata', `album=${stringValue(recipe?.metadata?.album || recipe?.album_name)}`,
    '-metadata', `publisher=${stringValue(recipe?.metadata?.publisher || 'Elettro Incorporated')}`,
    '-metadata', `comment=${stringValue(recipe?.metadata?.comment || 'Rendered by Stashbox Radio Video Factory')}`,
    '-metadata', `description=Stashbox Radio Video Factory render ${stringValue(recipe?.seed)}`,
    options.outputPath
  );
  return runCommand('ffmpeg', args, { streamStderr: options.streamStderr });
}

export async function generateThumbnail(videoPath, outputPath, duration) {
  const seek = Math.max(0, Math.min(2, Number(duration || 1) * 0.1));
  return runCommand('ffmpeg', [
    '-y',
    '-ss', seek.toFixed(3),
    '-i', videoPath,
    '-frames:v', '1',
    '-q:v', '2',
    outputPath
  ]);
}
