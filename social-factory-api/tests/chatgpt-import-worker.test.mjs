import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatGptImportWorker } from '../chatgpt-import-worker.mjs';

test('worker processes queue records and acknowledges completed import batches', async () => {
  const processed = [];
  const worker = createChatGptImportWorker({
    reviewWorkflow: {
      async processChatGptImportBatch(batchId, payload) {
        processed.push({ batchId, payload });
      }
    }
  });
  const result = await worker({
    Records: [{
      messageId: 'message-1',
      body: JSON.stringify({
        batch_id: 'e2e050e5-d320-4a4c-85e0-735974210bad',
        openaiFileIdRefs: [{ id: 'file-abcdefgh12345678' }]
      })
    }]
  });

  assert.deepEqual(result, { batchItemFailures: [] });
  assert.equal(processed.length, 1);
  assert.equal(processed[0].batchId, 'e2e050e5-d320-4a4c-85e0-735974210bad');
  assert.equal(processed[0].payload.openaiFileIdRefs[0].id, 'file-abcdefgh12345678');
});

test('worker retries failed import batches through partial batch failure reporting', async () => {
  const worker = createChatGptImportWorker({
    reviewWorkflow: {
      async processChatGptImportBatch() {
        throw new Error('temporary_store_failure');
      }
    }
  });
  const result = await worker({
    Records: [{ messageId: 'message-retry', body: JSON.stringify({ batch_id: 'batch' }) }]
  });

  assert.deepEqual(result, {
    batchItemFailures: [{ itemIdentifier: 'message-retry' }]
  });
});
