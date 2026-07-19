import { createReadStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  concatenateSegments,
  generateThumbnail,
  probeDuration,
  renderFinalVideo,
  renderTimelineSegment
} from './ffmpeg.mjs';
import { buildRenderTimeline } from './timeline.mjs';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function stringValue(value) {
  return String(value || '').trim();
}

function safePathToken(value, fallback = 'item') {
  return stringValue(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '') || fallback;
}

function extensionForUrl(url, type = 'clip') {
  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.[a-z0-9]{2,5}$/.test(extension)) return extension;
  } catch (_) {}
  return type === 'image' ? '.jpg' : '.mp4';
}

async function apiRequest(apiBase, adminToken, pathname, options = {}) {
  const headers = {
    Accept: 'application/json',
    'x-admin-token': adminToken,
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`${apiBase.replace(/\/+$/, '')}${pathname}`, {
    ...options,
    headers,
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
  });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch (_) { body = { error: text.slice(0, 500) }; }
  if (!response.ok) {
    const error = new Error(body.error || `Video Factory API returned ${response.status}.`);
    error.statusCode = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function reportStatus(context, status, progressPercent, statusMessage, extra = {}) {
  return apiRequest(context.apiBase, context.adminToken, `/admin/video-factory/jobs/${encodeURIComponent(context.jobId)}/status`, {
    method: 'POST',
    body: {
      status,
      progress_percent: progressPercent,
      status_message: statusMessage,
      ...extra
    }
  });
}

async function downloadToFile(url, outputPath) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Asset download failed with HTTP ${response.status}: ${url}`);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStreamCompat(outputPath));
}

function createWriteStreamCompat(outputPath) {
  const { createWriteStream } = requireFs();
  return createWriteStream(outputPath);
}

function requireFs() {
  return globalThis.__vfFs || (globalThis.__vfFs = awaitImportFs());
}

function awaitImportFs() {
  // createWriteStream is loaded synchronously through Node's builtin module cache.
  return { createWriteStream: (...args) => import('node:fs').then(module => module.createWriteStream(...args)) };
}

async function streamDownload(url, outputPath) {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`Asset download failed with HTTP ${response.status}: ${url}`);
  const { createWriteStream } = await import('node:fs');
  await mkdir(path.dirname(outputPath), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(outputPath));
}

async function loadArtworkFallback(context, job, recipe) {
  const recipeArtwork = stringValue(recipe?.artwork?.url || recipe?.artwork_url);
  if (recipeArtwork) return recipeArtwork;
  try {
    const body = await apiRequest(context.apiBase, context.adminToken, '/radio/songs', { method: 'GET' });
    const songs = Array.isArray(body.songs) ? body.songs : [];
    const song = songs.find(item => String(item.song_key) === String(job.song_key));
    return stringValue(song?.resolved_artwork_url || song?.song_artwork_url);
  } catch (error) {
    console.warn('[Video Factory Worker] Artwork fallback lookup failed:', error.message);
    return '';
  }
}

async function loadVisualSettings(context, job) {
  try {
    const body = await apiRequest(
      context.apiBase,
      context.adminToken,
      `/radio/songs/${encodeURIComponent(job.song_key)}/visual-settings`,
      { method: 'GET' }
    );
    return {
      orderMode: stringValue(body.order_mode) || 'random',
      assets: Array.isArray(body.assets) ? body.assets : [],
      fallback: body.fallback || {}
    };
  } catch (error) {
    console.warn('[Video Factory Worker] VEC visual settings unavailable. Using artwork fallback.', error.message);
    return { orderMode: 'random', assets: [], fallback: { uses_artwork: true } };
  }
}

async function uploadFile(s3Client, bucket, key, filePath, contentType, metadata = {}) {
  const fileStat = await stat(filePath);
  await s3Client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: createReadStream(filePath),
    ContentType: contentType,
    ContentLength: fileStat.size,
    Metadata: Object.fromEntries(
      Object.entries(metadata)
        .map(([name, value]) => [safePathToken(name, 'meta'), stringValue(value).slice(0, 1800)])
        .filter(([, value]) => value)
    ),
    ServerSideEncryption: 'AES256'
  }));
  return fileStat.size;
}

async function main() {
  const context = {
    jobId: requiredEnv('JOB_ID'),
    apiBase: requiredEnv('VIDEO_FACTORY_API_BASE'),
    adminToken: requiredEnv('ADMIN_TOKEN'),
    outputBucket: requiredEnv('VIDEO_FACTORY_OUTPUT_BUCKET'),
    outputPrefix: stringValue(process.env.VIDEO_FACTORY_OUTPUT_PREFIX) || 'video-factory',
    region: stringValue(process.env.AWS_REGION) || 'us-east-1'
  };
  const workDir = path.join('/tmp', 'video-factory', safePathToken(context.jobId, 'job'));
  const assetsDir = path.join(workDir, 'assets');
  const segmentsDir = path.join(workDir, 'segments');
  await mkdir(assetsDir, { recursive: true });
  await mkdir(segmentsDir, { recursive: true });

  let job = null;
  try {
    await reportStatus(context, 'preparing', 2, 'Loading render job.');
    const jobBody = await apiRequest(context.apiBase, context.adminToken, `/admin/video-factory/jobs/${encodeURIComponent(context.jobId)}`, { method: 'GET' });
    job = jobBody.job;
    if (!job) throw new Error('Video Factory job payload is missing.');

    const recipe = { ...(job.render_recipe || {}) };
    const audioUrl = stringValue(recipe?.audio?.url);
    if (!audioUrl) throw new Error('The render recipe does not contain an audio URL.');

    const audioPath = path.join(workDir, `audio${extensionForUrl(audioUrl, 'clip')}`);
    await reportStatus(context, 'preparing', 5, 'Downloading song audio.');
    await streamDownload(audioUrl, audioPath);
    const audioDuration = await probeDuration(audioPath);
    const audioStart = Math.max(0, Number(recipe?.audio?.start_seconds || 0));
    const availableDuration = Math.max(0, audioDuration - audioStart);
    const requestedDuration = job.duration_mode === 'full'
      ? availableDuration
      : Math.min(Number(job.duration_seconds || availableDuration), availableDuration);
    if (!Number.isFinite(requestedDuration) || requestedDuration <= 0) throw new Error('The requested render duration is not available in the song audio.');

    const visualSettings = await loadVisualSettings(context, job);
    const artworkUrl = await loadArtworkFallback(context, job, recipe);
    const timeline = Array.isArray(recipe.timeline) && recipe.timeline.length
      ? recipe.timeline
      : buildRenderTimeline({
          total_duration_seconds: requestedDuration,
          segment_duration_seconds: Number(recipe?.visuals?.segment_duration_seconds || 8),
          order_mode: visualSettings.orderMode,
          seed: recipe.seed,
          assets: visualSettings.assets,
          artwork_url: artworkUrl
        });

    const frozenRecipe = {
      ...recipe,
      duration_seconds: Math.round(requestedDuration * 1000) / 1000,
      artwork: { ...(recipe.artwork || {}), url: artworkUrl },
      visuals: {
        ...(recipe.visuals || {}),
        source: 'vec-eligible-assets',
        order_mode: visualSettings.orderMode,
        eligible_asset_count: visualSettings.assets.length,
        segment_duration_seconds: Number(recipe?.visuals?.segment_duration_seconds || 8),
        frozen_at: new Date().toISOString()
      },
      timeline
    };
    await reportStatus(context, 'preparing', 10, `Prepared ${timeline.length} visual segments.`, { render_recipe: frozenRecipe });

    const assetCache = new Map();
    const segmentPaths = [];
    for (let index = 0; index < timeline.length; index += 1) {
      const segment = timeline[index];
      let inputPath = '';
      if (segment.type !== 'color' && segment.url) {
        if (!assetCache.has(segment.url)) {
          const extension = extensionForUrl(segment.url, segment.type);
          const assetPath = path.join(assetsDir, `${safePathToken(segment.asset_id, `asset-${index}`)}${extension}`);
          try {
            await streamDownload(segment.url, assetPath);
            assetCache.set(segment.url, assetPath);
          } catch (error) {
            console.warn(`[Video Factory Worker] Asset ${segment.asset_id} failed. Using black fallback.`, error.message);
            assetCache.set(segment.url, '');
          }
        }
        inputPath = assetCache.get(segment.url) || '';
      }

      const renderSegment = inputPath || segment.type === 'color'
        ? { ...segment, type: inputPath ? segment.type : 'color' }
        : { ...segment, type: 'color' };
      const segmentPath = path.join(segmentsDir, `segment-${String(index).padStart(4, '0')}.mp4`);
      await renderTimelineSegment(renderSegment, {
        inputPath,
        outputPath: segmentPath,
        width: job.width,
        height: job.height,
        fps: job.fps,
        streamStderr: false
      });
      segmentPaths.push(segmentPath);

      if (index === timeline.length - 1 || index % 3 === 0) {
        const progress = 12 + Math.round(((index + 1) / timeline.length) * 60);
        await reportStatus(context, 'rendering', progress, `Rendered visual segment ${index + 1} of ${timeline.length}.`, { render_recipe: frozenRecipe });
      }
    }

    const visualsPath = path.join(workDir, 'visuals-master.mp4');
    await concatenateSegments(segmentPaths, visualsPath, workDir);
    await reportStatus(context, 'rendering', 78, 'Applying audio, overlays, branding, and metadata.', { render_recipe: frozenRecipe });

    const outputFilename = safePathToken(job.output_filename.replace(/\.mp4$/i, ''), 'stashbox-video') + '.mp4';
    const outputPath = path.join(workDir, outputFilename);
    await renderFinalVideo({
      recipe: frozenRecipe,
      visualsPath,
      audioPath,
      outputPath,
      totalDuration: requestedDuration,
      streamStderr: false
    });

    const thumbnailPath = path.join(workDir, `${path.basename(outputFilename, '.mp4')}.jpg`);
    await generateThumbnail(outputPath, thumbnailPath, requestedDuration);
    await reportStatus(context, 'uploading', 94, 'Uploading private MP4 and thumbnail.', { render_recipe: frozenRecipe });

    const date = new Date().toISOString().slice(0, 10);
    const baseKey = [
      context.outputPrefix.replace(/^\/+|\/+$/g, ''),
      safePathToken(job.song_key, 'song'),
      date,
      safePathToken(job.id, 'job')
    ].join('/');
    const videoKey = `${baseKey}/${outputFilename}`;
    const thumbnailKey = `${baseKey}/${path.basename(thumbnailPath)}`;
    const s3Client = new S3Client({ region: context.region });
    const metadata = {
      job_id: job.id,
      batch_id: job.batch_id,
      song_key: job.song_key,
      artist: job.artist,
      title: job.song_title,
      album: job.album_name,
      aspect_ratio: job.aspect_ratio,
      render_seed: frozenRecipe.seed,
      source: 'stashbox-radio-video-factory'
    };
    const fileSize = await uploadFile(s3Client, context.outputBucket, videoKey, outputPath, 'video/mp4', metadata);
    await uploadFile(s3Client, context.outputBucket, thumbnailKey, thumbnailPath, 'image/jpeg', metadata);

    await apiRequest(context.apiBase, context.adminToken, `/admin/video-factory/jobs/${encodeURIComponent(context.jobId)}/complete`, {
      method: 'POST',
      body: {
        s3_bucket: context.outputBucket,
        s3_key: videoKey,
        thumbnail_s3_key: thumbnailKey,
        file_size_bytes: fileSize,
        duration_seconds: requestedDuration,
        width: job.width,
        height: job.height,
        metadata,
        render_recipe: frozenRecipe
      }
    });
    console.log('[Video Factory Worker] Render completed', { jobId: job.id, videoKey });
  } catch (error) {
    console.error('[Video Factory Worker] Render failed', {
      jobId: context.jobId,
      message: error.message,
      stack: error.stack
    });
    try {
      await reportStatus(context, 'failed', 0, 'Render failed.', {
        error_message: error.message,
        render_recipe: job?.render_recipe || undefined
      });
    } catch (statusError) {
      console.error('[Video Factory Worker] Failed to report error status', statusError);
    }
    process.exitCode = 1;
  }
}

await main();
