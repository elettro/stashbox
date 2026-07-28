import { createYoutubeOAuthService } from './youtube-oauth.mjs';
import { createYoutubePublishService } from './youtube-publish.mjs';
import { createVideoOrchestratorService } from './video-orchestrator.mjs';
import { createBatchCampaignService } from './batch-campaigns.mjs';
import { createReviewWorkflowService } from './review-workflow.mjs';
import { createReviewActionService } from './review-actions.mjs';

const SERVICE_NAME = 'stashbox-social-api';
const SERVICE_VERSION = '0.6.0';

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
  return {
    reviewId: itemMatch ? decodeURIComponent(itemMatch[1]) : '',
    previewReviewId: previewMatch ? decodeURIComponent(previewMatch[1]) : '',
    saveReviewId: saveMatch ? decodeURIComponent(saveMatch[1]) : '',
    decisionReviewId: decisionMatch ? decodeURIComponent(decisionMatch[1]) : ''
  };
}

export function createHandler({
  youtubeOAuth = createYoutubeOAuthService(),
  youtubePublish = null,
  videoOrchestrator = null,
  batchCampaigns = null,
  reviewWorkflow = null,
  reviewActions = null
} = {}) {
  let resolvedYoutubePublish = youtubePublish;
  let resolvedVideoOrchestrator = videoOrchestrator;
  let resolvedBatchCampaigns = batchCampaigns;
  let resolvedReviewWorkflow = reviewWorkflow;
  let resolvedReviewActions = reviewActions;

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

  function getReviewActions() {
    if (!resolvedReviewActions) resolvedReviewActions = createReviewActionService();
    return resolvedReviewActions;
  }

  return async function socialFactoryHandler(event = {}) {
    const method = getRequestMethod(event);
    const path = getRequestPath(event);
    const route = orchestrationRoute(path);
    const review = reviewRoute(path);

    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: getJsonHeaders(),
        body: ''
      };
    }

    try {
      if (method === 'GET' && path === '/social/health') {
        return json(200, {
          ok: true,
          service: SERVICE_NAME,
          version: SERVICE_VERSION,
          environment: process.env.APP_ENV || 'dev',
          timestamp: new Date().toISOString(),
          isolation: {
            databaseConfigured: false,
            s3Configured: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            queueConfigured: false,
            secretsConfigured: true,
            youtubeOauthConfigured: true,
            youtubePublishingConfigured: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            mainRadioApiDependency: false,
            radioApiBridgeSupported: true,
            batchCampaignPlanningSupported: true,
            batchDraftCreationSupported: true,
            batchRenderLaunchRequiresSeparateApproval: true,
            renderStagingSupported: Boolean(
              process.env.SOCIAL_PUBLISH_BUCKET && process.env.VIDEO_FACTORY_SOURCE_BUCKET
            ),
            contentReviewSupported: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            reviewEditingSupported: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            securePreviewSupported: Boolean(process.env.SOCIAL_PUBLISH_BUCKET),
            executionRoleScope: 'cloudwatch-youtube-oauth-secrets-social-publish-and-video-factory-read'
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

      if (method === 'POST' && path === '/social/youtube/publish') {
        return json(200, { ok: true, ...(await getYoutubePublish().publish(event)) });
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
      return errorResponse(error);
    }
  };
}

export const handler = createHandler();
