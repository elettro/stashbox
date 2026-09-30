import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createReviewWorkflowService,
  generateReviewMetadata
} from '../review-workflow.mjs';

const SOURCE_BUCKET = 'stashbox-radio-video-factory-dev-656260749296-us-east-1';
const PUBLISH_BUCKET = 'stashbox-social-publish-656260749296-us-east-1';

function event({ body, token = 'social-admin', query } = {}) {
  return {
    headers: token ? { 'x-admin-token': token } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
    queryStringParameters: query || null
  };
}

function chatGptDownloadUrl(
  id,
  signature = 'test-signature',
  expiresAt = '2026-07-28T01:05:00.000Z',
  { host = 'files.oaiusercontent.com', path = `/${id}` } = {}
) {
  const responseCacheControl = encodeURIComponent('max-age=31536000, immutable');
  const responseDisposition = encodeURIComponent(`attachment; filename=${id}.mp4`);
  return `https://${host}${path}?se=${encodeURIComponent(expiresAt)}&sp=r&sv=2021-08-06&sr=b&rscc=${responseCacheControl}&rscd=${responseDisposition}&sig=${signature}`;
}

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return structuredClone(payload);
    }
  };
}

function createService({ jobStatus = 'completed', outputBucket = SOURCE_BUCKET } = {}) {
  const calls = [];
  const copies = [];
  const reviews = new Map();
  const secretStore = {
    async read() {
      return {
        admin_token: 'social-admin',
        radio_api_base_url: 'https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev',
        radio_api_admin_token: 'radio-admin'
      };
    }
  };
  const reviewStore = {
    bucketName: PUBLISH_BUCKET,
    sourceBucketName: SOURCE_BUCKET,
    async copyVideo(input) {
      copies.push(input);
      return { ContentType: 'video/mp4', ContentLength: 17_400_000 };
    },
    async putReview(key, review) {
      reviews.set(key, structuredClone(review));
      return review;
    },
    async getReview(key) {
      return reviews.get(key) || null;
    },
    async listReviews() {
      return [...reviews.values()];
    }
  };
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/admin/songs')) {
      return jsonResponse({
        songs: [{
          song_key: 'hippy-speedball',
          display_title: "Hippy Speedball (I'm On My Way)",
          artist: 'Stashbox',
          genre: 'Reggae',
          mood_tags: ['Uplifting', 'Trippy'],
          spotify_url: 'https://open.spotify.com/example',
          shop_url: 'https://stashbox.ai/example'
        }]
      });
    }
    return jsonResponse({
      job: {
        id: 'job-12345678',
        batch_id: 'batch-12345678',
        song_key: 'hippy-speedball',
        song_title: "Hippy Speedball (I'm On My Way)",
        artist: 'Stashbox',
        status: jobStatus,
        duration_seconds: 30,
        aspect_ratio: '9:16',
        width: 1080,
        height: 1920,
        output_filename: 'stashbox-hippy-speedball.mp4',
        output_url: `s3://${outputBucket}/video-factory/hippy-speedball/job-12345678/stashbox-hippy-speedball.mp4`
      }
    });
  };
  return {
    service: createReviewWorkflowService({
      secretStore,
      reviewStore,
      fetchImpl,
      configSecretId: 'config',
      now: () => new Date('2026-07-28T01:00:00.000Z')
    }),
    calls,
    copies,
    reviews
  };
}

function createImportService({
  fileBytes = Buffer.from('000000186674797069736f6d00000000', 'hex'),
  metadata = {
    expected_size_bytes: String(Buffer.from('000000186674797069736f6d00000000', 'hex').length),
    source: 'chatgpt-video-import',
    file_name: 'chatgpt-clip.mp4'
  },
  contentType = 'video/mp4',
  contentLength = fileBytes.length
} = {}) {
  const reviews = new Map();
  const uploads = [];
  const store = {
    bucketName: PUBLISH_BUCKET,
    async createVideoImportUploadUrl(input) {
      uploads.push(input);
      return {
        objectKey: `incoming/chatgpt-imports/${input.importId}/video.mp4`,
        uploadUrl: 'https://uploads.example/signed'
      };
    },
    async headImportedVideo() {
      return { ContentType: contentType, ContentLength: contentLength, Metadata: metadata };
    },
    async getImportedVideo() {
      return {
        Body: {
          async *[Symbol.asyncIterator]() {
            yield fileBytes.subarray(0, 5);
            yield fileBytes.subarray(5);
          }
        }
      };
    },
    async getReview(key) {
      return reviews.get(key) || null;
    },
    async putImportedReview(key, review) {
      if (reviews.has(key)) {
        const error = new Error('precondition_failed');
        error.name = 'PreconditionFailed';
        throw error;
      }
      reviews.set(key, structuredClone(review));
      return review;
    }
  };
  return {
    reviews,
    uploads,
    service: createReviewWorkflowService({
      secretStore: { async read() { return { admin_token: 'social-admin' }; } },
      reviewStore: store,
      fetchImpl: async () => jsonResponse({}),
      configSecretId: 'config',
      maxUploadBytes: 1000,
      createImportId: () => 'e2e050e5-d320-4a4c-85e0-735974210bad',
      now: () => new Date('2026-07-28T01:00:00.000Z')
    })
  };
}

function createChatGptImportService({ fetchImpl } = {}) {
  const reviews = new Map();
  const objects = new Map();
  const batches = new Map();
  const enqueued = [];
  const uploadIds = [];
  let nextImportId = 1;
  const store = {
    bucketName: PUBLISH_BUCKET,
    async enqueueChatGptImportBatch(batchId, payload) {
      enqueued.push({ batch_id: batchId, ...payload });
    },
    async putChatGptImportBatch(batchId, batch) {
      batches.set(batchId, structuredClone(batch));
    },
    async getChatGptImportBatch(batchId) {
      return batches.get(batchId) || null;
    },
    async uploadChatGptVideo({ importId, fileName, body }) {
      const chunks = [];
      for await (const chunk of body) chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      objects.set(`incoming/chatgpt-imports/${importId}/video.mp4`, {
        bytes,
        fileName
      });
      uploadIds.push(importId);
    },
    async headImportedVideo(key) {
      const object = objects.get(key);
      if (!object) {
        const error = new Error('not_found');
        error.name = 'NotFound';
        throw error;
      }
      return {
        ContentType: 'video/mp4',
        ContentLength: object.bytes.length,
        Metadata: {
          source: 'chatgpt-video-import',
          file_name: object.fileName
        }
      };
    },
    async getImportedVideo(key) {
      const bytes = objects.get(key).bytes;
      return {
        Body: {
          async *[Symbol.asyncIterator]() {
            yield bytes;
          }
        }
      };
    },
    async getReview(key) {
      return reviews.get(key) || null;
    },
    async putImportedReview(key, review) {
      if (reviews.has(key)) {
        const error = new Error('precondition_failed');
        error.name = 'PreconditionFailed';
        throw error;
      }
      reviews.set(key, structuredClone(review));
      return review;
    }
  };
  return {
    reviews,
    objects,
    batches,
    enqueued,
    uploadIds,
    service: createReviewWorkflowService({
      secretStore: { async read() { return { admin_token: 'social-admin' }; } },
      reviewStore: store,
      fetchImpl,
      configSecretId: 'config',
      maxUploadBytes: 1000,
      createImportId: () => `00000000-0000-4000-8000-${String(nextImportId++).padStart(12, '0')}`,
      now: () => new Date('2026-07-28T01:00:00.000Z')
    })
  };
}

test('metadata generator produces editable YouTube copy and keeps the real title', () => {
  const metadata = generateReviewMetadata({
    song: {
      song_key: 'hippy-speedball',
      display_title: "Hippy Speedball (I'm On My Way)",
      artist: 'Stashbox',
      genre: 'Reggae'
    },
    job: { duration_seconds: 30, aspect_ratio: '9:16' }
  });

  assert.equal(metadata.title_options.length, 3);
  assert.match(metadata.selected_title, /Hippy Speedball \(I'm On My Way\)/);
  assert.match(metadata.description, /30-second 9:16 video/);
  assert.ok(metadata.tags.includes('Reggae'));
  assert.equal(metadata.collaborators[0].youtube_handle, '@Elettrotv');
  assert.equal(metadata.collaborator_review_required, true);
});

test('ChatGPT attachment imports stream OpenAI file references into Content Review', async () => {
  const bytes = Buffer.from('000000186674797069736f6d00000000', 'hex');
  const fetchCalls = [];
  const { service, reviews, objects } = createChatGptImportService({
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return new Response(bytes, {
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(bytes.length)
        }
      });
    }
  });
  const result = await service.importChatGptVideos(event({
    body: {
      aspect_ratio: '16:9',
      openaiFileIdRefs: [{
        id: 'file-abcdefgh12345678',
        name: 'ChatGPT clip.mp4',
        mime_type: 'video/mp4',
        download_link: chatGptDownloadUrl('file-abcdefgh12345678')
      }]
    }
  }));

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].options.redirect, 'error');
  assert.equal(result.count, 1);
  assert.equal(result.imported_count, 1);
  assert.equal(result.items[0].status, 'imported');
  assert.equal(result.items[0].review_item.status, 'in_review');
  assert.equal(result.items[0].review_item.video.file_name, 'ChatGPT-clip.mp4');
  assert.equal(result.items[0].review_item.video.aspect_ratio, '16:9');
  assert.equal(result.items[0].review_item.automation.auto_publish, false);
  assert.equal(reviews.size, 1);
  assert.equal(objects.size, 1);
});

test('ChatGPT attachment import accepts current underscore IDs and signed /files/{id}/raw links', async () => {
  const id = 'file_abc123XYZ789def456';
  const bytes = Buffer.from('000000186674797069736f6d00000000', 'hex');
  const fetchCalls = [];
  const { service, objects } = createChatGptImportService({
    fetchImpl: async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return new Response(bytes, {
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(bytes.length)
        }
      });
    }
  });
  const result = await service.importChatGptVideos(event({
    body: {
      openaiFileIdRefs: [{
        id,
        name: 'Current GPT attachment.mp4',
        mime_type: 'video/mp4',
        download_link: chatGptDownloadUrl(id, undefined, undefined, {
          path: `/files/${id}/raw`
        })
      }]
    }
  }));

  assert.equal(result.imported_count, 1);
  assert.equal(new URL(fetchCalls[0].url).hostname, 'files.oaiusercontent.com');
  assert.equal(new URL(fetchCalls[0].url).pathname, `/files/${id}/raw`);
  assert.equal(fetchCalls[0].options.redirect, 'error');
  assert.equal(objects.size, 1);
});

test('ChatGPT attachment import accepts realistic signed file refs without an .mp4 filename suffix', async () => {
  const bytes = Buffer.from('000000186674797069736f6d00000000', 'hex');
  const { service, objects } = createChatGptImportService({
    fetchImpl: async () => new Response(bytes, {
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(bytes.length)
      }
    })
  });
  const result = await service.importChatGptVideos(event({
    body: {
      openaiFileIdRefs: [{
        name: '2026-07-28 01.00.00',
        id: 'file-XFlOqJYTPBPwMZE3IopCBv1Z',
        mime_type: 'video/mp4',
        download_link: chatGptDownloadUrl('file-XFlOqJYTPBPwMZE3IopCBv1Z')
      }]
    }
  }));

  assert.equal(result.imported_count, 1);
  assert.equal(result.items[0].review_item.video.file_name, '2026-07-28-01.00.00.mp4');
  assert.equal(objects.size, 1);
});

test('ChatGPT import endpoint accepts GPT Action references with longer-lived SAS URLs', async () => {
  const { service, enqueued } = createChatGptImportService();
  const result = await service.queueChatGptImport(event({
    body: {
      openaiFileIdRefs: [{
        name: '2026-07-28 01.00.00',
        id: 'file-XFlOqJYTPBPwMZE3IopCBv1Z',
        mime_type: 'video/mp4',
        download_link: chatGptDownloadUrl(
          'file-XFlOqJYTPBPwMZE3IopCBv1Z',
          'test-signature',
          '2026-07-28T02:00:00.000Z'
        )
      }]
    }
  }));

  assert.equal(result.status, 'queued');
  assert.equal(result.count, 1);
  assert.equal(enqueued.length, 1);
  assert.equal(enqueued[0].openaiFileIdRefs[0].name, '2026-07-28-01.00.00.mp4');
});

test('ChatGPT attachment import queues promptly and records worker completion status', async () => {
  const bytes = Buffer.from('000000186674797069736f6d00000000', 'hex');
  const fetchCalls = [];
  const { service, batches, enqueued, reviews } = createChatGptImportService({
    fetchImpl: async (url) => {
      fetchCalls.push(String(url));
      return new Response(bytes, {
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(bytes.length)
        }
      });
    }
  });
  const accepted = await service.queueChatGptImport(event({
    body: {
      aspect_ratio: '9:16',
      openaiFileIdRefs: [{
        id: 'file-abcdefgh12345678',
        name: 'ChatGPT clip.mp4',
        mime_type: 'video/mp4',
        download_link: chatGptDownloadUrl('file-abcdefgh12345678')
      }]
    }
  }));

  assert.equal(accepted.status, 'queued');
  assert.equal(fetchCalls.length, 0);
  assert.equal((await service.getChatGptImportBatch(event(), accepted.batch_id)).status, 'queued');
  const completed = await service.processChatGptImportBatch(accepted.batch_id, enqueued[0]);

  assert.equal(fetchCalls.length, 1);
  assert.equal(completed.status, 'completed');
  assert.equal(completed.imported_count, 1);
  assert.equal(completed.items[0].review_item.video.aspect_ratio, '9:16');
  assert.equal(batches.get(accepted.batch_id).status, 'completed');
  assert.equal(reviews.size, 1);
});

test('25 MP4 references enqueue as three prompt batches without waiting for file downloads', async () => {
  const bytes = Buffer.from('000000186674797069736f6d00000000', 'hex');
  let fetchCount = 0;
  const { service, enqueued } = createChatGptImportService({
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response(bytes, {
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(bytes.length)
        }
      });
    }
  });
  const batches = [];
  for (let start = 0; start < 25; start += 10) {
    const refs = Array.from({ length: Math.min(10, 25 - start) }, (_, offset) => {
      const index = start + offset;
      const id = `file-${String(index).padStart(8, '0')}`;
      return {
        id,
        name: `video-${index}.mp4`,
        mime_type: 'video/mp4',
        download_link: chatGptDownloadUrl(id)
      };
    });
    const batch = await service.queueChatGptImport(event({ body: { openaiFileIdRefs: refs } }));
    batches.push(batch);
    assert.equal(batch.status, 'queued');
  }

  assert.deepEqual(batches.map(({ count }) => count), [10, 10, 5]);
  assert.equal(enqueued.length, 3);
  assert.equal(fetchCount, 0);
  for (let index = 0; index < batches.length; index += 1) {
    const completed = await service.processChatGptImportBatch(batches[index].batch_id, enqueued[index]);
    assert.equal(completed.status, 'completed');
    assert.equal(completed.count, batches[index].count);
  }
  assert.equal(fetchCount, 25);
});

test('ChatGPT attachment imports deduplicate identical video bytes', async () => {
  const bytes = Buffer.from('000000186674797069736f6d00000000', 'hex');
  const { service, reviews } = createChatGptImportService({
    fetchImpl: async () => new Response(bytes, {
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(bytes.length)
      }
    })
  });
  const result = await service.importChatGptVideos(event({
    body: {
      openaiFileIdRefs: [
        {
          id: 'file-abcdefgh12345678',
          name: 'first.mp4',
          mime_type: 'video/mp4',
          download_link: chatGptDownloadUrl('file-abcdefgh12345678', 'one')
        },
        {
          id: 'file-bcdefghi12345678',
          name: 'duplicate.mp4',
          mime_type: 'video/mp4',
          download_link: chatGptDownloadUrl('file-bcdefghi12345678', 'two')
        }
      ]
    }
  }));

  assert.equal(result.count, 2);
  assert.equal(result.imported_count, 1);
  assert.equal(result.duplicate_count, 1);
  assert.equal(result.items[1].status, 'duplicate');
  assert.equal(result.items[1].review_item.id, result.items[0].review_item.id);
  assert.equal(reviews.size, 1);
});

test('ChatGPT attachment imports report per-file upstream failures without losing successes', async () => {
  const bytes = Buffer.from('000000186674797069736f6d00000000', 'hex');
  const { service } = createChatGptImportService({
    fetchImpl: async (url) => {
      if (String(url).includes('sig=expired')) {
        return new Response('', { status: 403 });
      }
      return new Response(bytes, {
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(bytes.length)
        }
      });
    }
  });
  const result = await service.importChatGptVideos(event({
    body: {
      openaiFileIdRefs: [
        {
          id: 'file-abcdefgh12345678',
          name: 'good.mp4',
          mime_type: 'video/mp4',
          download_link: chatGptDownloadUrl('file-abcdefgh12345678', 'valid')
        },
        {
          id: 'file-bcdefghi12345678',
          name: 'expired.mp4',
          mime_type: 'video/mp4',
          download_link: chatGptDownloadUrl('file-bcdefghi12345678', 'expired')
        }
      ]
    }
  }));

  assert.equal(result.imported_count, 1);
  assert.equal(result.failed_count, 1);
  assert.equal(result.items[0].status, 'imported');
  assert.equal(result.items[1].status, 'failed');
  assert.equal(result.items[1].error, 'chatgpt_attachment_download_failed');
});

test('ChatGPT attachment import rejects non-OpenAI URLs before fetching them', async () => {
  let fetchCount = 0;
  const { service, objects } = createChatGptImportService({
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response('should not fetch');
    }
  });
  await assert.rejects(
    service.importChatGptVideos(event({
      body: {
        openaiFileIdRefs: [{
          id: 'file-abcdefgh12345678',
          name: 'clip.mp4',
          mime_type: 'video/mp4',
          download_link: 'https://attacker.example/file-abcdefgh12345678'
        }]
      }
    })),
    (error) => error.statusCode === 422 && error.message === 'invalid_chatgpt_attachment'
  );
  assert.equal(fetchCount, 0);
  assert.equal(objects.size, 0);
});

test('ChatGPT attachment import rejects malformed links, lookalike hosts, and unsupported paths', async () => {
  const id = 'file_abc123XYZ789def456';
  let fetchCount = 0;
  const { service } = createChatGptImportService({
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response('should not fetch');
    }
  });
  const invalidLinks = [
    {
      url: 'not-a-valid-url',
      failedRule: 'download_link_url'
    },
    {
      url: chatGptDownloadUrl(id, undefined, undefined, {
        host: 'files.oaiusercontent.com.attacker.example',
        path: `/files/${id}/raw`
      }),
      failedRule: 'download_link_host'
    },
    {
      url: chatGptDownloadUrl(id, undefined, undefined, {
        host: 'evil-oaiusercontent.com',
        path: `/files/${id}/raw`
      }),
      failedRule: 'download_link_host'
    },
    {
      url: chatGptDownloadUrl(id, undefined, undefined, {
        path: `/files/${id}/content`
      }),
      failedRule: 'download_link_path'
    }
  ];

  for (const { url, failedRule } of invalidLinks) {
    await assert.rejects(
      service.importChatGptVideos(event({
        body: {
          openaiFileIdRefs: [{
            id,
            name: 'clip.mp4',
            mime_type: 'video/mp4',
            download_link: url
          }]
        }
      })),
      (error) => {
        assert.equal(error.statusCode, 422);
        assert.equal(error.message, 'invalid_chatgpt_attachment');
        assert.deepEqual(error.details.failed_rules, [failedRule]);
        assert.equal(JSON.stringify(error.details).includes(url), false);
        return true;
      }
    );
  }
  assert.equal(fetchCount, 0);
});

test('ChatGPT attachment import diagnoses unsigned and expired storage links without exposing values', async () => {
  let fetchCount = 0;
  const { service } = createChatGptImportService({
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response('should not fetch');
    }
  });
  const links = [
    {
      url: 'https://files.oaiusercontent.com/file-abcdefgh12345678?se=2026-07-28T01%3A05%3A00Z&sp=r&sv=2021-08-06&sr=b',
      failedRule: 'download_link_signature'
    },
    {
      url: 'https://files.oaiusercontent.com/file-abcdefgh12345678?se=2026-07-28T00%3A59%3A59Z&sp=r&sv=2021-08-06&sr=b&sig=expired',
      failedRule: 'download_link_expired'
    }
  ];

  for (const { url, failedRule } of links) {
    await assert.rejects(
      service.importChatGptVideos(event({
        body: {
          openaiFileIdRefs: [{
            id: 'file-abcdefgh12345678',
            name: 'clip.mp4',
            mime_type: 'video/mp4',
            download_link: url
          }]
        }
      })),
      (error) => {
        assert.equal(error.statusCode, 422);
        assert.equal(error.message, 'invalid_chatgpt_attachment');
        assert.deepEqual(error.details.failed_rules, [failedRule]);
        assert.equal(JSON.stringify(error.details).includes(url), false);
        return true;
      }
    );
  }
  assert.equal(fetchCount, 0);
});

test('ChatGPT attachment import rejects more than ten files in one action call', async () => {
  let fetchCount = 0;
  const { service } = createChatGptImportService({
    fetchImpl: async () => {
      fetchCount += 1;
      return new Response('');
    }
  });
  await assert.rejects(
    service.importChatGptVideos(event({
      body: { openaiFileIdRefs: Array.from({ length: 11 }, (_, index) => ({
        id: `file-${String(index).padStart(8, '0')}`,
        name: `clip-${index}.mp4`,
        mime_type: 'video/mp4',
        download_link: chatGptDownloadUrl(`file-${String(index).padStart(8, '0')}`)
      })) }
    })),
    (error) => error.statusCode === 422 && error.details.maximum === 10
  );
  assert.equal(fetchCount, 0);
});

test('ChatGPT attachment import verifies MP4 bytes and enforces the per-file size cap', async () => {
  const malformed = createChatGptImportService({
    fetchImpl: async () => new Response(Buffer.from('not-an-mp4-file!'), {
      headers: { 'content-type': 'video/mp4' }
    })
  });
  const malformedResult = await malformed.service.importChatGptVideos(event({
    body: {
      openaiFileIdRefs: [{
        id: 'file-abcdefgh12345678',
        name: 'clip.mp4',
        mime_type: 'video/mp4',
        download_link: chatGptDownloadUrl('file-abcdefgh12345678')
      }]
    }
  }));
  assert.equal(malformedResult.failed_count, 1);
  assert.equal(malformedResult.items[0].error, 'uploaded_file_is_not_mp4');

  const oversized = createChatGptImportService({
    fetchImpl: async () => new Response(Buffer.alloc(1001), {
      headers: { 'content-type': 'video/mp4' }
    })
  });
  const oversizedResult = await oversized.service.importChatGptVideos(event({
    body: {
      openaiFileIdRefs: [{
        id: 'file-abcdefgh12345678',
        name: 'clip.mp4',
        mime_type: 'video/mp4',
        download_link: chatGptDownloadUrl('file-abcdefgh12345678')
      }]
    }
  }));
  assert.equal(oversizedResult.failed_count, 1);
  assert.equal(oversizedResult.items[0].error, 'uploaded_video_size_mismatch');
});

test('video import returns a scoped presigned upload URL for a validated MP4', async () => {
  const { service, uploads } = createImportService();
  const result = await service.createVideoImport(event({
    body: {
      file_name: 'ChatGPT clip.mp4',
      content_type: 'video/mp4',
      size_bytes: 16,
      title: 'A reviewed title'
    }
  }));

  assert.equal(result.import_id, 'e2e050e5-d320-4a4c-85e0-735974210bad');
  assert.equal(result.default_title, 'A reviewed title');
  assert.equal(result.object_key, `incoming/chatgpt-imports/${result.import_id}/video.mp4`);
  assert.equal(result.upload_method, 'PUT');
  assert.equal(result.required_headers['Content-Type'], 'video/mp4');
  assert.equal(result.required_headers['x-amz-meta-expected_size_bytes'], '16');
  assert.equal(result.expires_in_seconds, 900);
  assert.deepEqual(uploads[0], {
    importId: result.import_id,
    fileName: 'ChatGPT-clip.mp4',
    sizeBytes: 16
  });
});

test('video import rejects non-MP4 or oversized upload requests', async () => {
  const { service } = createImportService();
  await assert.rejects(
    service.createVideoImport(event({
      body: { file_name: 'clip.mov', content_type: 'video/quicktime', size_bytes: 16 }
    })),
    (error) => error.statusCode === 422
  );
  await assert.rejects(
    service.createVideoImport(event({
      body: { file_name: 'clip.mp4', content_type: 'video/mp4', size_bytes: 1001 }
    })),
    (error) => error.statusCode === 422 && error.details.max_bytes === 1000
  );
});

test('video import verifies uploaded bytes and creates a non-publishing review item', async () => {
  const { service, reviews } = createImportService();
  const result = await service.completeVideoImport(
    event({ body: { title: 'ChatGPT upload' } }),
    'e2e050e5-d320-4a4c-85e0-735974210bad'
  );

  assert.equal(result.imported, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.review_item.status, 'in_review');
  assert.equal(result.review_item.approval_state, 'pending');
  assert.equal(result.review_item.song.title, 'ChatGPT upload');
  assert.equal(result.review_item.video.file_name, 'chatgpt-clip.mp4');
  assert.equal(result.review_item.video.size_bytes, 16);
  assert.equal(result.review_item.source.content_sha256.length, 64);
  assert.equal(result.review_item.publish_settings.visibility, 'unlisted');
  assert.equal(result.review_item.automation.auto_publish, false);
  assert.equal(result.review_item.automation.review_required, true);
  assert.equal(reviews.size, 1);
});

test('video import returns the existing review item for duplicate content', async () => {
  const { service, reviews } = createImportService();
  const first = await service.completeVideoImport(
    event({ body: {} }),
    'e2e050e5-d320-4a4c-85e0-735974210bad'
  );
  const second = await service.completeVideoImport(
    event({ body: {} }),
    'e2e050e5-d320-4a4c-85e0-735974210bad'
  );

  assert.equal(second.imported, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.review_item.id, first.review_item.id);
  assert.equal(reviews.size, 1);
});

test('video import rejects invalid MP4 bytes and metadata size mismatches', async () => {
  const malformed = createImportService({ fileBytes: Buffer.from('not-an-mp4-file!') });
  await assert.rejects(
    malformed.service.completeVideoImport(
      event({ body: {} }),
      'e2e050e5-d320-4a4c-85e0-735974210bad'
    ),
    (error) => error.statusCode === 422 && error.message === 'uploaded_file_is_not_mp4'
  );

  const mismatch = createImportService({
    metadata: {
      expected_size_bytes: '15',
      source: 'chatgpt-video-import',
      file_name: 'chatgpt-clip.mp4'
    }
  });
  await assert.rejects(
    mismatch.service.completeVideoImport(
      event({ body: {} }),
      'e2e050e5-d320-4a4c-85e0-735974210bad'
    ),
    (error) => error.statusCode === 422 && error.message === 'invalid_uploaded_video'
  );
});

test('stage route validates a completed render without copying until explicitly confirmed', async () => {
  const { service, copies, calls } = createService();
  const result = await service.stageRender(event({ body: {} }), 'job-12345678');

  assert.equal(result.staged, false);
  assert.equal(result.mode, 'validation_only');
  assert.equal(result.approval_required, true);
  assert.equal(copies.length, 0);
  assert.equal(calls.length, 1);
});

test('confirmed staging copies server-to-server and creates a content review item', async () => {
  const { service, copies, reviews, calls } = createService();
  const result = await service.stageRender(
    event({ body: { confirm_stage: true } }),
    'job-12345678'
  );

  assert.equal(result.staged, true);
  assert.equal(copies.length, 1);
  assert.equal(copies[0].sourceBucket, SOURCE_BUCKET);
  assert.equal(copies[0].destinationKey, 'incoming/render-jobs/job-12345678/stashbox-hippy-speedball.mp4');
  assert.equal(result.review_item.status, 'in_review');
  assert.equal(result.review_item.video.size_bytes, 17_400_000);
  assert.equal(result.review_item.publish_settings.visibility, 'unlisted');
  assert.equal(result.review_item.publish_settings.made_for_kids, false);
  assert.equal(result.review_item.publish_settings.contains_synthetic_media, true);
  assert.deepEqual(result.review_item.publish_settings.playlist_titles, ['Stashbox Radio - Video Library - Stashbox']);
  assert.equal(result.review_item.publish_settings.recording_date_mode, 'publish_date');
  assert.equal(result.review_item.automation.auto_publish, false);
  assert.equal(reviews.size, 1);
  assert.equal(calls.length, 2);
});

test('staging rejects an output from any non-Video-Factory bucket', async () => {
  const { service } = createService({ outputBucket: 'unexpected-bucket' });
  await assert.rejects(
    service.stageRender(event({ body: { confirm_stage: true } }), 'job-12345678'),
    (error) => error.statusCode === 409 && error.message === 'render_output_bucket_not_allowed'
  );
});

test('staging rejects a render that is not completed', async () => {
  const { service } = createService({ jobStatus: 'rendering' });
  await assert.rejects(
    service.stageRender(event({ body: { confirm_stage: true } }), 'job-12345678'),
    (error) => error.statusCode === 409 && error.message === 'render_job_not_completed'
  );
});

test('review list and item routes remain protected', async () => {
  const { service, reviews } = createService();
  reviews.set('drafts/render-job-12345678.json', {
    id: 'render-job-12345678',
    status: 'in_review',
    created_at: '2026-07-28T01:00:00.000Z'
  });

  const listed = await service.listReviewItems(event());
  assert.equal(listed.count, 1);

  const item = await service.getReviewItem(event(), 'render-job-12345678');
  assert.equal(item.item.status, 'in_review');

  await assert.rejects(
    service.listReviewItems(event({ token: '' })),
    (error) => error.statusCode === 401
  );
});
