import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recoverStalePendingJobs } from '../video-factory/stale-jobs.mjs';

function qname(name) {
  return `"radio_dev"."${name}"`;
}

test('stale pending jobs without an ECS task ARN are marked failed', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (String(sql).startsWith('SELECT id, batch_id')) {
        return {
          rowCount: 1,
          rows: [{
            id: '463c63f4-e15c-4576-a048-fe39c776c842',
            batch_id: '2c209a5e-b1b6-412c-8eeb-374ab61d9150'
          }]
        };
      }
      return { rowCount: 1, rows: [] };
    }
  };

  const result = await recoverStalePendingJobs({
    client,
    qname,
    excludeJobId: '11111111-1111-4111-8111-111111111111',
    staleAfterSeconds: 180
  });

  assert.equal(result.recovered_count, 1);
  assert.deepEqual(result.recovered_job_ids, ['463c63f4-e15c-4576-a048-fe39c776c842']);
  assert.equal(calls[0].sql, 'BEGIN');
  assert.match(calls[1].sql, /status = 'pending'/);
  assert.match(calls[1].sql, /ecs_task_arn/);
  assert.deepEqual(calls[1].params, [180, '11111111-1111-4111-8111-111111111111']);
  assert.match(calls[2].sql, /UPDATE .*video_render_jobs/);
  assert.match(calls[3].sql, /UPDATE .*video_render_batches/);
  assert.equal(calls.at(-1).sql, 'COMMIT');
});

test('stale recovery commits without updates when no jobs qualify', async () => {
  const calls = [];
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (String(sql).startsWith('SELECT id, batch_id')) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: 0, rows: [] };
    }
  };

  const result = await recoverStalePendingJobs({ client, qname });

  assert.deepEqual(result, { recovered_count: 0, recovered_job_ids: [] });
  assert.deepEqual(calls.map(call => call.sql), ['BEGIN', calls[1].sql, 'COMMIT']);
});

test('stale recovery rolls back database errors', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      if (String(sql).startsWith('SELECT id, batch_id')) throw new Error('database unavailable');
      return { rowCount: 0, rows: [] };
    }
  };

  await assert.rejects(
    recoverStalePendingJobs({ client, qname }),
    /database unavailable/
  );
  assert.equal(calls[0], 'BEGIN');
  assert.equal(calls.at(-1), 'ROLLBACK');
});
