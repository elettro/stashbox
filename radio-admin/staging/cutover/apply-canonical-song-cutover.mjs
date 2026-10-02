import fs from 'node:fs/promises';
import path from 'node:path';

const apply = process.argv.includes('--apply');
const sourcePath = 'radio-admin/staging/cutover/canonical-song-source.js';
const destinationPath = 'radio/canonical-song-source.js';
const scriptTag = '  <script src="/radio/canonical-song-source.js?v=20260828-canonical1" defer></script>\n';
const targets = [
  'radio/index.html',
  'radio/desktop/index.html',
  'radio/dev/v2/index.html',
  'radio/dev/v2/desktop/index.html'
];

const source = await fs.readFile(sourcePath, 'utf8');
const plan = [];

for (const file of targets) {
  const original = await fs.readFile(file, 'utf8');
  if (original.includes('/radio/canonical-song-source.js')) {
    plan.push({ file, action: 'already-wired' });
    continue;
  }

  const marker = /(^\s*<script\s+src="[^"]*v2-boot-guard\.js[^\n]*<\/script>\s*$)/m;
  const match = original.match(marker);
  if (!match) throw new Error(`Could not locate v2-boot-guard script in ${file}`);
  const updated = original.replace(marker, `${scriptTag}${match[1]}`);
  plan.push({ file, action: 'insert-before-v2-boot-guard', updated });
}

if (!apply) {
  console.log(JSON.stringify({ apply: false, destinationPath, targets: plan.map(({ file, action }) => ({ file, action })) }, null, 2));
  process.exit(0);
}

await fs.mkdir(path.dirname(destinationPath), { recursive: true });
await fs.writeFile(destinationPath, source);
for (const item of plan) {
  if (item.updated) await fs.writeFile(item.file, item.updated);
}

console.log(JSON.stringify({
  apply: true,
  created: destinationPath,
  modified: plan.filter(item => item.updated).map(item => item.file),
  untouched: plan.filter(item => !item.updated).map(item => item.file)
}, null, 2));
