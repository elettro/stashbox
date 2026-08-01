import { createVideoOrchestratorService } from './video-orchestrator.mjs';
import { createReviewWorkflowService } from './review-workflow.mjs';

const REVIEW_PAGE_BASE = 'https://stashbox.com/radio-admin/dev/social-factory/content-review/preview/';
const ACTIVE_STATUSES = new Set(['draft', 'pending', 'preparing', 'rendering', 'uploading']);
const FAILED_STATUSES = new Set(['failed', 'cancelled', 'archived']);

function serviceError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function childEvent(event, body) {
  return {
    ...event,
    body: JSON.stringify(body),
    isBase64Encoded: false,
    queryStringParameters: null
  };
}

function reviewPageUrl(reviewId) {
  return `${REVIEW_PAGE_BASE}?review_id=${encodeURIComponent(reviewId)}`;
}

export function createFinalizeReviewService({
  orchestrator = createVideoOrchestratorService(),
  reviewWorkflow = createReviewWorkflowService()
} = {}) {
  return {
    async finalize(event, jobId) {
      const jobResult = await orchestrator.getJob(event, jobId);
      const job = jobResult?.job || {};
      const status = String(job.status || '').trim().toLowerCase();

      if (ACTIVE_STATUSES.has(status)) {
        return {
          ready_for_review: false,
          mode: 'render_in_progress',
          job_id: String(job.id || jobId),
          status,
          progress_percent: Number(job.render_recipe?.runtime?.progress_percent || 0),
          status_message: String(job.render_recipe?.runtime?.status_message || ''),
          review_page_url: ''
        };
      }

      if (FAILED_STATUSES.has(status)) {
        throw serviceError('render_not_reviewable', 409, {
          job_id: String(job.id || jobId),
          status,
          error_message: String(job.error_message || '')
        });
      }

      if (status !== 'completed') {
        throw serviceError('render_status_not_supported', 409, {
          job_id: String(job.id || jobId),
          status: status || 'unknown'
        });
      }

      const reviewId = `render-${String(job.id || jobId)}`;
      try {
        const existing = await reviewWorkflow.getReviewItem(event, reviewId);
        if (existing?.item?.id) {
          return {
            ready_for_review: true,
            staged: true,
            idempotent: true,
            mode: 'render_already_finalized_for_review',
            job_id: String(job.id || jobId),
            status: 'completed',
            review_id: reviewId,
            review_page_url: reviewPageUrl(reviewId),
            review_item: existing.item,
            publishing_triggered: false,
            youtube_published: false
          };
        }
      } catch (error) {
        if (Number(error?.statusCode || 0) !== 404) throw error;
      }

      const staged = await reviewWorkflow.stageRender(
        childEvent(event, { confirm_stage: true }),
        String(job.id || jobId)
      );
      const resolvedReviewId = String(
        staged?.review_item?.id || staged?.review_id || reviewId
      );

      return {
        ready_for_review: true,
        staged: true,
        idempotent: false,
        mode: 'render_finalized_for_review',
        job_id: String(job.id || jobId),
        status: 'completed',
        review_id: resolvedReviewId,
        review_page_url: reviewPageUrl(resolvedReviewId),
        review_item: staged?.review_item || null,
        publishing_triggered: false,
        youtube_published: false
      };
    }
  };
}
