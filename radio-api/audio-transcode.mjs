import pg from 'pg';
import { MediaConvertClient, CreateJobCommand } from '@aws-sdk/client-mediaconvert';

const { Client } = pg;
const STREAM_BITRATE = Number(process.env.AUDIO_STREAM_BITRATE || 320000);
const STREAM_PREFIX = String(process.env.AUDIO_STREAM_PREFIX || 'streams').replace(/^\/+|\/+$/g, '');
const BATCH_LIMIT = Math.max(1, Math.min(50, Number(process.env.AUDIO_TRANSCODE_BATCH_LIMIT || 10)));

function getDbSchema() {
  const schema = String(process.env.PGSCHEMA || 'radio').trim();
  if (!/^[A-Za-z0-9_]+$/.test(schema)) throw new Error('Invalid PGSCHEMA.');
  return schema;
}

function qi(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function songsTable() {
  return `${qi(getDbSchema())}.${qi('songs')}`;
}

function getDbClient() {
  return new Client({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
  });
}

function getMediaConvertClient() {
  return new MediaConvertClient({
    region: process.env.MEDIACONVERT_REGION || process.env.AWS_REGION || 'us-east-1',
    endpoint: process.env.MEDIACONVERT_ENDPOINT || undefined
  });
}

async function ensureColumns(db) {
  await db.query(`
    ALTER TABLE ${songsTable()}
      ADD COLUMN IF NOT EXISTS audio_master_url TEXT,
      ADD COLUMN IF NOT EXISTS audio_stream_url TEXT,
      ADD COLUMN IF NOT EXISTS audio_master_format TEXT,
      ADD COLUMN IF NOT EXISTS audio_stream_format TEXT,
      ADD COLUMN IF NOT EXISTS audio_stream_bitrate INTEGER,
      ADD COLUMN IF NOT EXISTS audio_transcode_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS audio_transcode_error TEXT,
      ADD COLUMN IF NOT EXISTS audio_transcoded_at TIMESTAMPTZ
  `);
}

function clean(value) {
  return String(value ?? '').trim();
}

function safePathPart(value) {
  return clean(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'song';
}

function parseS3Location(value) {
  const raw = clean(value);
  if (!raw) return null;

  if (raw.startsWith('s3://')) {
    const withoutScheme = raw.slice(5);
    const slash = withoutScheme.indexOf('/');
    if (slash < 1) return null;
    return { bucket: withoutScheme.slice(0, slash), key: decodeURIComponent(withoutScheme.slice(slash + 1).split(/[?#]/)[0]) };
  }

  try {
    const url = new URL(raw);
    const host = url.hostname;
    const path = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const virtualHosted = host.match(/^(.+?)\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i);
    if (virtualHosted) return { bucket: virtualHosted[1], key: path };

    if (/^s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/i.test(host)) {
      const slash = path.indexOf('/');
      if (slash > 0) return { bucket: path.slice(0, slash), key: path.slice(slash + 1) };
    }
  } catch (_) {}

  return null;
}

function publicS3Url(bucket, key) {
  const customBase = clean(process.env.AUDIO_PUBLIC_BASE_URL).replace(/\/+$/, '');
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  if (customBase) return `${customBase}/${encodedKey}`;
  const region = process.env.UPLOAD_REGION || process.env.AWS_REGION || 'us-east-1';
  return `https://${bucket}.s3.${region}.amazonaws.com/${encodedKey}`;
}

function isWavUrl(value) {
  return /\.wav(?:[?#].*)?$/i.test(clean(value));
}

async function findSong(db, songKey) {
  const result = await db.query(
    `SELECT * FROM ${songsTable()} WHERE song_key = $1 LIMIT 1`,
    [songKey]
  );
  return result.rows[0] || null;
}

async function markFailed(db, songKey, error) {
  await db.query(
    `UPDATE ${songsTable()}
     SET audio_transcode_status = 'failed',
         audio_transcode_error = $2,
         updated_at = now()
     WHERE song_key = $1`,
    [songKey, clean(error?.message || error).slice(0, 2000)]
  );
}

async function startSongJob(db, mediaConvert, song) {
  const songKey = clean(song.song_key);
  const masterUrl = clean(song.audio_master_url || song.audio_url);

  if (!songKey || !masterUrl) return { skipped: true, reason: 'missing song key or audio URL' };
  if (!isWavUrl(masterUrl)) {
    await db.query(
      `UPDATE ${songsTable()}
       SET audio_master_url = COALESCE(NULLIF(audio_master_url, ''), audio_url),
           audio_master_format = COALESCE(NULLIF(audio_master_format, ''), 'source'),
           audio_transcode_status = 'not_required',
           audio_transcode_error = NULL,
           updated_at = now()
       WHERE song_key = $1`,
      [songKey]
    );
    return { skipped: true, reason: 'source is not WAV' };
  }

  const source = parseS3Location(masterUrl);
  if (!source) throw new Error(`WAV master is not an S3 URL: ${masterUrl}`);
  if (!process.env.MEDIACONVERT_ROLE_ARN) throw new Error('MEDIACONVERT_ROLE_ARN is required.');

  const destination = `s3://${source.bucket}/${STREAM_PREFIX}/${safePathPart(songKey)}/`;

  await db.query(
    `UPDATE ${songsTable()}
     SET audio_master_url = $2,
         audio_master_format = 'wav',
         audio_transcode_status = 'processing',
         audio_transcode_error = NULL,
         updated_at = now()
     WHERE song_key = $1`,
    [songKey, masterUrl]
  );

  try {
    const command = new CreateJobCommand({
      Role: process.env.MEDIACONVERT_ROLE_ARN,
      Queue: process.env.MEDIACONVERT_QUEUE_ARN || undefined,
      UserMetadata: {
        stashbox_song_key: songKey,
        stashbox_schema: getDbSchema(),
        stashbox_stream_bitrate: String(STREAM_BITRATE)
      },
      Settings: {
        Inputs: [{
          FileInput: `s3://${source.bucket}/${source.key}`,
          AudioSelectors: {
            'Audio Selector 1': { DefaultSelection: 'DEFAULT' }
          }
        }],
        OutputGroups: [{
          Name: 'Stashbox Radio MP3 Stream',
          OutputGroupSettings: {
            Type: 'FILE_GROUP_SETTINGS',
            FileGroupSettings: { Destination: destination }
          },
          Outputs: [{
            NameModifier: '-320',
            ContainerSettings: { Container: 'RAW' },
            AudioDescriptions: [{
              AudioSourceName: 'Audio Selector 1',
              CodecSettings: {
                Codec: 'MP3',
                Mp3Settings: {
                  Bitrate: STREAM_BITRATE,
                  Channels: 2,
                  RateControlMode: 'CBR'
                }
              }
            }]
          }]
        }]
      }
    });

    const result = await mediaConvert.send(command);
    return { started: true, song_key: songKey, job_id: result.Job?.Id || null };
  } catch (error) {
    await markFailed(db, songKey, error);
    throw error;
  }
}

function outputMp3FromEvent(event) {
  const groups = event?.detail?.outputGroupDetails || [];
  for (const group of groups) {
    for (const output of group?.outputDetails || []) {
      for (const path of output?.outputFilePaths || []) {
        if (/\.mp3$/i.test(path)) return path;
      }
    }
  }
  return '';
}

async function handleMediaConvertEvent(db, event) {
  const detail = event?.detail || {};
  const metadata = detail.userMetadata || {};
  const songKey = clean(metadata.stashbox_song_key);
  if (!songKey) return { ignored: true, reason: 'no Stashbox song metadata' };

  const status = clean(detail.status).toUpperCase();
  if (status === 'ERROR' || status === 'CANCELED') {
    await markFailed(db, songKey, detail.errorMessage || `MediaConvert ${status}`);
    return { success: false, song_key: songKey, status };
  }

  if (status !== 'COMPLETE') return { ignored: true, song_key: songKey, status };

  const outputPath = outputMp3FromEvent(event);
  const parsed = parseS3Location(outputPath);
  if (!parsed) throw new Error(`MediaConvert completed without an MP3 output path for ${songKey}.`);

  const streamUrl = publicS3Url(parsed.bucket, parsed.key);
  await db.query(
    `UPDATE ${songsTable()}
     SET audio_stream_url = $2,
         audio_stream_format = 'mp3',
         audio_stream_bitrate = $3,
         audio_transcode_status = 'ready',
         audio_transcode_error = NULL,
         audio_transcoded_at = now(),
         updated_at = now()
     WHERE song_key = $1`,
    [songKey, streamUrl, Number(metadata.stashbox_stream_bitrate || STREAM_BITRATE)]
  );

  return { success: true, song_key: songKey, stream_url: streamUrl };
}

async function pendingSongs(db) {
  const result = await db.query(
    `SELECT *
     FROM ${songsTable()}
     WHERE COALESCE(audio_stream_url, '') = ''
       AND COALESCE(audio_master_url, audio_url, '') ~* '\\.wav([?#].*)?$'
       AND COALESCE(audio_transcode_status, 'pending') IN ('pending', 'failed')
     ORDER BY updated_at ASC NULLS FIRST
     LIMIT $1`,
    [BATCH_LIMIT]
  );
  return result.rows;
}

async function handleSweep(db, mediaConvert) {
  const songs = await pendingSongs(db);
  const results = [];
  for (const song of songs) {
    try {
      results.push(await startSongJob(db, mediaConvert, song));
    } catch (error) {
      results.push({ started: false, song_key: song.song_key, error: clean(error?.message || error) });
    }
  }
  return { success: true, scanned: songs.length, results };
}

export async function handler(event = {}) {
  const db = getDbClient();
  await db.connect();
  try {
    await ensureColumns(db);

    if (event?.source === 'aws.mediaconvert') {
      return await handleMediaConvertEvent(db, event);
    }

    const mediaConvert = getMediaConvertClient();
    const requestedSongKey = clean(event.song_key || event.songKey);
    if (requestedSongKey) {
      const song = await findSong(db, requestedSongKey);
      if (!song) return { success: false, error: 'Song not found.', song_key: requestedSongKey };
      return await startSongJob(db, mediaConvert, song);
    }

    return await handleSweep(db, mediaConvert);
  } finally {
    await db.end().catch(() => {});
  }
}
