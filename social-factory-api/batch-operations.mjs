import { createVideoOrchestratorService } from './video-orchestrator.mjs';
import { createReviewWorkflowService } from './review-workflow.mjs';

const MAX_OPERATION_JOBS = 10;
const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);
const TERMINAL_FAILURE_STATUSES = new Set(['failed', 'cancelled', 'archived']);

function serviceError(message, statusCode = 400, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function parseBody(event = {}) {
  if (!event.body) return {};
  const text = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : String(event.body);
  try {
    return JSON.parse(text);
  } catch {
    throw serviceError('invalid_json_body', 400);
  }
}

function cleanText(value, maximum = 180) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maximum);
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function selectionFrom(event, body = null) {
  const source = body || event?.queryStringParameters || {};
  const jobIds = [...new Set(stringList(source.job_ids))].slice(0, MAX_OPERATION_JOBS + 1);
  const campaignName = cleanText(source.campaign_name, 100);

  if (jobIds.length > MAX_OPERATION_JOBS) {
    throw serviceError('batch_operation_job_limit_exceeded', 422, {
      maximum_jobs: MAX_OPERATION_JOBS
    });
  }

  if (!jobIds.length && !campaignName) {
    throw serviceError('campaign_name_or_job_ids_required', 422);
  }

  return { jobIds, campaignName };
}

function safeJob(job = {}) {
  const outputs = Array.isArray(job.outputs) ? job.outputs : [];
  const firstOutput = outputs[0] || {};
  return {
    id: String(job.id || ''),
    batch_id: String(job.batch_id || ''),
    batch_name: String(job.batch_name || ''),
    campaign_name: String(job.campaign_name || ''),
    song_key: String(job.song_key || ''),
    song_title: String(job.song_title || ''),
    artist: String(job.artist || ''),
    status: String(job.status || ''),
    active: Boolean(job.active),
    ready_for_staging: Boolean(job.ready_for_staging),
    duration_mode: String(job.duration_mode || ''),
    duration_seconds: job.duration_seconds == null ? null : Number(job.duration_seconds),
    aspect_ratio: String(job.aspect_ratio || ''),
    width: Number(job.width || 0),
    height: Number(job.height || 0),
    fps: Number(job.fps || 0),
    output_filename: String(job.output_filename || ''),
    output_url: String(job.output_url || firstOutput.output_url || ''),
    thumbnail_url: String(job.thumbnail_url || firstOutput.thumbnail_url || ''),
    error_message: String(job.error_message || ''),
    created_at: String(job.created_at || ''),
    updated_at: String(job.updated_at || ''),
    started_at: String(job.started_at || ''),
    completed_at: String(job.completed_at || '')
  };
}

function matchesSelection(job, selection) {
  if (selection.jobIds.length) return selection.jobIds.includes(String(job.id));
  return String(job.campaign_name || '') === selection.campaignName;
}

function summarize(jobs) {
  const counts = {
    total: jobs.length,
    draft: 0,
    active: 0,
    completed: 0,
    failed: 0,
    other: 0
  };

  for (const job of jobs) {
    const status = lower(job.status);
    if (status === 'draft') counts.draft += 1;
    else if (ACTIVE_STATUSES.has(status)) counts.active += 1;
    else if (status === 'completed') counts.completed += 1;
    else if (TERMINAL_FAILURE_STATUSES.has(status)) counts.failed += 1;
    else counts.other += 1;
  }
  return counts;
}

function childEvent(event, body) {
  return {
    ...event,
    body: JSON.stringify(body),
    isBase64Encoded: false,
    queryStringParameters: null
  };
}

export function createBatchOperationsService({
  orchestrator = createVideoOrchestratorService(),
  reviewWorkflow = createReviewWorkflowService()
} = {}) {
  async function selectedJobs(event, selection) {
    const result = await orchestrator.listJobs({
      ...event,
      body: undefined,
      queryStringParameters: { limit: '250' }
    });
    const allJobs = Array.isArray(result?.jobs) ? result.jobs : [];
    const jobs = allJobs.filter((job) => matchesSelection(job, selection));

    if (!jobs.length) {
      throw serviceError('batch_operation_jobs_not_found', 404, {
        campaign_name: selection.campaignName,
        job_ids: selection.jobIds
      });
    }

    if (selection.jobIds.length) {
      const foundIds = new Set(jobs.map((job) => String(job.id)));
      const missing = selection.jobIds.filter((id) => !foundIds.has(id));
      if (missing.length) {
        throw serviceError('batch_operation_jobs_not_found', 404, { job_ids: missing });
      }
    }

    if (jobs.length > MAX_OPERATION_JOBS) {
      throw serviceError('batch_operation_job_limit_exceeded', 422, {
        maximum_jobs: MAX_OPERATION_JOBS,
        selected_jobs: jobs.length,
        use_job_ids_to_process_smaller_groups: true
      });
    }

    return jobs;
  }

  return {
    async list(event) {
      const selection = selectionFrom(event);
      const jobs = await selectedJobs(event, selection);
      const safeJobs = jobs.map(safeJob);
      return {
        campaign_name: selection.campaignName || String(safeJobs[0]?.campaign_name || ''),
        job_count: safeJobs.length,
        counts: summarize(safeJobs),
        jobs: safeJobs,
        youtube_published: false
      };
    },

    async launch(event) {
      const input = parseBody(event);
      const selection = selectionFrom(event, input);
      const jobs = await selectedJobs(event, selection);
      const draftJobs = jobs.filter((job) => lower(job.status) === 'draft');
      const skippedJobs = jobs.filter((job) => lower(job.status) !== 'draft');

      if (input.confirm_render_batch !== true) {
        return {
          launched: false,
          mode: 'validation_only',
          approval_required: true,
          campaign_name: selection.campaignName || String(jobs[0]?.campaign_name || ''),
          selected_job_count: jobs.length,
          would_launch_count: draftJobs.length,
          would_skip_count: skippedJobs.length,
          jobs: jobs.map(safeJob),
          youtube_published: false
        };
      }

      const launched = [];
      const skipped = skippedJobs.map((job) => ({
        reason: ACTIVE_STATUSES.has(lower(job.status))
          ? 'already_active'
          : lower(job.status) === 'completed'
            ? 'already_completed'
            : 'status_not_launchable',
        job: safeJob(job)
      }));
      const failed = [];

      for (const job of draftJobs) {
        try {
          const result = await orchestrator.launch(
            childEvent(event, { confirm_render: true }),
            String(job.id)
          );
          launched.push({
            job: safeJob(result.job || job),
            downstream: result.downstream || null
          });
        } catch (error) {
          failed.push({
            job: safeJob(job),
            error: String(error?.message || 'render_launch_failed'),
            details: error?.details || null
          });
        }
      }

      return {
        launched: launched.length > 0,
        mode: 'render_batch_launched',
        campaign_name: selection.campaignName || String(jobs[0]?.campaign_name || ''),
        selected_job_count: jobs.length,
        launched_job_count: launched.length,
        skipped_job_count: skipped.length,
        failed_job_count: failed.length,
        launched_jobs: launched,
        skipped_jobs: skipped,
        failed_jobs: failed,
        publishing_triggered: false,
        youtube_published: false
      };
    },

    async stage(event) {
      const input = parseBody(event);
      const selection = selectionFrom(event, input);
      const jobs = await selectedJobs(event, selection);
      const completedJobs = jobs.filter((job) => lower(job.status) === 'completed');
      const skippedJobs = jobs.filter((job) => lower(job.status) !== 'completed');

      if (input.confirm_stage_batch !== true) {
        return {
          staged: false,
          mode: 'validation_only',
          approval_required: true,
          campaign_name: selection.campaignName || String(jobs[0]?.campaign_name || ''),
          selected_job_count: jobs.length,
          would_stage_count: completedJobs.length,
          would_skip_count: skippedJobs.length,
          jobs: jobs.map(safeJob),
          youtube_published: false
        };
      }

      const staged = [];
      const skipped = skippedJobs.map((job) => ({
        reason: 'render_not_completed',
        job: safeJob(job)
      }));
      const failed = [];

      for (const job of completedJobs) {
        try {
          const result = await reviewWorkflow.stageRender(
            childEvent(event, { confirm_stage: true }),
            String(job.id)
          );
          staged.push({
            job: safeJob(job),
            review_item: result.review_item
          });
        } catch (error) {
          failed.push({
            job: safeJob(job),
            error: String(error?.message || 'render_stage_failed'),
            details: error?.details || null
          });
        }
      }

      return {
        staged: staged.length > 0,
        mode: 'completed_renders_staged',
        campaign_name: selection.campaignName || String(jobs[0]?.campaign_name || ''),
        selected_job_count: jobs.length,
        staged_job_count: staged.length,
        skipped_job_count: skipped.length,
        failed_job_count: failed.length,
        staged_jobs: staged,
        skipped_jobs: skipped,
        failed_jobs: failed,
        publishing_triggered: false,
        youtube_published: false
      };
    }
  };
}
