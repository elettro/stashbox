import fs from 'node:fs/promises';

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');

const ENV_PATH = 'radio-admin/admin-env.js';
const ROOT_INDEX_PATH = 'radio-admin/index.html';
const SONG_INDEX_PATH = 'radio-admin/songs/index.html';
const PROTECTED_PREFIXES = [
  'radio-admin/dev/',
  'radio-admin/staging/',
  'radio-admin/legacy/'
];

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Activation precondition failed: ${label || needle}`);
}

function replaceExact(source, from, to, label) {
  requireText(source, from, label || from);
  const first = source.indexOf(from);
  const second = source.indexOf(from, first + from.length);
  if (second !== -1) throw new Error(`Activation precondition failed: ${label || from} occurs more than once.`);
  return source.replace(from, to);
}

async function read(path) {
  return fs.readFile(path, 'utf8');
}

async function main() {
  let envSource = await read(ENV_PATH);
  let rootIndex = await read(ROOT_INDEX_PATH);
  let songIndex = await read(SONG_INDEX_PATH);

  // Refuse to activate anything except the already-materialized, locked cutover candidate.
  requireText(envSource, "mode: 'cutover-candidate'", 'cutover-candidate mode');
  requireText(envSource, 'productionCutoverApproved: false', 'production cutover lock');
  requireText(envSource, 'productionWritesApproved: false', 'production write lock');
  requireText(envSource, "canonicalEnvironment: 'prod'", 'canonical PROD song environment');
  requireText(envSource, 'stagingProdWritesAllowed: false', 'canonical song write lock');
  requireText(envSource, "tokenStorageKey: 'radio_admin_token_prod'", 'separate PROD token namespace');

  const prodMatch = envSource.match(/prod: Object\.freeze\(\{([\s\S]*?)\n\s*\}\)/);
  if (!prodMatch) throw new Error('Activation precondition failed: PROD environment block not found.');
  requireText(prodMatch[0], 'legacyTokenStorageKeys: Object.freeze([])', 'PROD legacy token fallback must stay empty');
  requireText(prodMatch[0], 'writesAllowedInStaging: false', 'PROD environment write lock');
  if (prodMatch[0].includes('stashbox_admin_token_dev')) {
    throw new Error('Activation refused: canonical PROD Admin contains a DEV-token fallback.');
  }

  envSource = replaceExact(envSource, "mode: 'cutover-candidate'", "mode: 'production'", 'build mode');
  envSource = replaceExact(envSource, 'productionCutoverApproved: false', 'productionCutoverApproved: true', 'cutover approval');
  envSource = replaceExact(envSource, 'productionWritesApproved: false', 'productionWritesApproved: true', 'production write approval');
  envSource = replaceExact(envSource, 'stagingProdWritesAllowed: false', 'stagingProdWritesAllowed: true', 'canonical song write approval');

  const transformedProd = prodMatch[0].replace('writesAllowedInStaging: false', 'writesAllowedInStaging: true');
  envSource = envSource.replace(prodMatch[0], transformedProd);

  rootIndex = replaceExact(
    rootIndex,
    '<div class="env-lock"><span class="env-badge">UNIFIED</span><span>Song writes locked until cutover</span></div>',
    '<div class="env-lock"><span class="env-badge">LIVE</span><span>Canonical Song CMS active</span></div>',
    'root locked status copy'
  );
  rootIndex = replaceExact(
    rootIndex,
    'Cutover candidate: Songs read the canonical LIVE/PROD catalog. Song writes remain locked until final cutover; operational tools retain their tested DEV boundaries.',
    'Unified Admin: Songs read and write the canonical LIVE/PROD catalog. Operational tools retain their tested DEV-specific boundaries.',
    'root guardrail copy'
  );
  rootIndex = rootIndex.replace(
    'A controlled hidden PROD metadata write was observed by the public catalog and exactly reverted. Final live route cutover remains pending.',
    'A controlled hidden PROD metadata write was observed by the public catalog and exactly reverted. Canonical LIVE Song CMS writes are now active.'
  );

  songIndex = replaceExact(
    songIndex,
    '<div class="env-lock"><span class="env-badge">PROD</span><span>Song writes locked until cutover</span></div>',
    '<div class="env-lock"><span class="env-badge">LIVE</span><span>Canonical PROD writes active</span></div>',
    'Song CMS locked status copy'
  );
  songIndex = replaceExact(
    songIndex,
    'This Song CMS reads the canonical LIVE/PROD catalog. Production metadata, media, and artwork write paths are proven but remain locked until the final activation switch.',
    'This Song CMS reads and writes the canonical LIVE/PROD catalog. Metadata, media, and artwork writes use the verified PROD API and PROD media bucket paths.',
    'Song CMS guardrail copy'
  );
  songIndex = songIndex.replace(
    'Canonical PROD read active. Song writes are locked until final cutover.',
    'Canonical LIVE/PROD Song CMS active.'
  );
  songIndex = songIndex.replace(
    'The PROD presign/S3 path is validated; uploads remain locked until final cutover.',
    'The verified PROD presign/S3 path is active for canonical LIVE media uploads.'
  );
  songIndex = songIndex.replace(
    'PROD artwork presign/S3/attachment is validated and remains locked until final cutover.',
    'The verified PROD artwork presign/S3/attachment path is active.'
  );
  songIndex = songIndex.replace(
    'Read and search against the canonical PROD admin API. Create/edit activates only after the final production write switch.',
    'Read, create, and edit against the canonical PROD admin API.'
  );

  // Verify the transformed state before touching disk.
  requireText(envSource, "mode: 'production'", 'production mode result');
  requireText(envSource, 'productionCutoverApproved: true', 'cutover approval result');
  requireText(envSource, 'productionWritesApproved: true', 'write approval result');
  requireText(envSource, 'stagingProdWritesAllowed: true', 'song write approval result');
  const finalProd = envSource.match(/prod: Object\.freeze\(\{([\s\S]*?)\n\s*\}\)/)?.[0] || '';
  requireText(finalProd, 'writesAllowedInStaging: true', 'PROD write enablement result');
  requireText(finalProd, 'legacyTokenStorageKeys: Object.freeze([])', 'empty PROD legacy-token result');

  const changedFiles = [ENV_PATH, ROOT_INDEX_PATH, SONG_INDEX_PATH];
  if (!APPLY) {
    console.log(JSON.stringify({
      pass: true,
      dryRun: true,
      changedFiles,
      protectedPrefixes: PROTECTED_PREFIXES,
      productionWritesWouldBeEnabled: true
    }, null, 2));
    return;
  }

  await fs.writeFile(ENV_PATH, envSource, 'utf8');
  await fs.writeFile(ROOT_INDEX_PATH, rootIndex, 'utf8');
  await fs.writeFile(SONG_INDEX_PATH, songIndex, 'utf8');

  console.log(JSON.stringify({
    pass: true,
    applied: true,
    changedFiles,
    protectedPrefixes: PROTECTED_PREFIXES,
    productionWritesEnabled: true
  }, null, 2));
}

await main();
