import crypto from 'node:crypto';
import {
  DescribeClustersCommand,
  DescribeTaskDefinitionCommand,
  ECSClient,
  RunTaskCommand,
  StopTaskCommand
} from '@aws-sdk/client-ecs';
import {
  GetObjectCommand,
  HeadBucketCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getVideoFactoryJob } from './routes.mjs';

const ACTIVE_STATUSES = new Set(['pending', 'preparing', 'rendering', 'uploading']);
const LAUNCHABLE_STATUSES = new Set(['draft', 'failed', 'cancelled']);
const WORKER_STATUSES = new Set(['preparing', 'rendering', 'uploading', 'failed']);

function stringValue(value) {
  return String(value || '').trim();
}

function csvValues(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function clampProgress(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function runtimeRecipe(recipe = {}, runtimePatch = {}) {
  return {
    ...(recipe || {}),
    runtime: {
      ...((recipe || {}).runtime || {}),
      ...runtimePatch,
      updated_at: new Date().toISOString()
    }
  };
}

function requiredConfig(name, value) {
  const normalized = stringValue(value);
  if (!normalized) {
    const error = new Error(`Video Factory render infrastructure is not configured: ${name}.`);
    error.statusCode = 503;
    throw error;
  }
  return normalized;
}

export function getRenderInfrastructureConfig(env = process.env) {
  const subnets = csvValues(requiredConfig('VIDEO_FACTORY_ECS_SUBNETS', env.VIDEO_FACTORY_ECS_SUBNETS));
  const securityGroups = csvValues(requiredConfig('VIDEO_FACTORY_ECS_SECURITY_GROUPS', env.VIDEO_FACTORY_ECS_SECURITY_GROUPS));
  if (!subnets.length) {
    const error = new Error('Video Factory render infrastructure is not configured: VIDEO_FACTORY_ECS_SUBNETS.');
    error.statusCode = 503;
    throw error;
  }
  if (!securityGroups.length) {
    const error = new Error('Video Factory render infrastructure is not configured: VIDEO_FACTORY_ECS_SECURITY_GROUPS.');
    error.statusCode = 503;
    throw error;
  }

  return {
    cluster: requiredConfig('VIDEO_FACTORY_ECS_CLUSTER', env.VIDEO_FACTORY_ECS_CLUSTER),
    taskDefinition: requiredConfig('VIDEO_FACTORY_ECS_TASK_DEFINITION', env.VIDEO_FACTORY_ECS_TASK_DEFINITION),
    containerName: stringValue(env.VIDEO_FACTORY_ECS_CONTAINER_NAME) || 'video-factory-renderer',
    subnets,
    securityGroups,
    outputBucket: requiredConfig('VIDEO_FACTORY_RENDER_BUCKET', env.VIDEO_FACTORY_RENDER_BUCKET),
    apiBase: requiredConfig('VIDEO_FACTORY_API_BASE', env.VIDEO_FACTORY_API_BASE),
    outputPrefix: stringValue(env.VIDEO_FACTORY_OUTPUT_PREFIX) || 'video-factory'
  };
}

export function buildRunTaskInput(job, config) {
  if (!job?.id) throw new Error('Video Factory job ID is required.');
  if (!config?.subnets?.length) throw new Error('At least one ECS subnet is required.');
  if (!config?.securityGroups?.length) throw new Error('At least one ECS security group is required.');

  return {
    cluster: config.cluster,
    taskDefinition: config.taskDefinition,
    launchType: 'FARGATE',
    count: 1,
    platformVersion: 'LATEST',
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: config.subnets,
        securityGroups: config.securityGroups,
        assignPublicIp: 'ENABLED'
      }
    },
    overrides: {
      containerOverrides: [
        {
          name: config.containerName,
          environment: [
            { name: 'JOB_ID', value: job.id },
            { name: 'VIDEO_FACTORY_API_BASE', value: config.apiBase },
            { name: 'VIDEO_FACTORY_OUTPUT_BUCKET', value: config.outputBucket },
            { name: 'VIDEO_FACTORY_OUTPUT_PREFIX', value: config.outputPrefix }
          ]
        }
      ]
    },
    tags: [
      { key: 'Application', value: 'StashboxRadioVideoFactory' },
      { key: 'Environment', value: 'dev' },
      { key: 'VideoFactoryJobId', value: job.id }
    ],
    enableECSManagedTags: true,
    propagateTags: 'TASK_DEFINITION'
  };
}

export async function checkVideoFactoryInfrastructure(dependencies = {}) {
  const config = dependencies.renderConfig || getRenderInfrastructureConfig(dependencies.env || process.env);
  const region = stringValue(dependencies.env?.AWS_REGION || process.env.AWS_REGION) || 'us-east-1';
  const ecsClient = dependencies.ecsClient || new ECSClient({ region });
  const s3Client = dependencies.s3Client || new S3Client({ region });

  const [clusterResult, taskResult] = await Promise.all([
    ecsClient.send(new DescribeClustersCommand({ clusters: [config.cluster] })),
    ecsClient.send(new DescribeTaskDefinitionCommand({ taskDefinition: config.taskDefinition })),
    s3Client.send(new HeadBucketCommand({ Bucket: config.outputBucket }))
  ]);

  const clusterFailure = clusterResult.failures?.[0];
  const cluster = clusterResult.clusters?.[0];
  if (clusterFailure || !cluster) {
    const error = new Error(clusterFailure?.reason || 'Video Factory ECS cluster was not found.');
    error.statusCode = 503;
    throw error;
  }
  if (!taskResult.taskDefinition?.taskDefinitionArn) {
    const error = new Error('Video Factory ECS task definition was not found.');
    error.statusCode = 503;
    throw error;
  }

  return {
    success: true,
    configured: true,
    region,
    cluster_arn: cluster.clusterArn,
    cluster_status: cluster.status,
    registered_container_instances: cluster.registeredContainerInstancesCount || 0,
    running_tasks: cluster.runningTasksCount || 0,
    pending_tasks: cluster.pendingTasksCount || 0,
    task_definition_arn: taskResult.taskDefinition.taskDefinitionArn,
    task_cpu: taskResult.taskDefinition.cpu,
    task_memory: taskResult.taskDefinition.memory,
    output_bucket: config.outputBucket,
    container_name: config.containerName,
    concurrency: 1
  };
}

async function reserveJobForLaunch(jobId, { client, qname }) {
  await client.query('BEGIN');
  try {
    const jobResult = await client.query(
      `SELECT * FROM ${qname('video_render_jobs')} WHERE id = $1 FOR UPDATE`,
      [jobId]
    );
    if (!jobResult.rowCount) {
      await client.query('ROLLBACK');
      return { statusCode: 404, error: 'Video Factory job not found.' };
    }

    const job = jobResult.rows[0];
    if (!LAUNCHABLE_STATUSES.has(job.status)) {
      await client.query('ROLLBACK');
      return { statusCode: 409, error: `Job cannot start from status ${job.status}.` };
    }

    const activeResult = await client.query(
      `SELECT id, status FROM ${qname('video_render_jobs')}
       WHERE id <> $1 AND status = ANY($2::text[])
       ORDER BY created_at ASC
       LIMIT 1`,
      [jobId, Array.from(ACTIVE_STATUSES)]
    );
    if (activeResult.rowCount) {
      await client.query('ROLLBACK');
      return {
        statusCode: 409,
        error: `Another render is active (${activeResult.rows[0].status}). Complete or cancel it first.`,
        active_job_id: activeResult.rows[0].id
      };
    }

    const recipe = runtimeRecipe(job.render_recipe, {
      progress_percent: 0,
      status_message: 'Waiting for the render worker.',
      launch_requested_at: new Date().toISOString(),
      ecs_task_arn: ''
    });

    await client.query(
      `UPDATE ${qname('video_render_jobs')}
       SET status = 'pending',
           render_recipe = $2::jsonb,
           error_message = NULL,
           started_at = now(),
           completed_at = NULL,
           updated_at = now()
       WHERE id = $1`,
      [jobId, JSON.stringify(recipe)]
    );
    await client.query(
      `UPDATE ${qname('video_render_batches')}
       SET status = 'pending', updated_at = now()
       WHERE id = $1`,
      [job.batch_id]
    );
    await client.query('COMMIT');
    return { job: { ...job, status: 'pending', render_recipe: recipe } };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
}

export async function launchVideoFactoryJob(jobId, dependencies = {}) {
  const config = dependencies.renderConfig || getRenderInfrastructureConfig(dependencies.env || process.env);
  const input = buildRunTaskInput({ id: jobId }, config);
  const reservation = await reserveJobForLaunch(jobId, dependencies);
  if (reservation.error) return reservation;

  const ecsClient = dependencies.ecsClient || new ECSClient({ region: process.env.AWS_REGION || 'us-east-1' });

  try {
    const result = await ecsClient.send(new RunTaskCommand(input));
    const failure = Array.isArray(result.failures) && result.failures.length ? result.failures[0] : null;
    const taskArn = stringValue(result.tasks?.[0]?.taskArn);
    if (failure || !taskArn) {
      throw new Error(failure?.reason || failure?.detail || 'ECS did not return a render task ARN.');
    }

    const recipe = runtimeRecipe(reservation.job.render_recipe, {
      ecs_task_arn: taskArn,
      status_message: 'Render worker launched.',
      launched_at: new Date().toISOString()
    });
    await dependencies.client.query(
      `UPDATE ${dependencies.qname('video_render_jobs')}
       SET render_recipe = $2::jsonb, updated_at = now()
       WHERE id = $1`,
      [jobId, JSON.stringify(recipe)]
    );

    return {
      statusCode: 202,
      body: {
        success: true,
        message: 'Video Factory render started.',
        job_id: jobId,
        status: 'pending',
        task_arn: taskArn
      }
    };
  } catch (error) {
    const failedRecipe = runtimeRecipe(reservation.job.render_recipe, {
      progress_percent: 0,
      status_message: 'Render worker launch failed.',
      launch_error: error.message
    });
    await dependencies.client.query(
      `UPDATE ${dependencies.qname('video_render_jobs')}
       SET status = 'failed', render_recipe = $2::jsonb,
           error_message = $3, completed_at = now(), updated_at = now()
       WHERE id = $1`,
      [jobId, JSON.stringify(failedRecipe), error.message]
    );
    await dependencies.client.query(
      `UPDATE ${dependencies.qname('video_render_batches')}
       SET status = 'failed', updated_at = now()
       WHERE id = $1`,
      [reservation.job.batch_id]
    );
    error.statusCode = error.statusCode || 502;
    throw error;
  }
}

export async function updateVideoFactoryWorkerStatus(jobId, input = {}, { client, qname }) {
  const status = stringValue(input.status).toLowerCase();
  if (!WORKER_STATUSES.has(status)) {
    return { statusCode: 400, body: { success: false, error: 'Unsupported worker status.' } };
  }

  const current = await getVideoFactoryJob(jobId, { client, qname });
  if (!current) return { statusCode: 404, body: { success: false, error: 'Video Factory job not found.' } };
  if (current.status === 'cancelled') {
    return { statusCode: 409, body: { success: false, error: 'The render job was cancelled.' } };
  }
  if (current.status === 'completed') {
    return { statusCode: 409, body: { success: false, error: 'The render job is already completed.' } };
  }

  const progress = clampProgress(input.progress_percent ?? input.progressPercent);
  const statusMessage = stringValue(input.status_message || input.statusMessage);
  const suppliedRecipe = input.render_recipe && typeof input.render_recipe === 'object'
    ? input.render_recipe
    : current.render_recipe;
  const recipe = runtimeRecipe(suppliedRecipe, {
    progress_percent: progress ?? current.render_recipe?.runtime?.progress_percent ?? 0,
    status_message: statusMessage || current.render_recipe?.runtime?.status_message || status,
    heartbeat_at: new Date().toISOString()
  });
  const errorMessage = status === 'failed'
    ? stringValue(input.error_message || input.errorMessage || statusMessage || 'Render failed.')
    : null;

  await client.query(
    `UPDATE ${qname('video_render_jobs')}
     SET status = $2,
         render_recipe = $3::jsonb,
         error_message = $4,
         completed_at = CASE WHEN $2 = 'failed' THEN now() ELSE completed_at END,
         updated_at = now()
     WHERE id = $1`,
    [jobId, status, JSON.stringify(recipe), errorMessage]
  );
  await client.query(
    `UPDATE ${qname('video_render_batches')}
     SET status = $2, updated_at = now()
     WHERE id = $1`,
    [current.batch_id, status]
  );

  return {
    statusCode: 200,
    body: {
      success: true,
      job_id: jobId,
      status,
      progress_percent: recipe.runtime.progress_percent,
      status_message: recipe.runtime.status_message
    }
  };
}

export async function completeVideoFactoryJob(jobId, input = {}, { client, qname, env = process.env }) {
  const current = await getVideoFactoryJob(jobId, { client, qname });
  if (!current) return { statusCode: 404, body: { success: false, error: 'Video Factory job not found.' } };
  if (current.status === 'cancelled') {
    return { statusCode: 409, body: { success: false, error: 'The render job was cancelled.' } };
  }
  if (current.status === 'completed') {
    const existingOutput = current.outputs?.[0] || null;
    return {
      statusCode: 200,
      body: {
        success: true,
        message: 'Video Factory render was already completed.',
        job_id: jobId,
        output_id: existingOutput?.id || null,
        status: 'completed',
        idempotent: true
      }
    };
  }

  const s3Bucket = stringValue(input.s3_bucket || input.s3Bucket);
  const s3Key = stringValue(input.s3_key || input.s3Key);
  const thumbnailKey = stringValue(input.thumbnail_s3_key || input.thumbnailS3Key);
  const configuredBucket = stringValue(env.VIDEO_FACTORY_RENDER_BUCKET);
  if (!s3Bucket || !s3Key) {
    return { statusCode: 400, body: { success: false, error: 's3_bucket and s3_key are required.' } };
  }
  if (configuredBucket && s3Bucket !== configuredBucket) {
    return { statusCode: 400, body: { success: false, error: 'Output bucket does not match Video Factory configuration.' } };
  }

  const metadata = input.metadata && typeof input.metadata === 'object' ? input.metadata : {};
  const outputId = crypto.randomUUID();
  const outputUri = `s3://${s3Bucket}/${s3Key}`;
  const thumbnailUri = thumbnailKey ? `s3://${s3Bucket}/${thumbnailKey}` : null;
  const recipe = runtimeRecipe(input.render_recipe || current.render_recipe, {
    progress_percent: 100,
    status_message: 'Render completed.',
    completed_at: new Date().toISOString()
  });

  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO ${qname('video_render_outputs')} (
         id, job_id, output_kind, s3_bucket, s3_key, output_url, thumbnail_url,
         mime_type, file_size_bytes, duration_seconds, width, height, metadata
       ) VALUES ($1,$2,'master',$3,$4,$5,$6,'video/mp4',$7,$8,$9,$10,$11::jsonb)`,
      [
        outputId,
        jobId,
        s3Bucket,
        s3Key,
        outputUri,
        thumbnailUri,
        Number(input.file_size_bytes || input.fileSizeBytes) || null,
        Number(input.duration_seconds || input.durationSeconds) || null,
        Number(input.width) || current.width,
        Number(input.height) || current.height,
        JSON.stringify(metadata)
      ]
    );
    await client.query(
      `UPDATE ${qname('video_render_jobs')}
       SET status = 'completed', output_url = $2, thumbnail_url = $3,
           render_recipe = $4::jsonb, error_message = NULL,
           completed_at = now(), updated_at = now()
       WHERE id = $1`,
      [jobId, outputUri, thumbnailUri, JSON.stringify(recipe)]
    );
    await client.query(
      `UPDATE ${qname('video_render_batches')}
       SET status = 'completed', updated_at = now()
       WHERE id = $1`,
      [current.batch_id]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }

  return {
    statusCode: 200,
    body: {
      success: true,
      message: 'Video Factory render completed.',
      job_id: jobId,
      output_id: outputId,
      status: 'completed'
    }
  };
}

export async function getVideoFactorySignedAsset(jobId, options = {}, dependencies = {}) {
  const { client, qname } = dependencies;
  const kind = options.kind === 'thumbnail' ? 'thumbnail' : 'video';
  const result = await client.query(
    `SELECT * FROM ${qname('video_render_outputs')}
     WHERE job_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [jobId]
  );
  if (!result.rowCount) {
    return { statusCode: 404, body: { success: false, error: 'Rendered output not found.' } };
  }

  const output = result.rows[0];
  const bucket = stringValue(output.s3_bucket);
  let key = stringValue(output.s3_key);
  if (kind === 'thumbnail') {
    const thumbnailUri = stringValue(output.thumbnail_url);
    key = thumbnailUri.startsWith(`s3://${bucket}/`) ? thumbnailUri.slice(`s3://${bucket}/`.length) : '';
  }
  if (!bucket || !key) {
    return { statusCode: 404, body: { success: false, error: `${kind} object is unavailable.` } };
  }

  const mode = options.mode === 'inline' ? 'inline' : 'attachment';
  const filename = kind === 'thumbnail'
    ? `${stringValue(output.id) || 'video-factory'}.jpg`
    : stringValue(options.filename || 'video-factory-output.mp4');
  const contentType = kind === 'thumbnail' ? 'image/jpeg' : 'video/mp4';
  const s3Client = dependencies.s3Client || new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: contentType,
    ResponseContentDisposition: `${mode}; filename="${filename.replace(/["\\]/g, '')}"`
  });
  const url = await getSignedUrl(s3Client, command, { expiresIn: 900 });
  return {
    statusCode: 200,
    body: {
      success: true,
      job_id: jobId,
      kind,
      expires_in_seconds: 900,
      url
    }
  };
}

export async function cancelVideoFactoryJob(jobId, dependencies = {}) {
  const current = await getVideoFactoryJob(jobId, dependencies);
  if (!current) return { statusCode: 404, body: { success: false, error: 'Video Factory job not found.' } };
  if (!ACTIVE_STATUSES.has(current.status)) {
    return { statusCode: 409, body: { success: false, error: `Job cannot be cancelled from status ${current.status}.` } };
  }

  const taskArn = stringValue(current.render_recipe?.runtime?.ecs_task_arn);
  if (taskArn) {
    const config = dependencies.renderConfig || getRenderInfrastructureConfig(dependencies.env || process.env);
    const ecsClient = dependencies.ecsClient || new ECSClient({ region: process.env.AWS_REGION || 'us-east-1' });
    await ecsClient.send(new StopTaskCommand({
      cluster: config.cluster,
      task: taskArn,
      reason: 'Cancelled from Stashbox Radio Video Factory CMS'
    }));
  }

  const recipe = runtimeRecipe(current.render_recipe, {
    status_message: 'Render cancelled.',
    cancelled_at: new Date().toISOString()
  });
  await dependencies.client.query(
    `UPDATE ${dependencies.qname('video_render_jobs')}
     SET status = 'cancelled', render_recipe = $2::jsonb,
         completed_at = now(), updated_at = now()
     WHERE id = $1`,
    [jobId, JSON.stringify(recipe)]
  );
  await dependencies.client.query(
    `UPDATE ${dependencies.qname('video_render_batches')}
     SET status = 'cancelled', updated_at = now()
     WHERE id = $1`,
    [current.batch_id]
  );

  return {
    statusCode: 200,
    body: { success: true, message: 'Video Factory render cancelled.', job_id: jobId, status: 'cancelled' }
  };
}
