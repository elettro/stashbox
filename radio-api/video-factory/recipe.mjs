import crypto from 'node:crypto';

const RATIO_DIMENSIONS = Object.freeze({
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '3:4': { width: 1080, height: 1440 },
  '1:1': { width: 1080, height: 1080 }
});

export const VIDEO_FACTORY_DEFAULTS = Object.freeze({
  aspect_ratio: '16:9',
  fps: 30,
  duration_mode: 'full',
  output_type: 'music_video',
  filename_template: '{artist}_{song}_{duration}_{aspect}_v{variation}',
  variation: 1
});

export function sanitizeFilenameToken(value, fallback = 'stashbox') {
  const cleaned = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

export function getDimensionsForAspectRatio(aspectRatio, overrides = {}) {
  const normalized = String(aspectRatio || VIDEO_FACTORY_DEFAULTS.aspect_ratio).trim();
  const defaults = RATIO_DIMENSIONS[normalized];
  if (!defaults) throw new Error('Unsupported aspect ratio. Use 16:9, 9:16, 3:4, or 1:1.');

  const width = Number(overrides.width || defaults.width);
  const height = Number(overrides.height || defaults.height);
  if (!Number.isInteger(width) || width < 320 || !Number.isInteger(height) || height < 320) {
    throw new Error('Video dimensions must be whole numbers of at least 320 pixels.');
  }

  return { width, height };
}

export function normalizeDuration(input = {}) {
  const rawMode = String(input.duration_mode || input.durationMode || VIDEO_FACTORY_DEFAULTS.duration_mode).trim().toLowerCase();
  const durationMode = ['full', 'promo', 'custom'].includes(rawMode) ? rawMode : VIDEO_FACTORY_DEFAULTS.duration_mode;
  const rawSeconds = input.duration_seconds ?? input.durationSeconds;
  const numericSeconds = rawSeconds == null || rawSeconds === '' ? null : Number(rawSeconds);

  if (durationMode === 'full') return { duration_mode: 'full', duration_seconds: null };
  if (!Number.isFinite(numericSeconds) || numericSeconds <= 0) {
    throw new Error('A positive duration_seconds value is required for promo and custom renders.');
  }

  return { duration_mode: durationMode, duration_seconds: Math.round(numericSeconds * 1000) / 1000 };
}

export function buildOutputFilename(template, context = {}) {
  const duration = context.duration_mode === 'full'
    ? 'full-song'
    : `${Math.round(Number(context.duration_seconds || 0))}s`;
  const replacements = {
    artist: sanitizeFilenameToken(context.artist, 'artist'),
    song: sanitizeFilenameToken(context.song_title || context.song_name || context.song_key, 'song'),
    album: sanitizeFilenameToken(context.album_name, 'single'),
    duration,
    aspect: String(context.aspect_ratio || '16:9').replace(':', 'x'),
    resolution: `${context.width || 1920}x${context.height || 1080}`,
    variation: String(context.variation || 1).padStart(2, '0'),
    jobId: sanitizeFilenameToken(context.job_id, 'job'),
    batchId: sanitizeFilenameToken(context.batch_id, 'batch'),
    date: String(context.date || new Date().toISOString().slice(0, 10))
  };

  const sourceTemplate = String(template || VIDEO_FACTORY_DEFAULTS.filename_template);
  const rendered = sourceTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (match, token) => replacements[token] ?? '');
  const normalized = rendered
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '') || 'stashbox-video';

  return normalized.toLowerCase().endsWith('.mp4') ? normalized : `${normalized}.mp4`;
}

export function buildInitialRenderRecipe(input = {}) {
  const aspectRatio = String(input.aspect_ratio || input.aspectRatio || VIDEO_FACTORY_DEFAULTS.aspect_ratio).trim();
  const { width, height } = getDimensionsForAspectRatio(aspectRatio, input);
  const duration = normalizeDuration(input);
  const fps = Number(input.fps || VIDEO_FACTORY_DEFAULTS.fps);
  if (!Number.isInteger(fps) || fps < 24 || fps > 60) throw new Error('fps must be a whole number between 24 and 60.');

  return {
    recipe_version: 1,
    source: 'stashbox-radio-video-factory',
    song_key: String(input.song_key || input.songKey || '').trim(),
    song_title: String(input.song_title || input.songTitle || input.song_name || '').trim(),
    artist: String(input.artist || '').trim(),
    album_name: String(input.album_name || input.albumName || '').trim(),
    output_type: String(input.output_type || input.outputType || VIDEO_FACTORY_DEFAULTS.output_type).trim(),
    aspect_ratio: aspectRatio,
    width,
    height,
    fps,
    ...duration,
    variation: Number(input.variation || VIDEO_FACTORY_DEFAULTS.variation),
    seed: String(input.seed || crypto.randomUUID()),
    audio: {
      url: String(input.audio_url || input.audioUrl || '').trim(),
      start_seconds: Number(input.audio_start_seconds || input.audioStartSeconds || 0)
    },
    overlays: {
      intro_enabled: input.intro_enabled ?? input.introEnabled ?? true,
      outro_enabled: input.outro_enabled ?? input.outroEnabled ?? true,
      corner_bug_enabled: input.corner_bug_enabled ?? input.cornerBugEnabled ?? true,
      intro_duration_seconds: Number(input.intro_duration_seconds || input.introDurationSeconds || 4),
      outro_duration_seconds: Number(input.outro_duration_seconds || input.outroDurationSeconds || 5),
      include_artist: input.include_artist ?? input.includeArtist ?? true,
      include_song: input.include_song ?? input.includeSong ?? true,
      include_album: input.include_album ?? input.includeAlbum ?? true
    },
    metadata: {
      title: String(input.song_title || input.songTitle || input.song_name || '').trim(),
      artist: String(input.artist || '').trim(),
      album: String(input.album_name || input.albumName || '').trim(),
      publisher: String(input.publisher || 'Elettro Incorporated').trim(),
      comment: String(input.metadata_comment || input.metadataComment || 'Rendered by Stashbox Radio Video Factory').trim()
    },
    timeline: [],
    created_at: new Date().toISOString()
  };
}
