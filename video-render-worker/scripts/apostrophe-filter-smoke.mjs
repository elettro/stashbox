import { spawnSync } from 'node:child_process';
import { buildOverlayFilter } from '../src/ffmpeg.mjs';

const filter = buildOverlayFilter({
  height: 1920,
  metadata: {
    title: "Hippy Speedball (I'm On My Way)",
    artist: 'Stashbox'
  },
  overlays: {
    intro_enabled: true,
    outro_enabled: true,
    corner_bug_enabled: true,
    intro_duration_seconds: 0.4,
    outro_duration_seconds: 0.5
  }
}, 1);

const result = spawnSync('ffmpeg', [
  '-hide_banner',
  '-loglevel', 'error',
  '-y',
  '-f', 'lavfi',
  '-i', 'color=c=black:s=320x568:d=1',
  '-vf', filter,
  '-t', '1',
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '/tmp/stashbox-apostrophe-filter-smoke.mp4'
], { encoding: 'utf8' });

if (result.status !== 0) {
  process.stderr.write(result.stderr || 'FFmpeg apostrophe smoke test failed.\n');
  process.exit(result.status || 1);
}

console.log('FFmpeg apostrophe overlay smoke test passed.');
