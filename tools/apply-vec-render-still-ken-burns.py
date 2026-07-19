from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new):
    file_path = ROOT / path
    text = file_path.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{path}: expected exactly one match, found {count}: {old[:120]!r}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


# VEC Lab: persist song-level rendered-video still image rules.
controller = 'radio-admin/dev/vec/vec-controller.js'
replace_once(
    controller,
    "  const DURATION_OPTIONS = [2, 3, 4, 5, 8, 10];\n",
    "  const DEFAULT_RENDER_SETTINGS = {\n"
    "    stillImageDurationSeconds: 3,\n"
    "    kenBurnsEnabled: true,\n"
    "  };\n\n"
    "  const STILL_IMAGE_DURATION_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12];\n"
    "  const DURATION_OPTIONS = [2, 3, 4, 5, 8, 10];\n"
)
replace_once(
    controller,
    "artworkRules: { ...DEFAULT_ARTWORK_RULES, ...(options.artworkRules || {}) }, shuffleRules:",
    "artworkRules: { ...DEFAULT_ARTWORK_RULES, ...(options.artworkRules || {}) }, renderSettings: { ...DEFAULT_RENDER_SETTINGS, ...(options.renderSettings || {}) }, shuffleRules:"
)
replace_once(
    controller,
    "      <section class=\"card vec-section\" aria-labelledby=\"shuffleSettingsHeading\">",
    "      <section class=\"card vec-section\" aria-labelledby=\"renderImageSettingsHeading\"><div class=\"panel-header vec-section-header\"><div><p class=\"eyebrow\">Rendered Video</p><h2 id=\"renderImageSettingsHeading\">Still Image Motion</h2><p class=\"vec-copy\">Controls still-image timing and subtle Ken Burns movement in Video Factory renders. These settings do not change video clip length.</p></div></div><div class=\"vec-control-grid\" role=\"group\" aria-label=\"Rendered video still image settings\"><label class=\"vec-field\"><span>Still image duration</span><select class=\"vec-select\" data-vec-still-image-duration>${optionMarkup(STILL_IMAGE_DURATION_OPTIONS, state.renderSettings.stillImageDurationSeconds)}</select></label><label class=\"vec-field vec-toggle-field\"><span>Ken Burns effect</span><button class=\"vec-toggle ${state.renderSettings.kenBurnsEnabled ? 'is-on' : 'is-off'}\" type=\"button\" data-vec-ken-burns-toggle aria-pressed=\"${state.renderSettings.kenBurnsEnabled}\">${onOffLabel(state.renderSettings.kenBurnsEnabled)}</button></label></div><p class=\"vec-microcopy\">Ken Burns uses slow, subtle, seeded random movement and a restrained zoom. Each render remains repeatable from its saved recipe.</p></section>\n"
    "      <section class=\"card vec-section\" aria-labelledby=\"shuffleSettingsHeading\">"
)
replace_once(
    controller,
    "      artworkOnlyNote: container.querySelector('[data-vec-artwork-only-note]'),\n",
    "      artworkOnlyNote: container.querySelector('[data-vec-artwork-only-note]'),\n"
    "      stillImageDuration: container.querySelector('[data-vec-still-image-duration]'),\n"
    "      kenBurnsToggle: container.querySelector('[data-vec-ken-burns-toggle]'),\n"
)
replace_once(
    controller,
    "    function syncVisualModeControls() {\n",
    "    function syncRenderSettingsControls() {\n"
    "      if (elements.stillImageDuration) elements.stillImageDuration.value = String(state.renderSettings.stillImageDurationSeconds);\n"
    "      if (elements.kenBurnsToggle) {\n"
    "        elements.kenBurnsToggle.classList.toggle('is-on', state.renderSettings.kenBurnsEnabled);\n"
    "        elements.kenBurnsToggle.classList.toggle('is-off', !state.renderSettings.kenBurnsEnabled);\n"
    "        elements.kenBurnsToggle.setAttribute('aria-pressed', String(state.renderSettings.kenBurnsEnabled));\n"
    "        elements.kenBurnsToggle.textContent = onOffLabel(state.renderSettings.kenBurnsEnabled);\n"
    "      }\n"
    "    }\n\n"
    "    function syncVisualModeControls() {\n"
)
replace_once(
    controller,
    "        folders,\n        song_assets: songAssetRecipe,\n",
    "        render_settings: {\n"
    "          still_image_duration_seconds: Number(state.renderSettings.stillImageDurationSeconds) || DEFAULT_RENDER_SETTINGS.stillImageDurationSeconds,\n"
    "          ken_burns_enabled: state.renderSettings.kenBurnsEnabled !== false,\n"
    "        },\n"
    "        folders,\n        song_assets: songAssetRecipe,\n"
)
replace_once(
    controller,
    "      state.artworkRules = { ...DEFAULT_ARTWORK_RULES };\n      state.shuffleRules = { ...DEFAULT_SHUFFLE_RULES };\n",
    "      state.artworkRules = { ...DEFAULT_ARTWORK_RULES };\n"
    "      state.renderSettings = { ...DEFAULT_RENDER_SETTINGS };\n"
    "      state.shuffleRules = { ...DEFAULT_SHUFFLE_RULES };\n"
)
replace_once(
    controller,
    "          repeatEverySeconds: Number(artwork.repeat_every_seconds) || DEFAULT_ARTWORK_RULES.repeatEverySeconds,\n        };\n        const shuffle = recipe.shuffle || {};\n",
    "          repeatEverySeconds: Number(artwork.repeat_every_seconds) || DEFAULT_ARTWORK_RULES.repeatEverySeconds,\n"
    "        };\n"
    "        const renderSettings = recipe.render_settings || {};\n"
    "        state.renderSettings = {\n"
    "          stillImageDurationSeconds: Number(renderSettings.still_image_duration_seconds) || DEFAULT_RENDER_SETTINGS.stillImageDurationSeconds,\n"
    "          kenBurnsEnabled: renderSettings.ken_burns_enabled !== false,\n"
    "        };\n"
    "        const shuffle = recipe.shuffle || {};\n"
)
replace_once(
    controller,
    "      syncArtworkControls();\n      syncVisualModeControls();\n",
    "      syncArtworkControls();\n      syncRenderSettingsControls();\n      syncVisualModeControls();\n"
)
replace_once(
    controller,
    "    elements.orderMode.addEventListener('change', () => {\n",
    "    elements.stillImageDuration?.addEventListener('change', () => {\n"
    "      state.renderSettings.stillImageDurationSeconds = Number(elements.stillImageDuration.value) || DEFAULT_RENDER_SETTINGS.stillImageDurationSeconds;\n"
    "      markDirty();\n"
    "      renderDynamic();\n"
    "    });\n"
    "    elements.kenBurnsToggle?.addEventListener('click', () => {\n"
    "      state.renderSettings.kenBurnsEnabled = !state.renderSettings.kenBurnsEnabled;\n"
    "      markDirty();\n"
    "      renderDynamic();\n"
    "    });\n\n"
    "    elements.orderMode.addEventListener('change', () => {\n"
)

# VEC resolver: expose render settings to the worker with backwards-compatible defaults.
vec_recipe = 'video-render-worker/src/vec-recipe.mjs'
replace_once(
    vec_recipe,
    "async function loadSongAssets(request, songKey) {\n",
    "function normalizeRenderSettings(recipe = {}) {\n"
    "  const settings = recipe.render_settings || recipe.renderSettings || {};\n"
    "  const duration = Number(settings.still_image_duration_seconds ?? settings.stillImageDurationSeconds);\n"
    "  return {\n"
    "    still_image_duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.min(30, duration) : 3,\n"
    "    ken_burns_enabled: settings.ken_burns_enabled !== false && settings.kenBurnsEnabled !== false\n"
    "  };\n"
    "}\n\n"
    "async function loadSongAssets(request, songKey) {\n"
)
replace_once(
    vec_recipe,
    "      artworkRules: normalizeArtworkRules(),\n      recipe: null,\n",
    "      artworkRules: normalizeArtworkRules(),\n      renderSettings: normalizeRenderSettings(),\n      recipe: null,\n"
)
replace_once(
    vec_recipe,
    "  const artworkRules = normalizeArtworkRules(recipe);\n\n  if (visualMode === 'artwork_only') {\n",
    "  const artworkRules = normalizeArtworkRules(recipe);\n"
    "  const renderSettings = normalizeRenderSettings(recipe);\n\n"
    "  if (visualMode === 'artwork_only') {\n"
)
replace_once(
    vec_recipe,
    "      artworkRules,\n      recipe,\n      selectedAssetIds: [],\n",
    "      artworkRules,\n      renderSettings,\n      recipe,\n      selectedAssetIds: [],\n"
)
replace_once(
    vec_recipe,
    "    artworkRules,\n    recipe,\n    selectedAssetIds: expectedIds,\n",
    "    artworkRules,\n    renderSettings,\n    recipe,\n    selectedAssetIds: expectedIds,\n"
)

# Fetch adapter: include normalized render settings with the resolved VEC assets.
entry = 'video-render-worker/src/entry.mjs'
replace_once(
    entry,
    "          ? { ...asset, renderer_artwork_rules: vec.artworkRules }\n",
    "          ? { ...asset, renderer_artwork_rules: vec.artworkRules, renderer_render_settings: vec.renderSettings }\n"
)
replace_once(
    entry,
    "        : [{ renderer_control: 'artwork-rules', renderer_artwork_rules: vec.artworkRules }];\n",
    "        : [{ renderer_control: 'artwork-rules', renderer_artwork_rules: vec.artworkRules, renderer_render_settings: vec.renderSettings }];\n"
)
replace_once(
    entry,
    "        renderer_visual_mode: vec.visualMode,\n",
    "        renderer_visual_mode: vec.visualMode,\n        renderer_render_settings: vec.renderSettings,\n"
)

# Worker timeline: image duration is independent from clip duration; motion is frozen per segment.
timeline = 'video-render-worker/src/timeline.mjs'
replace_once(
    timeline,
    "function buildArtworkAnchors(totalDuration, artworkUrl, rules = {}, segmentDuration = 8) {\n",
    "const KEN_BURNS_DIRECTIONS = Object.freeze([\n"
    "  'left-to-right',\n"
    "  'right-to-left',\n"
    "  'top-to-bottom',\n"
    "  'bottom-to-top',\n"
    "  'top-left-to-bottom-right',\n"
    "  'bottom-right-to-top-left',\n"
    "  'top-right-to-bottom-left',\n"
    "  'bottom-left-to-top-right'\n"
    "]);\n\n"
    "function buildKenBurnsMotion(seed, asset, segmentIndex, enabled) {\n"
    "  if (!enabled || asset?.type !== 'image' || asset?.asset_id === 'song-artwork') return null;\n"
    "  const random = mulberry32(hashSeed(`${seed}:ken-burns:${asset.asset_id}:${segmentIndex}`));\n"
    "  const direction = KEN_BURNS_DIRECTIONS[Math.floor(random() * KEN_BURNS_DIRECTIONS.length)];\n"
    "  const zoomMode = random() < 0.5 ? 'in' : 'out';\n"
    "  const maxZoom = Math.round((1.06 + random() * 0.03) * 1000) / 1000;\n"
    "  return { enabled: true, direction, zoom_mode: zoomMode, max_zoom: maxZoom };\n"
    "}\n\n"
    "function buildArtworkAnchors(totalDuration, artworkUrl, rules = {}, segmentDuration = 8) {\n"
)
replace_once(
    timeline,
    "  const segmentDuration = positiveNumber(options.segment_duration_seconds, 8);\n",
    "  const segmentDuration = positiveNumber(options.segment_duration_seconds, 8);\n"
    "  const imageDuration = positiveNumber(options.image_duration_seconds, 3);\n"
    "  const kenBurnsEnabled = options.ken_burns_enabled !== false;\n"
)
replace_once(
    timeline,
    "  function appendSegment(asset, duration, sourceOverride = '') {\n    if (duration <= 0.001) return;\n    timeline.push({\n",
    "  function appendSegment(asset, duration, sourceOverride = '') {\n"
    "    if (duration <= 0.001) return;\n"
    "    const motion = buildKenBurnsMotion(seed, asset, timeline.length, kenBurnsEnabled);\n"
    "    timeline.push({\n"
)
replace_once(
    timeline,
    "      end_seconds: roundTime(currentTime + duration)\n",
    "      end_seconds: roundTime(currentTime + duration),\n      motion\n"
)
replace_once(
    timeline,
    "      appendSegment(asset, Math.min(segmentDuration, targetTime - currentTime));\n",
    "      const assetDuration = asset.type === 'image' && asset.asset_id !== 'song-artwork' ? imageDuration : segmentDuration;\n"
    "      appendSegment(asset, Math.min(assetDuration, targetTime - currentTime));\n"
)

# FFmpeg: subtle seeded zoom/pan for image segments only.
ffmpeg = 'video-render-worker/src/ffmpeg.mjs'
old_filter = """function segmentVideoFilter({ width, height, fps, duration }) {
  const fadeDuration = Math.min(0.3, Math.max(0.08, duration / 8));
  const fadeOutStart = Math.max(0, duration - fadeDuration);
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    `fps=${fps}`,
    'setsar=1',
    'format=yuv420p',
    `fade=t=in:st=0:d=${fadeDuration.toFixed(3)}`,
    `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}`
  ].join(',');
}
"""
new_filter = """function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function kenBurnsPosition(direction, axis, progress, range) {
  const forwardX = new Set(['left-to-right', 'top-left-to-bottom-right', 'bottom-left-to-top-right']);
  const reverseX = new Set(['right-to-left', 'bottom-right-to-top-left', 'top-right-to-bottom-left']);
  const forwardY = new Set(['top-to-bottom', 'top-left-to-bottom-right', 'top-right-to-bottom-left']);
  const reverseY = new Set(['bottom-to-top', 'bottom-right-to-top-left', 'bottom-left-to-top-right']);
  if (axis === 'x') {
    if (forwardX.has(direction)) return `${range}*${progress}`;
    if (reverseX.has(direction)) return `${range}*(1-${progress})`;
  } else {
    if (forwardY.has(direction)) return `${range}*${progress}`;
    if (reverseY.has(direction)) return `${range}*(1-${progress})`;
  }
  return `${range}/2`;
}

export function segmentVideoFilter({ width, height, fps, duration, segment = {} }) {
  const fadeDuration = Math.min(0.3, Math.max(0.08, duration / 8));
  const fadeOutStart = Math.max(0, duration - fadeDuration);
  const filters = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`
  ];
  const motion = segment?.motion || {};
  if (segment.type === 'image' && motion.enabled) {
    const frames = Math.max(2, Math.round(duration * fps));
    const denominator = Math.max(1, frames - 1);
    const progress = `on/${denominator}`;
    const maxZoom = clamp(Number(motion.max_zoom || 1.075), 1.02, 1.1);
    const delta = maxZoom - 1;
    const zoom = motion.zoom_mode === 'out'
      ? `${maxZoom.toFixed(4)}-${delta.toFixed(4)}*${progress}`
      : `1+${delta.toFixed(4)}*${progress}`;
    const x = kenBurnsPosition(motion.direction, 'x', progress, '(iw-iw/zoom)');
    const y = kenBurnsPosition(motion.direction, 'y', progress, '(ih-ih/zoom)');
    filters.push(`zoompan=z='${zoom}':x='${x}':y='${y}':d=${frames}:s=${width}x${height}:fps=${fps}`);
  } else {
    filters.push(`fps=${fps}`);
  }
  filters.push(
    'setsar=1',
    'format=yuv420p',
    `fade=t=in:st=0:d=${fadeDuration.toFixed(3)}`,
    `fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeDuration.toFixed(3)}`
  );
  return filters.join(',');
}
"""
replace_once(ffmpeg, old_filter, new_filter)
replace_once(
    ffmpeg,
    "  const filter = segmentVideoFilter({ width, height, fps, duration });\n",
    "  const filter = segmentVideoFilter({ width, height, fps, duration, segment });\n"
)

# Worker orchestration: read settings from the adapted VEC response and freeze them into the recipe.
index = 'video-render-worker/src/index.mjs'
replace_once(
    index,
    "    return {\n      orderMode: stringValue(body.order_mode) || 'random',\n      assets: Array.isArray(body.assets) ? body.assets : [],\n      fallback: body.fallback || {}\n    };\n",
    "    const assets = Array.isArray(body.assets) ? body.assets : [];\n"
    "    const embeddedSettings = assets.find(asset => asset?.renderer_render_settings)?.renderer_render_settings || {};\n"
    "    const renderSettings = body.renderer_render_settings || embeddedSettings;\n"
    "    return {\n"
    "      orderMode: stringValue(body.order_mode) || 'random',\n"
    "      assets,\n"
    "      fallback: body.fallback || {},\n"
    "      renderSettings: {\n"
    "        still_image_duration_seconds: Number(renderSettings?.still_image_duration_seconds) > 0 ? Number(renderSettings.still_image_duration_seconds) : 3,\n"
    "        ken_burns_enabled: renderSettings?.ken_burns_enabled !== false\n"
    "      }\n"
    "    };\n"
)
replace_once(
    index,
    "    return { orderMode: 'random', assets: [], fallback: { uses_artwork: true } };\n",
    "    return { orderMode: 'random', assets: [], fallback: { uses_artwork: true }, renderSettings: { still_image_duration_seconds: 3, ken_burns_enabled: true } };\n"
)
replace_once(
    index,
    "          segment_duration_seconds: Number(activeRecipe?.visuals?.segment_duration_seconds || 8),\n          order_mode: visualSettings.orderMode,\n",
    "          segment_duration_seconds: Number(activeRecipe?.visuals?.segment_duration_seconds || 8),\n"
    "          image_duration_seconds: Number(visualSettings.renderSettings?.still_image_duration_seconds || 3),\n"
    "          ken_burns_enabled: visualSettings.renderSettings?.ken_burns_enabled !== false,\n"
    "          order_mode: visualSettings.orderMode,\n"
)
replace_once(
    index,
    "        segment_duration_seconds: Number(activeRecipe?.visuals?.segment_duration_seconds || 8),\n        frozen_at: new Date().toISOString()\n",
    "        segment_duration_seconds: Number(activeRecipe?.visuals?.segment_duration_seconds || 8),\n"
    "        still_image_duration_seconds: Number(visualSettings.renderSettings?.still_image_duration_seconds || 3),\n"
    "        ken_burns_enabled: visualSettings.renderSettings?.ken_burns_enabled !== false,\n"
    "        frozen_at: new Date().toISOString()\n"
)

# Tests: preserve existing mixed-duration expectation and add explicit render-setting coverage.
timeline_test = 'video-render-worker/tests/timeline.test.mjs'
replace_once(
    timeline_test,
    "    segment_duration_seconds: 5,\n    seed: 'space-jam-render-1',\n",
    "    segment_duration_seconds: 5,\n    image_duration_seconds: 5,\n    seed: 'space-jam-render-1',\n"
)
replace_once(
    timeline_test,
    "test('artwork becomes the fallback when no VEC assets are available', () => {\n",
    "test('still images default to three seconds with subtle deterministic Ken Burns motion', () => {\n"
    "  const options = {\n"
    "    total_duration_seconds: 7,\n"
    "    segment_duration_seconds: 8,\n"
    "    seed: 'still-motion-seed',\n"
    "    assets: [{ id: 'image-a', type: 'image', url: 'https://example.com/a.jpg' }]\n"
    "  };\n"
    "  const first = buildRenderTimeline(options);\n"
    "  const repeated = buildRenderTimeline(options);\n"
    "  assert.deepEqual(first, repeated);\n"
    "  assert.deepEqual(first.map(item => item.duration_seconds), [3, 3, 1]);\n"
    "  assert.ok(first.every(item => item.motion?.enabled));\n"
    "  assert.ok(first.every(item => item.motion.max_zoom >= 1.06 && item.motion.max_zoom <= 1.09));\n"
    "  assert.ok(first.every(item => ['in', 'out'].includes(item.motion.zoom_mode)));\n"
    "});\n\n"
    "test('Ken Burns can be disabled without changing the three-second still duration', () => {\n"
    "  const timeline = buildRenderTimeline({\n"
    "    total_duration_seconds: 6,\n"
    "    ken_burns_enabled: false,\n"
    "    assets: [{ id: 'image-a', type: 'image', url: 'https://example.com/a.jpg' }]\n"
    "  });\n"
    "  assert.deepEqual(timeline.map(item => item.duration_seconds), [3, 3]);\n"
    "  assert.ok(timeline.every(item => item.motion === null));\n"
    "});\n\n"
    "test('artwork becomes the fallback when no VEC assets are available', () => {\n"
)

vec_test = 'video-render-worker/tests/vec-recipe.test.mjs'
replace_once(
    vec_test,
    "        shuffle: { order_mode: 'randomize', avoid_repeating_same_asset: true },\n",
    "        render_settings: { still_image_duration_seconds: 3, ken_burns_enabled: true },\n"
    "        shuffle: { order_mode: 'randomize', avoid_repeating_same_asset: true },\n"
)
replace_once(
    vec_test,
    "  assert.equal(result.artworkRules.repeat_every_seconds, 60);\n",
    "  assert.equal(result.artworkRules.repeat_every_seconds, 60);\n"
    "  assert.deepEqual(result.renderSettings, { still_image_duration_seconds: 3, ken_burns_enabled: true });\n"
)
replace_once(
    vec_test,
    "  assert.deepEqual(result.assets, []);\n});\n\ntest('missing recipe allows the renderer to use the secondary Song CMS source', async () => {\n",
    "  assert.deepEqual(result.assets, []);\n"
    "  assert.deepEqual(result.renderSettings, { still_image_duration_seconds: 3, ken_burns_enabled: true });\n"
    "});\n\n"
    "test('missing recipe allows the renderer to use the secondary Song CMS source', async () => {\n"
)
replace_once(
    vec_test,
    "  assert.deepEqual(result.assets, []);\n});\n",
    "  assert.deepEqual(result.assets, []);\n"
    "  assert.deepEqual(result.renderSettings, { still_image_duration_seconds: 3, ken_burns_enabled: true });\n"
    "});\n",
)

ffmpeg_test = 'video-render-worker/tests/ffmpeg.test.mjs'
replace_once(
    ffmpeg_test,
    "import { buildOverlayFilter, escapeDrawtext } from '../src/ffmpeg.mjs';\n",
    "import { buildOverlayFilter, escapeDrawtext, segmentVideoFilter } from '../src/ffmpeg.mjs';\n"
)
replace_once(
    ffmpeg_test,
    "test('overlay filter respects disabled identity blocks', () => {\n",
    "test('Ken Burns filter uses subtle zoompan motion only when enabled', () => {\n"
    "  const animated = segmentVideoFilter({\n"
    "    width: 1920, height: 1080, fps: 30, duration: 3,\n"
    "    segment: { type: 'image', motion: { enabled: true, direction: 'left-to-right', zoom_mode: 'in', max_zoom: 1.08 } }\n"
    "  });\n"
    "  assert.match(animated, /zoompan=/);\n"
    "  assert.match(animated, /1\\+0\\.0800\\*on\\/89/);\n"
    "  assert.match(animated, /iw-iw\\/zoom/);\n"
    "  const staticFilter = segmentVideoFilter({ width: 1920, height: 1080, fps: 30, duration: 3, segment: { type: 'image', motion: null } });\n"
    "  assert.doesNotMatch(staticFilter, /zoompan=/);\n"
    "});\n\n"
    "test('overlay filter respects disabled identity blocks', () => {\n"
)

# Remove this one-time codemod and its runner from the resulting feature commit.
(ROOT / 'tools/apply-vec-render-still-ken-burns.py').unlink(missing_ok=True)
(ROOT / '.github/workflows/apply-vec-render-still-ken-burns.yml').unlink(missing_ok=True)
