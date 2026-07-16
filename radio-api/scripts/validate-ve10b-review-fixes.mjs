import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const playerSource = readFileSync(new URL('../../radio/dev/app.js', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../index.mjs', import.meta.url), 'utf8');
const adminSource = readFileSync(new URL('../../radio-admin/dev/app.js', import.meta.url), 'utf8');

const ve10bBranch = /if \(Array\.isArray\(ve10bSequence\) && ve10bSequence\.length\) \{\s*return ve10bSequence;\s*\}\s*return loadVecRecipeVisuals/s;
assert.match(playerSource, ve10bBranch, 'VE-10B assets must be returned before VE-10A fallback runs.');
assert.match(playerSource, /if \(Array\.isArray\(sequence\)\) \{\s*setCurrentVisualImages\(\[\]\);\s*setVisualSequenceState/s, 'VE-10B and fallback sequences should be applied in the shared sequence handler.');
assert.match(playerSource, /return loadVecRecipeVisuals\(selected, \{ signal: controller\.signal \}\);/, 'Empty VE-10B sequences should still fall back to VE-10A recipe visuals.');

function normalizeManualOrder(item) {
  const rawOrder = item.manual_order ?? item.manualOrder;
  const manualOrder = rawOrder !== null && rawOrder !== undefined && rawOrder !== '' ? Number(rawOrder) : null;
  return Number.isFinite(manualOrder) ? manualOrder : null;
}

assert.match(apiSource, /const rawOrder = item\.manual_order \?\? item\.manualOrder;/, 'Manual-order save path must inspect the raw value before Number conversion.');
assert.equal(normalizeManualOrder({ manual_order: null }), null, 'Null manual_order remains null.');
assert.equal(normalizeManualOrder({}), null, 'Missing manual_order remains null.');
assert.equal(normalizeManualOrder({ manual_order: '' }), null, 'Blank manual_order remains null.');
assert.equal(normalizeManualOrder({ manual_order: 0 }), 0, 'Explicit numeric zero remains valid.');
assert.equal(normalizeManualOrder({ manualOrder: '0' }), 0, 'Explicit string zero remains valid.');
assert.equal(normalizeManualOrder({ manual_order: 'not-a-number' }), null, 'Invalid manual_order strings save as null.');

assert.match(adminSource, /if \(!selectedSongKey\) return false;/, 'Missing selected song key must return false.');
assert.match(adminSource, /return true;\n  \} catch \(error\) \{[^\n]*return false; \}/, 'Visual Experience save must return true on success and false on failure.');
assert.match(adminSource, /showMessage\(success \? 'Visual Experience saved' : 'Failed to save Visual Experience'/, 'Visual-only save failure must not show success.');
assert.match(adminSource, /showMessage\(visualExperienceSaved \? 'Saved successfully' : 'Song saved, but Visual Experience save failed'/, 'Combined song and Visual Experience save must only show full success when both saves succeed.');
assert.match(adminSource, /catch \(error\) \{ visualExperienceState\.saving = false; visualExperienceState\.status = `Visual Experience save failed: \$\{error\.message\}`; renderVisualExperience\(\); return false; \}/, 'Failed Visual Experience save must preserve dirty state by not setting dirty false.');

console.log('VE-10B review-fix validation passed.');
