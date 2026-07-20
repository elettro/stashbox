import fs from 'node:fs';

const targets = [
  {
    file: 'radio-api/index.mjs',
    needles: [
      'function normalizeVisualsFolderAsset',
      'function normalizeFolderAssetPayload',
      'async function createVisualsFolderAsset',
      'async function updateVisualsFolderAsset'
    ]
  },
  {
    file: 'radio/visual-experience/dev/index.html',
    needles: [
      'function renderAssetCard',
      'async function uploadOneFile',
      "els.assetList.addEventListener('input'",
      "els.assetList.addEventListener('click'"
    ]
  },
  {
    file: 'radio/dev/app.js',
    needles: [
      'function normalizeVecAsset',
      'specificProductCache',
      'function ProductCarousel',
      'setProducts(',
      'useState([])',
      'activeVisual',
      'visualIndex',
      'currentVisual'
    ]
  }
];

function printContext(file, source, needle, radius = 24) {
  const lines = source.split(/\r?\n/);
  const matches = [];
  lines.forEach((line, index) => {
    if (line.includes(needle)) matches.push(index);
  });
  console.log(`\n===== ${file} :: ${needle} :: ${matches.length} match(es) =====`);
  for (const index of matches.slice(0, 12)) {
    const start = Math.max(0, index - radius);
    const end = Math.min(lines.length, index + radius + 1);
    console.log(`--- lines ${start + 1}-${end} ---`);
    for (let i = start; i < end; i += 1) {
      console.log(`${String(i + 1).padStart(5, ' ')} | ${lines[i]}`);
    }
  }
}

for (const target of targets) {
  const source = fs.readFileSync(target.file, 'utf8');
  for (const needle of target.needles) printContext(target.file, source, needle);
}
