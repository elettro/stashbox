import assert from 'node:assert/strict';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  generateThumbnail,
  probeDuration,
  renderFinalVideo,
  renderTimelineSegment,
  runCommand
} from '../src/ffmpeg.mjs';

const workDir = '/tmp/video-factory-smoke';
await mkdir(workDir, { recursive: true });

const stillPath = path.join(workDir, 'still.png');
const segmentPath = path.join(workDir, 'segment.mp4');
const audioPath = path.join(workDir, 'audio.wav');
const outputPath = path.join(workDir, 'video-factory-smoke.mp4');
const thumbnailPath = path.join(workDir, 'video-factory-smoke.jpg');

await runCommand('ffmpeg', [
  '-y',
  '-f', 'lavfi',
  '-i', 'testsrc2=size=640x360:rate=1',
  '-frames:v', '1',
  stillPath
]);

await renderTimelineSegment(
  {
    index: 0,
    asset_id: 'smoke-still',
    type: 'image',
    duration_seconds: 2,
    motion: {
      enabled: true,
      direction: 'top-left-to-bottom-right',
      zoom_mode: 'in',
      max_zoom: 1.08
    }
  },
  {
    inputPath: stillPath,
    outputPath: segmentPath,
    width: 640,
    height: 360,
    fps: 30,
    streamStderr: false
  }
);

await runCommand('ffmpeg', [
  '-y',
  '-f', 'lavfi',
  '-i', 'sine=frequency=440:sample_rate=48000:duration=2',
  '-c:a', 'pcm_s16le',
  audioPath
]);

const recipe = {
  seed: 'container-smoke-seed',
  width: 640,
  height: 360,
  song_title: 'Video Factory Smoke Test',
  artist: 'Stashbox Radio',
  album_name: 'DEV Renderer',
  audio: { start_seconds: 0 },
  overlays: {
    intro_enabled: true,
    outro_enabled: true,
    corner_bug_enabled: true,
    intro_duration_seconds: 0.8,
    outro_duration_seconds: 0.8,
    include_song: true,
    include_artist: true,
    include_album: true
  },
  metadata: {
    title: 'Video Factory Smoke Test',
    artist: 'Stashbox Radio',
    album: 'DEV Renderer',
    publisher: 'Elettro Incorporated',
    comment: 'Container smoke render with Ken Burns still motion'
  }
};

await renderFinalVideo({
  recipe,
  visualsPath: segmentPath,
  audioPath,
  outputPath,
  totalDuration: 2,
  streamStderr: false
});
await generateThumbnail(outputPath, thumbnailPath, 2);

const duration = await probeDuration(outputPath);
const segmentStat = await stat(segmentPath);
const videoStat = await stat(outputPath);
const thumbnailStat = await stat(thumbnailPath);

assert.ok(duration >= 1.9 && duration <= 2.1, `Unexpected MP4 duration ${duration}.`);
assert.ok(segmentStat.size > 10000, `Ken Burns segment is unexpectedly small: ${segmentStat.size}.`);
assert.ok(videoStat.size > 10000, `Smoke MP4 is unexpectedly small: ${videoStat.size}.`);
assert.ok(thumbnailStat.size > 1000, `Smoke thumbnail is unexpectedly small: ${thumbnailStat.size}.`);

console.log(JSON.stringify({
  success: true,
  ken_burns_motion: true,
  duration,
  segment_size_bytes: segmentStat.size,
  video_size_bytes: videoStat.size,
  thumbnail_size_bytes: thumbnailStat.size
}));
