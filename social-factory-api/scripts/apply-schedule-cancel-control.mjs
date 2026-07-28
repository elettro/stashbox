import fs from 'node:fs';

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected exactly one match, found ${count}.`);
  }
  return source.replace(before, after);
}

function insertBefore(source, marker, block, label) {
  const count = source.split(marker).length - 1;
  if (count !== 1) {
    throw new Error(`${label} expected exactly one marker, found ${count}.`);
  }
  return source.replace(marker, `${block}\n\n${marker}`);
}

const schedulePath = 'social-factory-api/schedule-publish.mjs';
const indexPath = 'social-factory-api/index.mjs';
const templatePath = 'social-factory-api/infrastructure/template.yaml';
const scheduleTestPath = 'social-factory-api/tests/schedule-publish.test.mjs';
const htmlPath = 'radio-admin/dev/social-factory/index.html';

let scheduleSource = fs.readFileSync(schedulePath, 'utf8');
const scheduleSuffix = `        item: updated
      };
    }
  };
}
`;
const cancelMethod = `        item: updated
      };
    },

    async cancel(event, reviewId) {
      const config = await secretStore.read(configSecretId);
      assertAdmin(event, config);
      const id = safeReviewId(reviewId);
      const input = parseBody(event);
      const item = await getReviewStore().getReview(id);
      if (!item) throw serviceError('review_item_not_found', 404);

      if (item.publishing_status === 'published' || item.platform_results?.youtube?.video_id) {
        throw serviceError('review_item_already_published', 409);
      }

      const existingSchedule = item.schedule || {};
      const existingName = String(existingSchedule.schedule_name || '').trim();
      if (!existingName || item.publishing_status !== 'scheduled') {
        return {
          cancelled: false,
          mode: 'not_scheduled',
          review_id: id,
          item
        };
      }

      if (input.confirm_cancel_schedule !== true) {
        return {
          cancelled: false,
          mode: 'validation_only',
          approval_required: true,
          review_id: id,
          schedule_name: existingName,
          scheduled_at: String(existingSchedule.scheduled_at || item.publish_settings?.scheduled_at || ''),
          item
        };
      }

      await getScheduleStore().delete(existingName);
      const timestamp = now().toISOString();
      const updated = {
        ...item,
        publishing_status: 'not_published',
        publish_settings: {
          ...item.publish_settings,
          scheduled_at: null
        },
        schedule: {
          ...existingSchedule,
          status: 'cancelled',
          cancelled_at: timestamp,
          last_error: null
        },
        updated_at: timestamp
      };
      await getReviewStore().putReview(id, updated);

      return {
        cancelled: true,
        mode: 'schedule_cancelled',
        review_id: id,
        schedule_name: existingName,
        item: updated,
        publishing_triggered: false,
        youtube_published: false
      };
    }
  };
}
`;
scheduleSource = replaceOnce(scheduleSource, scheduleSuffix, cancelMethod, 'schedule cancellation method');
fs.writeFileSync(schedulePath, scheduleSource);

let indexSource = fs.readFileSync(indexPath, 'utf8');
indexSource = replaceOnce(
  indexSource,
  `  const scheduleMatch = String(path).match(/^\\/social\\/review-items\\/([^/]+)\\/schedule$/);
  return {`,
  `  const scheduleMatch = String(path).match(/^\\/social\\/review-items\\/([^/]+)\\/schedule$/);
  const cancelScheduleMatch = String(path).match(/^\\/social\\/review-items\\/([^/]+)\\/schedule\\/cancel$/);
  return {`,
  'review cancel route match'
);
indexSource = replaceOnce(
  indexSource,
  `    publishReviewId: publishMatch ? decodeURIComponent(publishMatch[1]) : '',
    scheduleReviewId: scheduleMatch ? decodeURIComponent(scheduleMatch[1]) : ''`,
  `    publishReviewId: publishMatch ? decodeURIComponent(publishMatch[1]) : '',
    scheduleReviewId: scheduleMatch ? decodeURIComponent(scheduleMatch[1]) : '',
    cancelScheduleReviewId: cancelScheduleMatch ? decodeURIComponent(cancelScheduleMatch[1]) : ''`,
  'review cancel route contract'
);
indexSource = insertBefore(
  indexSource,
  `      if (method === 'POST' && review.scheduleReviewId) {`,
  `      if (method === 'POST' && review.cancelScheduleReviewId) {
        return json(200, {
          ok: true,
          ...(await getReviewScheduler().cancel(event, review.cancelScheduleReviewId))
        });
      }`,
  'review cancel handler'
);
fs.writeFileSync(indexPath, indexSource);

let templateSource = fs.readFileSync(templatePath, 'utf8');
const scheduleEvent = `        ReviewItemSchedule:
          Type: HttpApi
          Properties:
            ApiId: !Ref SocialFactoryHttpApi
            Path: /social/review-items/{reviewId}/schedule
            Method: POST
`;
const scheduleWithCancel = `${scheduleEvent}        ReviewItemScheduleCancel:
          Type: HttpApi
          Properties:
            ApiId: !Ref SocialFactoryHttpApi
            Path: /social/review-items/{reviewId}/schedule/cancel
            Method: POST
`;
templateSource = replaceOnce(templateSource, scheduleEvent, scheduleWithCancel, 'schedule cancel API Gateway event');
fs.writeFileSync(templatePath, templateSource);

let tests = fs.readFileSync(scheduleTestPath, 'utf8');
const cancelTests = `test('schedule cancellation validates without deleting the schedule', async () => {
  const base = fixture();
  await base.service.schedule(event({ confirm_schedule: true }), base.reviewId);
  base.operations.length = 0;

  const result = await base.service.cancel(event({ confirm_cancel_schedule: false }), base.reviewId);

  assert.equal(result.cancelled, false);
  assert.equal(result.mode, 'validation_only');
  assert.equal(result.approval_required, true);
  assert.equal(base.operations.length, 0);
  assert.equal(base.reviews.get(base.reviewId).publishing_status, 'scheduled');
});

test('confirmed schedule cancellation deletes the one-time schedule and resets publishing state', async () => {
  const base = fixture();
  const scheduled = await base.service.schedule(event({ confirm_schedule: true }), base.reviewId);
  base.operations.length = 0;

  const result = await base.service.cancel(event({ confirm_cancel_schedule: true }), base.reviewId);

  assert.equal(result.cancelled, true);
  assert.equal(result.mode, 'schedule_cancelled');
  assert.deepEqual(base.operations, [{ action: 'delete', name: scheduled.schedule_name }]);
  assert.equal(base.reviews.get(base.reviewId).publishing_status, 'not_published');
  assert.equal(base.reviews.get(base.reviewId).publish_settings.scheduled_at, null);
  assert.equal(base.reviews.get(base.reviewId).schedule.status, 'cancelled');
  assert.equal(result.publishing_triggered, false);
  assert.equal(result.youtube_published, false);
});

test('cancelling an unscheduled review is idempotent', async () => {
  const base = fixture();
  const result = await base.service.cancel(event({ confirm_cancel_schedule: true }), base.reviewId);

  assert.equal(result.cancelled, false);
  assert.equal(result.mode, 'not_scheduled');
  assert.equal(base.operations.length, 0);
  assert.equal(base.reviews.get(base.reviewId).publishing_status, 'not_published');
});`;
tests = insertBefore(tests, `test('schedule requires an approved item', async () => {`, cancelTests, 'schedule cancel unit tests');
fs.writeFileSync(scheduleTestPath, tests);

let html = fs.readFileSync(htmlPath, 'utf8');
html = replaceOnce(
  html,
  `  <script src="./publishing-controls.js?v=20260728-publish1"></script>`,
  `  <script src="./publishing-controls.js?v=20260728-publish1"></script>
  <script src="./schedule-controls.js?v=20260728-schedule1"></script>`,
  'schedule controls script tag'
);
fs.writeFileSync(htmlPath, html);

console.log('Applied schedule and cancellation API, tests, route, and interface script loading.');
