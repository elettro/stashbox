import { createReviewWorkflowService } from './review-workflow.mjs';

export function createChatGptImportWorker({ reviewWorkflow = null } = {}) {
  let resolvedReviewWorkflow = reviewWorkflow;

  function getReviewWorkflow() {
    if (!resolvedReviewWorkflow) resolvedReviewWorkflow = createReviewWorkflowService();
    return resolvedReviewWorkflow;
  }

  return async function chatGptImportWorker(event = {}) {
    const failures = [];
    for (const record of Array.isArray(event.Records) ? event.Records : []) {
      const messageId = String(record?.messageId || '');
      try {
        const message = JSON.parse(String(record?.body || ''));
        const batchId = String(message.batch_id || '');
        await getReviewWorkflow().processChatGptImportBatch(batchId, message);
      } catch (error) {
        console.error('ChatGPT video import batch failed', {
          messageId,
          error: error?.name || 'chatgpt_import_batch_failed'
        });
        if (messageId) failures.push({ itemIdentifier: messageId });
      }
    }
    return { batchItemFailures: failures };
  };
}

export const handler = createChatGptImportWorker();
