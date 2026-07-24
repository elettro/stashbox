import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

test('player STASHBOX wordmark invokes the same close action as the back arrow', () => {
  const html = read('radio/dev/v2/index.html');
  const recovery = read('radio/dev/v2/v2-recovery.js');
  const bridge = read('radio/dev/v2/v2-player-fluid-home.js');

  assert.match(recovery, /data-close/);
  assert.match(recovery, /v2-player-mark/);
  assert.match(recovery, /if \(event\.target\.closest\('\[data-close\]'\)\) return closePlayer\(\)/);
  assert.match(recovery, /function closePlayer\(\) \{/);
  assert.doesNotMatch(recovery.match(/function closePlayer\(\)[\s\S]*?\n  \}/)?.[0] || '', /pause\(|audio\.src|location\./);

  assert.match(bridge, /\.v2-player-mark/);
  assert.match(bridge, /event\.preventDefault\(\)/);
  assert.match(bridge, /event\.stopImmediatePropagation\(\)/);
  assert.match(bridge, /querySelector\('\[data-close\]'\)/);
  assert.match(bridge, /backButton\.click\(\)/);
  assert.doesNotMatch(bridge, /location\.|window\.open|audio\.pause/);

  assert.ok(html.indexOf('v2-recovery.js') < html.indexOf('v2-player-fluid-home.js'));
  assert.match(html, /v2-player-fluid-home\.js\?v=20260724-player51/);
});
