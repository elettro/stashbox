import { createYoutubeOAuthService } from './youtube-oauth.mjs';
import { createYoutubePublishService } from './youtube-publish.mjs';
import { createVideoOrchestratorService } from './video-orchestrator.mjs';
import { createBatchCampaignService } from './batch-campaigns.mjs';
import { createBatchOperationsService } from './batch-operations.mjs';
import { createReviewWorkflowService } from './review-workflow.mjs';
import { createReviewActionService } from './review-actions.mjs';
import { createReviewPublishService } from './review-publish.mjs';
import { createSchedulePublishService } from './schedule-publish.mjs';
import { createBatchScheduleService } from './batch-schedule.mjs';
import { createRequestAuthenticator } from './request-auth.mjs';
import { createTopSongAnalyticsService } from './top-song-analytics.mjs';

const SERVICE_NAME = 'stashbox-social-api';
const SERVICE_VERSION = '0.8.0';

function getJsonHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': process.env.ALLOWED_ORIGIN || 'https://stashbox.com',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,x-admin-token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  };
}

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      ...getJsonHeaders(),
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

function getRequestMethod(event = {}) {
  return String(
    event?.requestContext?.http?.method ||
    event?.httpMethod ||
    'GET'
  ).toUpperCase();
}

function getRequestPath(event = {}) {
  const rawPath = event?.rawPath || event?.requestContext?.http?.path || event?.path || '/';
  const stage = event?.requestContext?.stage;

  if (stage && rawPath.startsWith(`/${stage}/`)) {
    return rawPath.slice(stage.length + 1);
  }

  return rawPath;
}

function errorResponse(error) {
  const statusCode = Number(error?.statusCode || 500);
  const body = {
    ok: false,
    error: error?.message || 'internal_error'
  };

  if (error?.details) {
    body.details = error.details;
  }

  if (statusCode >= 500) {
    console.error('Social Factory API error', {
      error: body.error,
      stack: error?.stack
    });
  }

  return json(statusCode, body);
}

function safeReviewPublishErrorResponse(error) {
  const statusCode = Number(error?.statusCode || 500);
  const rawCode = String(error?.message || '');
  const errorCode = /^[a-z0-9_]{1,100}$/.test(rawCode)
    ? rawCode
    : 'review_publish_validation_failed';
  const failureDiagnostic = error?.details?.diagnostic || {};
  const safeDetails = {};
  const allowedDetailKeys = new Set([
    'allowed',
    'aspect_ratio',
    'content_length',
    'content_type',
    'expected_size_bytes',
    'format',
    'max_bytes',
    'max_characters',
    'max_direct_publish_bytes',
    'mode',
    'next_step',
    'publishing_status',
    'review_id',
    'scheduled_at',
    'upstream_status'
  ]);
  for (const [key, value] of Object.entries(error?.details || {})) {
    if (!allowedDetailKeys.has(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safeDetails[key] = value;
    } else if (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) {
      safeDetails[key] = value;
    }
  }
  return json(statusCode, {
    ok: false,
    error: errorCode,
    details: safeDetails,
    diagnostic: {
      stage: 'review_publish_validation',
      error_code: errorCode,
      status_code: statusCode,
      ...(typeof failureDiagnostic.stage === 'string'
        ? { failure_stage: failureDiagnostic.stage }
        : {}),
      ...(typeof failureDiagnostic.category === 'string'
        ? { failure_category: failureDiagnostic.category }
        : {}),
      ...(typeof failureDiagnostic.dependency === 'string'
        ? { dependency: failureDiagnostic.dependency }
        : {}),
      ...(typeof failureDiagnostic.internal_error_code === 'string'
        ? { internal_error_code: failureDiagnostic.internal_error_code }
        : {}),
      ...(typeof failureDiagnostic.provider_error_code === 'string'
        ? { provider_error_code: failureDiagnostic.provider_error_code }
        : {}),
      ...(Number.isInteger(failureDiagnostic.upstream_status)
        ? { upstream_status: failureDiagnostic.upstream_status }
        : {}),
      ...(failureDiagnostic.category === 'oauth_token_refresh_failed'
        ? { message: 'Google OAuth rejected the access-token refresh request.' }
        : failureDiagnostic.category === 'staging_object_head_failed'
          ? { message: 'The staged media object could not be inspected in S3.' }
          : failureDiagnostic.category === 'credential_read_failed' ||
              failureDiagnostic.category === 'credential_config_read_failed' ||
              failureDiagnostic.category === 'refreshed_token_persist_failed'
            ? { message: 'YouTube credential data could not be accessed in Secrets Manager.' }
            : {})
    }
  });
}

function publicPresignContract(result = {}) {
  const contentType = String(result?.required_headers?.['Content-Type'] || '').trim();
  return {
    ...result,
    required_headers: contentType ? { 'Content-Type': contentType } : {}
  };
}

function orchestrationRoute(path) {
  const jobMatch = String(path).match(/^\/social\/orchestration\/render-jobs\/([^/]+)$/);
  const launchMatch = String(path).match(/^\/social\/orchestration\/render-jobs\/([^/]+)\/launch$/);
  const stageMatch = String(path).match(/^\/social\/orchestration\/render-jobs\/([^/]+)\/stage$/);
  return {
    jobId: jobMatch ? decodeURIComponent(jobMatch[1]) : '',
    launchJobId: launchMatch ? decodeURIComponent(launchMatch[1]) : '',
    stageJobId: stageMatch ? decodeURIComponent(stageMatch[1]) : ''
  };
}

function reviewRoute(path) {
  const itemMatch = String(path).match(/^\/social\/review-items\/([^/]+)$/);
  const previewMatch = String(path).match(/^\/social\/review-items\/([^/]+)\/preview$/);
  const saveMatch = String(path).match(/^\/social\/review-items\/([^/]+)\/save$/);
  const decisionMatch = String(path).match(/^\/social\/review-items\/([^/]+)\/decision$/);
  const publishMatch = String(path).match(/^\/social\/review-items\/([^/]+)\/publish$/);
  const scheduleMatch = String(path).match(/^\/social\/review-items\/([^/]+)\/schedule$/);
  const cancelScheduleMatch = String(path).match(/^\/social\/review-items\/([^/]+)\/schedule\/cancel$/);
  return {
    reviewId: itemMatch ? decodeURIComponent(itemMatch[1]) : '',
    previewReviewId: previewMatch ? decodeURIComponent(previewMatch[1]) : '',
    saveReviewId: saveMatch ? decodeURIComponent(saveMatch[1]) : '',
    decisionReviewId: decisionMatch ? decodeURIComponent(decisionMatch[1]) : '',
    publishReviewId: publishMatch ? decodeURIComponent(publishMatch[1]) : '',
    scheduleReviewId: scheduleMatch ? decodeURIComponent(scheduleMatch[1]) : '',
    cancelScheduleReviewId: cancelScheduleMatch ? decodeURIComponent(cancelScheduleMatch[1]) : ''
  };
}

function videoImportRoute(path) {
  const completeMatch = String(path).match(/^\/social\/uploads\/imports\/([^/]+)\/complete$/);
  return {
    completeImportId: completeMatch ? decodeURIComponent(completeMatch[1]) : '',
    statusBatchId: String(path).match(/^\/social\/uploads\/imports\/([^/]+)$/)?.[1] || ''
  };
}

export function createHandler({
  youtubeOAuth = createYoutubeOAuthService(),
  youtubePublish = null,
  videoOrchestrator = null,
  batchCampaigns = null,
  batchOperations = null,
  reviewWorkflow = null,
  reviewActions = null,
  reviewPublisher = null,
  reviewScheduler = null,
  batchScheduler = null,
  topSongAnalytics = null,
  requestAuthenticator = process.env.SOCIAL_CUSTOM_GPT_SECRET ? createRequestAuthenticator() : null
} = {}) {
  let resolvedYoutubePublish = youtubePublish;
  let resolvedVideoOrchestrator = videoOrchestrator;
  let resolvedBatchCampaigns = batchCampaigns;
  let resolvedBatchOperations = batchOperations;
  let resolvedReviewWorkflow = reviewWorkflow;
  let resolvedReviewActions = reviewActions;
  let resolvedReviewPublisher = reviewPublisher;
  let resolvedReviewScheduler = reviewScheduler;
  let resolvedBatchScheduler = batchScheduler;
  let resolvedTopSongAnalytics = topSongAnalytics;

  function getYoutubePublish() {
    if (!resolvedYoutubePublish) resolvedYoutubePublish = createYoutubePublishService();
    return resolvedYoutubePublish;
  }

  function getVideoOrchestrator() {
    if (!resolvedVideoOrchestrator) resolvedVideoOrchestrator = createVideoOrchestratorService();
    return resolvedVideoOrchestrator;
  }

  function getBatchCampaigns() {
    if (!resolvedBatchCampaigns) {
      resolvedBatchCampaigns = createBatchCampaignService({ orchestrator: getVideoOrchestrator() });
    }
    return resolvedBatchCampaigns;
  }

  function getReviewWorkflow() {
    if (!resolvedReviewWorkflow) resolvedReviewWorkflow = createReviewWorkflowService();
    return resolvedReviewWorkflow;
  }

  function getBatchOperations() {
    if (!resolvedBatchOperations) {
      resolvedBatchOperations = createBatchOperationsService({
        orchestrator: getVideoOrchestrator(),
        reviewWorkflow: getReviewWorkflow()
      });
    }
    return resolvedBatchOperations;
  }

  function getReviewActions() {
    if (!resolvedReviewActions) resolvedReviewActions = createReviewActionService();
    return resolvedReviewActions;
  }

  function getReviewPublisher() {
    if (!resolvedReviewPublisher) {
      resolvedReviewPublisher = createReviewPublishService({ youtubePublish: getYoutubePublish() });
    }
    return resolvedReviewPublisher;
  }

  function getReviewScheduler() {
    if (!resolvedReviewScheduler) resolvedReviewScheduler = createSchedulePublishService();
    return resolvedReviewScheduler;
  }

  function getBatchScheduler() {
    if (!resolvedBatchScheduler) {
      resolvedBatchScheduler = createBatchScheduleService({ scheduler: getReviewScheduler() });
    }
    return resolvedBatchScheduler;
  }

  function getTopSongAnalytics() {
    if (!resolvedTopSongAnalytics) resolvedTopSongAnalytics = createTopSongAnalyticsService();
    return resolvedTopSongAnalytics;
  }

  return async function socialFactoryHandler(event = {}) {
    const method = getRequestMethod(event);
    const path = getRequestPath(event);
    const route = orchestrationRoute(path);
    const review = reviewRoute(path);
    const videoImport = videoImportRoute(path);

    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: getJsonHeaders(),
        body: ''
      };
    }

    let authenticatedActor = null;

    try {
      if (requestAuthenticator) {
        const normalized = await requestAuthenticator.normalize(event, { method, path });
        event = normalized.event;
        authenticatedActor = normalized.actor;
        if (authenticatedActor) {
          console.info('Social Factory authenticated action', {
            actor_id: authenticatedActor.id,
            actor_type: authenticatedActor.type,
            permission: authenticatedActor.permission,
            method,
            path
          });
        }
      }

      if (method === 'GET' && path === '/social/health') {
        const queueConfigured = Boolean(process.env.SOCIAL_SCHEDULE_QUEUE_ARN);
        const schedulerConfigured = Boolean(
          process.env.SOCIAL_SCHEDULE_GROUP && process.env.SOCIAL_SCHEDULER_ROLE_ARN
        );
        return json(200, {
          ok: true,
          service: SERVICE_NAME,
          version: SERVICE_VERSION,
          environment: process.env.APP_ENV || 'dev',
          timestamp: new Date().toISOString(),
          isolation: {
            databaseConfigured: false,
            s3Configured: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            queueConfigured,
            secretsConfigured: true,
            youtubeOauthConfigured: true,
            youtubePublishingConfigured: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            mainRadioApiDependency: false,
            radioApiBridgeSupported: true,
            topSongAnalyticsSupported: true,
            batchCampaignPlanningSupported: true,
            batchDraftCreationSupported: true,
            batchRenderOperationsSupported: true,
            batchRenderLaunchRequiresSeparateApproval: true,
            batchStagingSupported: Boolean(
              process.env.SOCIAL_PUBLISH_BUCKET && process.env.VIDEO_FACTORY_SOURCE_BUCKET
            ),
            renderStagingSupported: Boolean(
              process.env.SOCIAL_PUBLISH_BUCKET && process.env.VIDEO_FACTORY_SOURCE_BUCKET
            ),
            contentReviewSupported: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            reviewEditingSupported: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            reviewPublishingSupported: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            scheduledPublishingConfigured: queueConfigured && schedulerConfigured,
            securePreviewSupported: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            customGptAuthenticationConfigured: Boolean(process.env.SOCIAL_CUSTOM_GPT_SECRET),
            executionRoleScope: 'cloudwatch-youtube-oauth-secrets-social-publish-video-factory-read-and-scheduler'
          }
        });
      }

      if (method === 'GET' && path === '/social/youtube/oauth/start') {
        return await youtubeOAuth.start(event);
      }

      if (method === 'GET' && path === '/social/youtube/oauth/callback') {
        return await youtubeOAuth.callback(event);
      }

      if (method === 'GET' && path === '/social/youtube/status') {
        return json(200, { ok: true, ...(await youtubeOAuth.status(event)) });
      }

      if (method === 'POST' && path === '/social/youtube/disconnect') {
        return json(200, { ok: true, ...(await youtubeOAuth.disconnect(event)) });
      }

      if (method === 'POST' && path === '/social/uploads/presign') {
        const result = await getYoutubePublish().presign(event);
        return json(200, { ok: true, ...publicPresignContract(result) });
      }

      if (method === 'POST' && path === '/social/uploads/imports') {
        return json(202, {
          ok: true,
          ...(await getReviewWorkflow().queueChatGptImport(event))
        });
      }

      if (method === 'GET' && videoImport.statusBatchId) {
        return json(200, {
          ok: true,
          ...(await getReviewWorkflow().getChatGptImportBatch(event, videoImport.statusBatchId))
        });
      }

      if (method === 'POST' && path === '/social/uploads/imports/presign') {
        return json(201, { ok: true, ...(await getReviewWorkflow().createVideoImport(event)) });
      }

      if (method === 'POST' && videoImport.completeImportId) {
        const result = await getReviewWorkflow().completeVideoImport(event, videoImport.completeImportId);
        return json(result.imported ? 201 : 200, { ok: true, ...result });
      }

      if (method === 'POST' && path === '/social/youtube/publish') {
        return json(200, { ok: true, ...(await getYoutubePublish().publish(event)) });
      }

      if (method === 'GET' && path === '/social/analytics/top-songs') {
        return json(200, { ok: true, ...(await getTopSongAnalytics().topSongs(event)) });
      }

      if (method === 'GET' && path === '/social/orchestration/candidates') {
        return json(200, { ok: true, ...(await getVideoOrchestrator().candidates(event)) });
      }

      if (method === 'POST' && path === '/social/orchestration/batch-plan') {
        return json(200, { ok: true, ...(await getBatchCampaigns().plan(event)) });
      }

      if (method === 'POST' && path === '/social/orchestration/batch-drafts') {
        const result = await getBatchCampaigns().createDrafts(event);
        return json(result.created ? 201 : 200, { ok: true, ...result });
      }

      if (method === 'GET' && path === '/social/orchestration/batch-jobs') {
        return json(200, { ok: true, ...(await getBatchOperations().list(event)) });
      }

      if (method === 'POST' && path === '/social/orchestration/batch-launch') {
        return json(200, { ok: true, ...(await getBatchOperations().launch(event)) });
      }

      if (method === 'POST' && path === '/social/orchestration/batch-stage') {
        return json(200, { ok: true, ...(await getBatchOperations().stage(event)) });
      }

      if (method === 'GET' && path === '/social/orchestration/render-jobs') {
        return json(200, { ok: true, ...(await getVideoOrchestrator().listJobs(event)) });
      }

      if (method === 'POST' && path === '/social/orchestration/render-jobs') {
        return json(201, { ok: true, ...(await getVideoOrchestrator().createDraft(event)) });
      }

      if (method === 'POST' && route.stageJobId) {
        return json(200, {
          ok: true,
          ...(await getReviewWorkflow().stageRender(event, route.stageJobId))
        });
      }

      if (method === 'GET' && route.jobId) {
        return json(200, { ok: true, ...(await getVideoOrchestrator().getJob(event, route.jobId)) });
      }

      if (method === 'POST' && route.launchJobId) {
        return json(200, { ok: true, ...(await getVideoOrchestrator().launch(event, route.launchJobId)) });
      }

      if (method === 'GET' && path === '/social/review-items') {
        return json(200, { ok: true, ...(await getReviewWorkflow().listReviewItems(event)) });
      }

      if (method === 'POST' && review.previewReviewId) {
        return json(200, {
          ok: true,
          ...(await getReviewActions().preview(event, review.previewReviewId))
        });
      }

      if (method === 'POST' && review.saveReviewId) {
        return json(200, {
          ok: true,
          ...(await getReviewActions().save(event, review.saveReviewId))
        });
      }

      if (method === 'POST' && review.decisionReviewId) {
        return json(200, {
          ok: true,
          ...(await getReviewActions().decision(event, review.decisionReviewId))
        });
      }

      if (method === 'POST' && review.publishReviewId) {
        try {
          return json(200, {
            ok: true,
            ...(await getReviewPublisher().publish(event, review.publishReviewId))
          });
        } catch (error) {
          return safeReviewPublishErrorResponse(error);
        }
      }

      if (method === 'POST' && path === '/social/review-items/batch-schedule') {
        return json(200, {
          ok: true,
          ...(await getBatchScheduler().schedule(event))
        });
      }

      if (method === 'POST' && review.cancelScheduleReviewId) {
        try {
          return json(200, {
            ok: true,
            ...(await getReviewScheduler().cancel(event, review.cancelScheduleReviewId))
          });
        } catch (error) {
          const statusCode = Number(error?.statusCode || 500);
          if (statusCode === 401 || statusCode === 403) {
            throw error;
          }

          const details = error?.details && typeof error.details === 'object'
            ? error.details
            : {};
          return json(200, {
            ok: false,
            cancelled: false,
            mode: 'execution_error',
            review_id: review.cancelScheduleReviewId,
            schedule_name: details.schedule_name || null,
            publishing_status: details.publishing_status || null,
            publishing_triggered: false,
            youtube_published: false,
            error: error?.message || 'schedule_cancel_failed',
            details: {
              ...details,
              error_name: details.error_name || error?.name || 'Error',
              status_code: Number(error?.statusCode || 500)
            }
          });
        }
      }

      if (method === 'POST' && review.scheduleReviewId) {
        return json(200, {
          ok: true,
          ...(await getReviewScheduler().schedule(event, review.scheduleReviewId))
        });
      }

      if (method === 'GET' && review.reviewId) {
        return json(200, {
          ok: true,
          ...(await getReviewWorkflow().getReviewItem(event, review.reviewId))
        });
      }

      return json(404, {
        ok: false,
        error: 'route_not_found',
        method,
        path
      });
    } catch (error) {
      if (authenticatedActor) {
        console.warn('Social Factory authenticated action failed', {
          actor_id: authenticatedActor.id,
          actor_type: authenticatedActor.type,
          permission: authenticatedActor.permission,
          method,
          path,
          error: error?.message || 'internal_error'
        });
      }
      return errorResponse(error);
    }
  };
}

export const handler = createHandler();