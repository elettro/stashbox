import {
  ensureVideoFactoryStorage,
  getVideoFactoryJob,
  getVideoFactoryRouteMatch,
  handleAdminVideoFactoryRoute as handleFoundationRoute
} from './routes.mjs';
import { archiveVideoFactoryJob, restoreVideoFactoryJob } from './archive.mjs';
import {
  cancelVideoFactoryJob,
  checkVideoFactoryInfrastructure,
  completeVideoFactoryJob,
  getVideoFactorySignedAsset,
  launchVideoFactoryJob,
  updateVideoFactoryWorkerStatus
} from './render-control.mjs';
import { recoverStalePendingJobs } from './stale-jobs.mjs';

function methodFor(event) {
  return String(event?.requestContext?.http?.method || event?.httpMethod || '').toUpperCase();
}

function normalizedText(value) {
  return String(value || '').trim();
}

async function findNextQueuedSocialFactoryJob(completedJob, dependencies) {
  const campaignName = normalizedText(completedJob?.campaign_name);
  const result = await dependencies.client.query(
    `SELECT j.id
     FROM ${dependencies.qname('video_render_jobs')} j
     JOIN ${dependencies.qname('video_render_batches')} b ON b.id = j.batch_id
     WHERE j.status = 'draft'
       AND lower(coalesce(b.project_name, '')) = 'social factory'
     ORDER BY
       CASE WHEN $1 <> '' AND b.campaign_name = $1 THEN 0 ELSE 1 END,
       j.created_at ASC
     LIMIT 1`,
    [campaignName]
  );
  return normalizedText(result.rows?.[0]?.id);
}

export async function launchNextQueuedSocialFactoryJob(completedJob, dependencies = {}) {
  const projectName = normalizedText(completedJob?.project_name).toLowerCase();
  if (projectName !== 'social factory') {
    return {
      attempted: false,
      launched: false,
      reason: 'completed_job_not_social_factory'
    };
  }

  const nextJobId = await findNextQueuedSocialFactoryJob(completedJob, dependencies);
  if (!nextJobId) {
    return {
      attempted: false,
      launched: false,
      reason: 'social_factory_queue_empty'
    };
  }

  const result = await launchVideoFactoryJob(nextJobId, dependencies);
  const launched = result.statusCode === 202 && result.body?.success === true;
  return {
    attempted: true,
    launched,
    job_id: nextJobId,
    status: result.body?.status || '',
    reason: launched ? 'next_social_factory_render_started' : normalizedText(result.error || result.body?.error || 'launch_not_accepted'),
    active_job_id: normalizedText(result.active_job_id)
  };
}

export { getVideoFactoryRouteMatch };

export async function handleAdminVideoFactoryRoute(event, dependencies = {}) {
  const route = getVideoFactoryRouteMatch(dependencies.getRouteSegments(event));
  const method = methodFor(event);

  if (route.isRoute && route.resource === 'infrastructure' && !route.jobId) {
    if (method === 'OPTIONS') return dependencies.response(204, {});
    await dependencies.requireAdmin(event);
    if (method !== 'GET') return dependencies.response(404, { success: false, error: 'Not found.' });
    const infrastructure = await checkVideoFactoryInfrastructure(dependencies);
    return dependencies.response(200, infrastructure);
  }

  const action = route.action;
  const actionRoute = route.isRoute && route.resource === 'jobs' && route.jobId && action;

  if (!actionRoute) return handleFoundationRoute(event, dependencies);
  if (method === 'OPTIONS') return dependencies.response(204, {});

  await dependencies.requireAdmin(event);
  await ensureVideoFactoryStorage(dependencies);

  if ((action === 'render' || action === 'retry') && method === 'POST') {
    await recoverStalePendingJobs({
      client: dependencies.client,
      qname: dependencies.qname,
      excludeJobId: route.jobId
    });
    const result = await launchVideoFactoryJob(route.jobId, dependencies);
    return dependencies.response(result.statusCode, result.body || {
      success: false,
      error: result.error,
      active_job_id: result.active_job_id
    });
  }

  if (action === 'archive' && method === 'POST') {
    const result = await archiveVideoFactoryJob(route.jobId, dependencies);
    return dependencies.response(result.statusCode, result.body);
  }

  if (action === 'restore' && method === 'POST') {
    const result = await restoreVideoFactoryJob(route.jobId, dependencies);
    return dependencies.response(result.statusCode, result.body);
  }

  if (action === 'status' && method === 'POST') {
    const result = await updateVideoFactoryWorkerStatus(
      route.jobId,
      dependencies.parseBody(event),
      dependencies
    );
    return dependencies.response(result.statusCode, result.body);
  }

  if (action === 'complete' && method === 'POST') {
    const result = await completeVideoFactoryJob(
      route.jobId,
      dependencies.parseBody(event),
      dependencies
    );

    let queueHandoff = null;
    if (result.statusCode === 200 && result.body?.success === true) {
      try {
        const completedJob = await getVideoFactoryJob(route.jobId, dependencies);
        queueHandoff = await launchNextQueuedSocialFactoryJob(completedJob, dependencies);
      } catch (error) {
        console.error('[Video Factory queue] next Social Factory render launch failed', {
          completed_job_id: route.jobId,
          message: error?.message,
          stack: error?.stack
        });
        queueHandoff = {
          attempted: true,
          launched: false,
          reason: 'queue_handoff_failed'
        };
      }
    }

    return dependencies.response(result.statusCode, queueHandoff
      ? { ...result.body, queue_handoff: queueHandoff }
      : result.body);
  }

  if (action === 'cancel' && method === 'POST') {
    const result = await cancelVideoFactoryJob(route.jobId, dependencies);
    return dependencies.response(result.statusCode, result.body);
  }

  if ((action === 'download' || action === 'preview' || action === 'thumbnail') && method === 'GET') {
    const job = await getVideoFactoryJob(route.jobId, dependencies);
    if (!job) return dependencies.response(404, { success: false, error: 'Video Factory job not found.' });
    const result = await getVideoFactorySignedAsset(
      route.jobId,
      {
        kind: action === 'thumbnail' ? 'thumbnail' : 'video',
        mode: action === 'download' ? 'attachment' : 'inline',
        filename: job.output_filename
      },
      dependencies
    );
    return dependencies.response(result.statusCode, result.body);
  }

  return dependencies.response(404, { success: false, error: 'Not found.' });
}
