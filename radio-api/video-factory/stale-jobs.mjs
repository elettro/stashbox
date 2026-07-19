const DEFAULT_STALE_SECONDS = 120;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function recoverStalePendingJobs({
  client,
  qname,
  excludeJobId = '',
  staleAfterSeconds = DEFAULT_STALE_SECONDS
} = {}) {
  if (!client?.query) throw new Error('Video Factory stale-job recovery requires a database client.');
  if (typeof qname !== 'function') throw new Error('Video Factory stale-job recovery requires qname.');

  const staleSeconds = positiveInteger(staleAfterSeconds, DEFAULT_STALE_SECONDS);
  const excludedId = String(excludeJobId || '').trim();

  await client.query('BEGIN');
  try {
    const staleResult = await client.query(
      `SELECT id, batch_id
       FROM ${qname('video_render_jobs')}
       WHERE status = 'pending'
         AND updated_at < now() - make_interval(secs => $1::int)
         AND COALESCE(render_recipe #>> '{runtime,ecs_task_arn}', '') = ''
         AND ($2::text = '' OR id::text <> $2::text)
       FOR UPDATE`,
      [staleSeconds, excludedId]
    );

    if (!staleResult.rowCount) {
      await client.query('COMMIT');
      return { recovered_count: 0, recovered_job_ids: [] };
    }

    const jobIds = staleResult.rows.map(row => row.id);
    const batchIds = [...new Set(staleResult.rows.map(row => row.batch_id).filter(Boolean))];
    const errorMessage = 'Render launch did not receive an ECS task ARN and was recovered as stale.';

    await client.query(
      `UPDATE ${qname('video_render_jobs')}
       SET status = 'failed',
           error_message = $2,
           completed_at = COALESCE(completed_at, now()),
           updated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [jobIds, errorMessage]
    );

    if (batchIds.length) {
      await client.query(
        `UPDATE ${qname('video_render_batches')}
         SET status = 'failed', updated_at = now()
         WHERE id = ANY($1::uuid[])`,
        [batchIds]
      );
    }

    await client.query('COMMIT');
    return { recovered_count: jobIds.length, recovered_job_ids: jobIds };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}
