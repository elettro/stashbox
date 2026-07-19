import assert from 'node:assert/strict';
import { test } from 'node:test';
import { archiveVideoFactoryJob, restoreVideoFactoryJob } from '../video-factory/archive.mjs';

function qname(name) {
  return `"radio_dev"."${name}"`;
}

function clientWithJob(job) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes('SELECT id, status, output_url, render_recipe')) {
        return { rowCount: job ? 1 : 0, rows: job ? [job] : [] };
      }
      return { rowCount: 1, rows: [] };
    }
  };
}

test('completed render can be archived without deleting its output', async () => {
  const client = clientWithJob({
    id: 'job-1',
    status: 'completed',
    output_url: 's3://private-bucket/video.mp4',
    render_recipe: {}
  });

  const result = await archiveVideoFactoryJob('job-1', { client, qname });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'archived');
  assert.equal(result.body.previous_status, 'completed');
  assert.match(client.calls[1].sql, /status = 'archived'/);
  assert.match(client.calls[1].sql, /jsonb_set/);
  assert.deepEqual(client.calls[1].params, ['job-1', 'completed']);
  assert.doesNotMatch(client.calls[1].sql, /DELETE/i);
});

test('active render cannot be archived', async () => {
  const client = clientWithJob({
    id: 'job-2',
    status: 'rendering',
    output_url: '',
    render_recipe: {}
  });

  const result = await archiveVideoFactoryJob('job-2', { client, qname });

  assert.equal(result.statusCode, 409);
  assert.match(result.body.error, /active render cannot be archived/i);
  assert.equal(client.calls.length, 1);
});

test('archived render restores its previous status', async () => {
  const client = clientWithJob({
    id: 'job-3',
    status: 'archived',
    output_url: '',
    render_recipe: { archive: { previous_status: 'failed' } }
  });

  const result = await restoreVideoFactoryJob('job-3', { client, qname });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, 'failed');
  assert.match(client.calls[1].sql, /render_recipe = .*#- '\{archive\}'/s);
  assert.deepEqual(client.calls[1].params, ['job-3', 'failed']);
});

test('missing render returns not found', async () => {
  const client = clientWithJob(null);
  const result = await archiveVideoFactoryJob('missing', { client, qname });
  assert.equal(result.statusCode, 404);
});
