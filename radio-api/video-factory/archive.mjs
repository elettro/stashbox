const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);
const RESTORABLE_STATUSES = new Set(['draft', 'completed', 'failed', 'cancelled']);

function requireDependency(name, value) {
  if (!value) throw new Error(`Video Factory archive dependency ${name} is required.`);
  return value;
}

async function findJob(jobId, { client, qname }) {
  const result = await client.query(
    `SELECT id, status, output_url, render_recipe
     FROM ${qname('video_render_jobs')}
     WHERE id = $1
     LIMIT 1`,
    [jobId]
  );
  return result.rows[0] || null;
}

export async function archiveVideoFactoryJob(jobId, dependencies = {}) {
  const client = requireDependency('client', dependencies.client);
  const qname = requireDependency('qname', dependencies.qname);
  const job = await findJob(jobId, { client, qname });

  if (!job) {
    return { statusCode: 404, body: { success: false, error: 'Video Factory job not found.' } };
  }
  if (ACTIVE_STATUSES.has(job.status)) {
    return { statusCode: 409, body: { success: false, error: 'An active render cannot be archived. Cancel it or wait for it to finish.' } };
  }
  if (job.status === 'archived') {
    return { statusCode: 200, body: { success: true, message: 'Render is already archived.', job_id: jobId, status: 'archived' } };
  }

  const previousStatus = RESTORABLE_STATUSES.has(job.status)
    ? job.status
    : (job.output_url ? 'completed' : 'draft');

  await client.query(
    `UPDATE ${qname('video_render_jobs')}
     SET status = 'archived',
         render_recipe = jsonb_set(
           COALESCE(render_recipe, '{}'::jsonb),
           '{archive}',
           jsonb_build_object(
             'previous_status', $2::text,
             'archived_at', now()::text
           ),
           true
         ),
         updated_at = now()
     WHERE id = $1`,
    [jobId, previousStatus]
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      message: 'Render archived. It is now hidden from the normal Render History list.',
      job_id: jobId,
      status: 'archived',
      previous_status: previousStatus
    }
  };
}

export async function restoreVideoFactoryJob(jobId, dependencies = {}) {
  const client = requireDependency('client', dependencies.client);
  const qname = requireDependency('qname', dependencies.qname);
  const job = await findJob(jobId, { client, qname });

  if (!job) {
    return { statusCode: 404, body: { success: false, error: 'Video Factory job not found.' } };
  }
  if (job.status !== 'archived') {
    return { statusCode: 409, body: { success: false, error: 'Only archived renders can be restored.' } };
  }

  const savedStatus = String(job.render_recipe?.archive?.previous_status || '').trim();
  const restoredStatus = RESTORABLE_STATUSES.has(savedStatus)
    ? savedStatus
    : (job.output_url ? 'completed' : 'draft');

  await client.query(
    `UPDATE ${qname('video_render_jobs')}
     SET status = $2,
         render_recipe = COALESCE(render_recipe, '{}'::jsonb) #- '{archive}',
         updated_at = now()
     WHERE id = $1`,
    [jobId, restoredStatus]
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      message: 'Render restored to Render History.',
      job_id: jobId,
      status: restoredStatus
    }
  };
}
