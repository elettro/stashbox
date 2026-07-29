import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const read = relativePath => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

const tooltipSource = read('radio-admin/dev/social-factory/action-tooltips.js');
const tooltipStyles = read('radio-admin/dev/social-factory/action-tooltips.css');
const publishingSource = read('radio-admin/dev/social-factory/publishing-controls.js');

const reviewActionIds = [
  'saveReview',
  'approveReview',
  'holdReview',
  'reopenReview',
  'validateYoutubePublish',
  'publishYoutubeUnlisted',
  'validateSchedule',
  'scheduleApprovedItem',
  'cancelScheduledItem'
];

test('every Content Review action has a plain-English consequence tooltip', () => {
  for (const id of reviewActionIds) {
    assert.match(tooltipSource, new RegExp(`${id}:`));
  }
  assert.match(tooltipSource, /does not approve, schedule, upload, or publish/i);
  assert.match(tooltipSource, /performs no upload and publishes nothing/i);
  assert.match(tooltipSource, /as Unlisted/i);
  assert.match(tooltipSource, /does not publish the video immediately/i);
});

test('tooltips work for mouse rollover, disabled controls, and keyboard focus', () => {
  assert.match(tooltipSource, /document\.elementFromPoint/);
  assert.match(tooltipSource, /document\.addEventListener\('pointermove'/);
  assert.match(tooltipSource, /document\.addEventListener\('focusin'/);
  assert.match(tooltipSource, /button\.title = explanation/);
  assert.match(tooltipSource, /aria-describedby/);
  assert.match(tooltipSource, /MutationObserver/);
});

test('floating tooltip stays visible above the Social Factory interface', () => {
  assert.match(tooltipStyles, /position: fixed/);
  assert.match(tooltipStyles, /z-index: 100000/);
  assert.match(tooltipStyles, /max-width: min\(380px/);
  assert.match(tooltipStyles, /pointer-events: none/);
});

test('publishing controls load cache-busted tooltip resources', () => {
  assert.match(publishingSource, /action-tooltips\.css\?v=20260729-actiontips1/);
  assert.match(publishingSource, /action-tooltips\.js\?v=20260729-actiontips1/);
  assert.match(publishingSource, /loadActionTooltipResources\(\)/);
});
