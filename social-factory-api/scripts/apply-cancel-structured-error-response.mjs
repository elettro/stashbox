import fs from 'node:fs';

const path = 'social-factory-api/index.mjs';
const source = fs.readFileSync(path, 'utf8');
const before = `      if (method === 'POST' && review.cancelScheduleReviewId) {\n        return json(200, {\n          ok: true,\n          ...(await getReviewScheduler().cancel(event, review.cancelScheduleReviewId))\n        });\n      }`;
const after = `      if (method === 'POST' && review.cancelScheduleReviewId) {\n        try {\n          return json(200, {\n            ok: true,\n            ...(await getReviewScheduler().cancel(event, review.cancelScheduleReviewId))\n          });\n        } catch (error) {\n          const details = error?.details && typeof error.details === 'object'\n            ? error.details\n            : {};\n          return json(200, {\n            ok: false,\n            cancelled: false,\n            mode: 'execution_error',\n            review_id: review.cancelScheduleReviewId,\n            schedule_name: details.schedule_name || null,\n            publishing_status: details.publishing_status || null,\n            publishing_triggered: false,\n            youtube_published: false,\n            error: error?.message || 'schedule_cancel_failed',\n            details: {\n              ...details,\n              error_name: details.error_name || error?.name || 'Error',\n              status_code: Number(error?.statusCode || 500)\n            }\n          });\n        }\n      }`;

if (!source.includes(before)) {
  throw new Error('cancel route block not found or already patched');
}

fs.writeFileSync(path, source.replace(before, after));
console.log('Applied structured 200 response for schedule cancellation failures.');
