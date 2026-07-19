import {
  ensureVideoFactoryStorage,
  getVideoFactoryJob,
  getVideoFactoryRouteMatch,
  handleAdminVideoFactoryRoute as handleFoundationRoute
} from './routes.mjs';
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
    return dependencies.response(result.statusCode, result.body);
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
