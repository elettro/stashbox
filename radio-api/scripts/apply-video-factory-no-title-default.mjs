import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one match, found ${count}.`);
  }
  return source.replace(before, after);
}

function update(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: patch made no change.`);
  fs.writeFileSync(path, after);
  console.log(`updated ${path}`);
}

update('radio-admin/dev/video-factory/index.html', (source) => {
  let next = source;
  next = replaceOnce(
    next,
    '<label class="vf-check"><input id="includeArtist" type="checkbox" checked /> Artist name</label>',
    '<label class="vf-check"><input id="includeArtist" type="checkbox" /> Artist name</label>',
    'Video Factory artist checkbox default'
  );
  next = replaceOnce(
    next,
    '<label class="vf-check"><input id="includeSong" type="checkbox" checked /> Song name</label>',
    '<label class="vf-check"><input id="includeSong" type="checkbox" /> Song name</label>',
    'Video Factory song checkbox default'
  );
  next = replaceOnce(
    next,
    '<label class="vf-check"><input id="includeAlbum" type="checkbox" checked /> Album name</label>',
    '<label class="vf-check"><input id="includeAlbum" type="checkbox" /> Album name</label>',
    'Video Factory album checkbox default'
  );
  next = replaceOnce(
    next,
    '<script src="./video-factory.js"></script>',
    '<script src="./video-factory.js?v=20260729-no-title-default1"></script>',
    'Video Factory cache-busting script URL'
  );
  return next;
});

update('radio-api/video-factory/recipe.mjs', (source) => {
  let next = source;
  next = replaceOnce(
    next,
    "  variation: 1,\n  segment_duration_seconds: 8\n});",
    "  variation: 1,\n  segment_duration_seconds: 8,\n  include_artist: false,\n  include_song: false,\n  include_album: false\n});",
    'Video Factory overlay defaults'
  );
  next = replaceOnce(
    next,
    "      include_artist: input.include_artist ?? input.includeArtist ?? true,\n      include_song: input.include_song ?? input.includeSong ?? true,\n      include_album: input.include_album ?? input.includeAlbum ?? true",
    "      include_artist: input.include_artist ?? input.includeArtist ?? VIDEO_FACTORY_DEFAULTS.include_artist,\n      include_song: input.include_song ?? input.includeSong ?? VIDEO_FACTORY_DEFAULTS.include_song,\n      include_album: input.include_album ?? input.includeAlbum ?? VIDEO_FACTORY_DEFAULTS.include_album",
    'Video Factory recipe overlay fallbacks'
  );
  return next;
});

update('radio-api/video-factory/routes.mjs', (source) => replaceOnce(
  source,
  "      include_artist: input.include_artist ?? input.includeArtist ?? true,\n      include_song: input.include_song ?? input.includeSong ?? true,\n      include_album: input.include_album ?? input.includeAlbum ?? true,",
  "      include_artist: input.include_artist ?? input.includeArtist ?? VIDEO_FACTORY_DEFAULTS.include_artist,\n      include_song: input.include_song ?? input.includeSong ?? VIDEO_FACTORY_DEFAULTS.include_song,\n      include_album: input.include_album ?? input.includeAlbum ?? VIDEO_FACTORY_DEFAULTS.include_album,",
  'Video Factory API overlay fallbacks'
));

update('social-factory-api/batch-campaigns.mjs', (source) => replaceOnce(
  source,
  "    include_artist: input.include_artist !== false,\n    include_song: input.include_song !== false,\n    include_album: input.include_album !== false",
  "    include_artist: input.include_artist === true,\n    include_song: input.include_song === true,\n    include_album: input.include_album === true",
  'Social Factory campaign overlay defaults'
));

update('social-factory-api/video-orchestrator.mjs', (source) => replaceOnce(
  source,
  "        include_artist: input.include_artist ?? true,\n        include_song: input.include_song ?? true,\n        include_album: input.include_album ?? true,",
  "        include_artist: input.include_artist ?? false,\n        include_song: input.include_song ?? false,\n        include_album: input.include_album ?? false,",
  'Social Factory bridge overlay defaults'
));

update('radio-api/tests/video-factory-foundation.test.mjs', (source) => {
  let next = replaceOnce(
    source,
    "  assert.equal(recipe.overlays.corner_bug_enabled, true);\n  assert.equal(recipe.metadata.publisher, 'Elettro Incorporated');",
    "  assert.equal(recipe.overlays.corner_bug_enabled, true);\n  assert.equal(recipe.overlays.include_artist, false);\n  assert.equal(recipe.overlays.include_song, false);\n  assert.equal(recipe.overlays.include_album, false);\n  assert.equal(recipe.metadata.publisher, 'Elettro Incorporated');",
    'Video Factory default overlay assertions'
  );
  next += `\n\ntest('title overlays remain available as an explicit manual opt-in', () => {\n  const recipe = buildInitialRenderRecipe({\n    song_key: 'manual-title-test',\n    include_artist: true,\n    include_song: true,\n    include_album: true\n  });\n\n  assert.equal(recipe.overlays.include_artist, true);\n  assert.equal(recipe.overlays.include_song, true);\n  assert.equal(recipe.overlays.include_album, true);\n});\n`;
  return next;
});

update('social-factory-api/tests/batch-campaigns.test.mjs', (source) => {
  let next = replaceOnce(
    source,
    "  assert.equal(result.jobs[0].recipe.duration_seconds, 30);\n  assert.deepEqual(calls.map((call) => call.type), ['candidates']);",
    "  assert.equal(result.jobs[0].recipe.duration_seconds, 30);\n  assert.equal(result.jobs[0].recipe.include_artist, false);\n  assert.equal(result.jobs[0].recipe.include_song, false);\n  assert.equal(result.jobs[0].recipe.include_album, false);\n  assert.deepEqual(calls.map((call) => call.type), ['candidates']);",
    'Social Factory batch no-title assertions'
  );
  const marker = "test('batch plan excludes visible songs that still need a VEC check by default', async () => {";
  const optInTest = `test('batch plan preserves an explicit manual title-overlay opt-in', async () => {\n  const service = createBatchCampaignService({\n    orchestrator: {\n      async candidates() {\n        return { candidates: candidates() };\n      }\n    }\n  });\n\n  const result = await service.plan(event({\n    selected_song_keys: ['strong-reggae-song'],\n    include_artist: true,\n    include_song: true,\n    include_album: true\n  }));\n\n  assert.equal(result.jobs[0].recipe.include_artist, true);\n  assert.equal(result.jobs[0].recipe.include_song, true);\n  assert.equal(result.jobs[0].recipe.include_album, true);\n});\n\n`;
  next = replaceOnce(next, marker, `${optInTest}${marker}`, 'Social Factory batch opt-in test insertion');
  return next;
});

update('social-factory-api/tests/video-orchestrator.test.mjs', (source) => {
  let next = replaceOnce(
    source,
    "    assert.equal(body.aspect_ratio, '9:16');\n    return jsonResponse({ job: { id: 'job-12345678', status: 'draft' } }, 201);",
    "    assert.equal(body.aspect_ratio, '9:16');\n    assert.equal(body.include_artist, false);\n    assert.equal(body.include_song, false);\n    assert.equal(body.include_album, false);\n    return jsonResponse({ job: { id: 'job-12345678', status: 'draft' } }, 201);",
    'Social Factory bridge no-title assertions'
  );
  const marker = "test('launch is validation-only until confirm_render is explicitly true', async () => {";
  const optInTest = `test('create draft preserves an explicit title-overlay opt-in', async () => {\n  const { service } = createService(async (url, options) => {\n    const body = JSON.parse(options.body);\n    assert.equal(body.include_artist, true);\n    assert.equal(body.include_song, true);\n    assert.equal(body.include_album, true);\n    return jsonResponse({ job: { id: 'job-title-opt-in-12345678', status: 'draft' } }, 201);\n  });\n\n  const result = await service.createDraft(event({\n    body: {\n      song_key: 'manual-title-test',\n      include_artist: true,\n      include_song: true,\n      include_album: true\n    }\n  }));\n\n  assert.equal(result.requested_recipe.include_artist, true);\n  assert.equal(result.requested_recipe.include_song, true);\n  assert.equal(result.requested_recipe.include_album, true);\n});\n\n`;
  next = replaceOnce(next, marker, `${optInTest}${marker}`, 'Social Factory bridge opt-in test insertion');
  return next;
});

console.log('Applied no-title defaults while preserving explicit title-overlay opt-in.');
