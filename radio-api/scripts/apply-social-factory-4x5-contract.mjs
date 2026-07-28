import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const matches = source.split(before).length - 1;
  if (matches !== 1) {
    throw new Error(`${label} expected exactly one match, found ${matches}.`);
  }
  return source.replace(before, after);
}

function insertBefore(source, marker, block, label) {
  const matches = source.split(marker).length - 1;
  if (matches !== 1) {
    throw new Error(`${label} expected exactly one insertion marker, found ${matches}.`);
  }
  return source.replace(marker, `${block}\n\n${marker}`);
}

const batchPath = 'social-factory-api/batch-campaigns.mjs';
const orchestratorPath = 'social-factory-api/video-orchestrator.mjs';
const batchTestPath = 'social-factory-api/tests/batch-campaigns.test.mjs';
const orchestratorTestPath = 'social-factory-api/tests/video-orchestrator.test.mjs';

for (const filePath of [batchPath, orchestratorPath]) {
  let source = fs.readFileSync(filePath, 'utf8');
  source = replaceOnce(
    source,
    "const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16', '3:4', '1:1']);",
    "const ALLOWED_ASPECT_RATIOS = new Set(['16:9', '9:16', '3:4', '4:5', '1:1']);",
    `${filePath} aspect ratio allowlist`
  );
  fs.writeFileSync(filePath, source);
}

let batchTests = fs.readFileSync(batchTestPath, 'utf8');
const batchTestBlock = [
  "test('batch plan accepts 4:5 feed portrait output', async () => {",
  '  const service = createBatchCampaignService({',
  '    orchestrator: {',
  '      async candidates() {',
  '        return { candidates: candidates() };',
  '      }',
  '    }',
  '  });',
  '',
  '  const result = await service.plan(event({',
  "    campaign_name: 'Feed Portrait Test',",
  "    selected_song_keys: ['strong-reggae-song'],",
  "    aspect_ratio: '4:5',",
  "    duration_mode: 'custom',",
  '    duration_seconds: 15',
  '  }));',
  '',
  "  assert.equal(result.settings.aspect_ratio, '4:5');",
  "  assert.equal(result.jobs[0].recipe.aspect_ratio, '4:5');",
  '  assert.equal(result.jobs[0].recipe.duration_seconds, 15);',
  '  assert.equal(result.proposed_job_count, 1);',
  '});'
].join('\n');
batchTests = insertBefore(
  batchTests,
  "test('batch plan excludes visible songs that still need a VEC check by default', async () => {",
  batchTestBlock,
  'batch 4:5 contract test'
);
fs.writeFileSync(batchTestPath, batchTests);

let orchestratorTests = fs.readFileSync(orchestratorTestPath, 'utf8');
const orchestratorTestBlock = [
  "test('create draft forwards 4:5 feed portrait output to Video Factory', async () => {",
  '  const { service, calls } = createService(async (url, options) => {',
  "    assert.equal(url, 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/admin/video-factory/jobs');",
  '    const body = JSON.parse(options.body);',
  "    assert.equal(body.song_key, 'riding-waves-014b-jv1-stashbox');",
  "    assert.equal(body.aspect_ratio, '4:5');",
  '    assert.equal(body.duration_seconds, 15);',
  '    return jsonResponse({',
  "      job: { id: 'job-feed-portrait-12345678', status: 'draft', aspect_ratio: '4:5', width: 1080, height: 1350 }",
  '    }, 201);',
  '  });',
  '',
  '  const result = await service.createDraft(event({',
  '    body: {',
  "      song_key: 'riding-waves-014b-jv1-stashbox',",
  "      aspect_ratio: '4:5',",
  "      duration_mode: 'custom',",
  '      duration_seconds: 15',
  '    }',
  '  }));',
  '',
  '  assert.equal(result.created, true);',
  "  assert.equal(result.requested_recipe.aspect_ratio, '4:5');",
  "  assert.equal(result.job.aspect_ratio, '4:5');",
  '  assert.equal(calls.length, 1);',
  '});'
].join('\n');
orchestratorTests = insertBefore(
  orchestratorTests,
  "test('launch is validation-only until confirm_render is explicitly true', async () => {",
  orchestratorTestBlock,
  'orchestrator 4:5 contract test'
);
fs.writeFileSync(orchestratorTestPath, orchestratorTests);

console.log('Applied Social Factory 4:5 contract and focused tests.');
