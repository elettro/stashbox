import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildRunTaskInput,
  checkVideoFactoryInfrastructure,
  getRenderInfrastructureConfig
} from '../video-factory/render-control.mjs';

const VALID_ENV = {
  AWS_REGION: 'us-east-1',
  VIDEO_FACTORY_ECS_CLUSTER: 'cluster-arn',
  VIDEO_FACTORY_ECS_TASK_DEFINITION: 'task-definition-arn',
  VIDEO_FACTORY_ECS_CONTAINER_NAME: 'renderer',
  VIDEO_FACTORY_ECS_SUBNETS: 'subnet-a, subnet-b',
  VIDEO_FACTORY_ECS_SECURITY_GROUPS: 'sg-one',
  VIDEO_FACTORY_RENDER_BUCKET: 'private-render-bucket',
  VIDEO_FACTORY_API_BASE: 'https://example.execute-api.us-east-1.amazonaws.com/dev',
  VIDEO_FACTORY_OUTPUT_PREFIX: 'factory-renders'
};

test('render infrastructure config parses comma-separated networking values', () => {
  const config = getRenderInfrastructureConfig(VALID_ENV);

  assert.deepEqual(config.subnets, ['subnet-a', 'subnet-b']);
  assert.deepEqual(config.securityGroups, ['sg-one']);
  assert.equal(config.containerName, 'renderer');
  assert.equal(config.outputPrefix, 'factory-renders');
});

test('render infrastructure config rejects empty networking lists', () => {
  assert.throws(
    () => getRenderInfrastructureConfig({
      ...VALID_ENV,
      VIDEO_FACTORY_ECS_SUBNETS: ', ,'
    }),
    /VIDEO_FACTORY_ECS_SUBNETS/
  );
});

test('ECS run task input launches one public Fargate worker with the job override', () => {
  const input = buildRunTaskInput(
    { id: 'job-123' },
    {
      cluster: 'cluster-arn',
      taskDefinition: 'task-definition-arn',
      containerName: 'video-factory-renderer',
      subnets: ['subnet-a', 'subnet-b'],
      securityGroups: ['sg-one'],
      outputBucket: 'private-render-bucket',
      apiBase: 'https://example.execute-api.us-east-1.amazonaws.com/dev',
      outputPrefix: 'video-factory'
    }
  );

  assert.equal(input.launchType, 'FARGATE');
  assert.equal(input.count, 1);
  assert.equal(input.networkConfiguration.awsvpcConfiguration.assignPublicIp, 'ENABLED');
  assert.deepEqual(input.networkConfiguration.awsvpcConfiguration.subnets, ['subnet-a', 'subnet-b']);
  const environment = Object.fromEntries(
    input.overrides.containerOverrides[0].environment.map(item => [item.name, item.value])
  );
  assert.equal(environment.JOB_ID, 'job-123');
  assert.equal(environment.VIDEO_FACTORY_OUTPUT_BUCKET, 'private-render-bucket');
});

test('ECS task input rejects missing network configuration', () => {
  assert.throws(
    () => buildRunTaskInput({ id: 'job-123' }, {
      cluster: 'cluster',
      taskDefinition: 'task',
      containerName: 'renderer',
      subnets: [],
      securityGroups: [],
      outputBucket: 'bucket',
      apiBase: 'https://example.com',
      outputPrefix: 'video-factory'
    }),
    /subnet/
  );
});

test('infrastructure health check verifies ECS and the private output bucket', async () => {
  const ecsClient = {
    async send(command) {
      if (command.constructor.name === 'DescribeClustersCommand') {
        return {
          clusters: [{
            clusterArn: 'cluster-arn',
            status: 'ACTIVE',
            registeredContainerInstancesCount: 0,
            runningTasksCount: 0,
            pendingTasksCount: 0
          }],
          failures: []
        };
      }
      if (command.constructor.name === 'DescribeTaskDefinitionCommand') {
        return {
          taskDefinition: {
            taskDefinitionArn: 'task-definition-arn:7',
            cpu: '2048',
            memory: '4096'
          }
        };
      }
      throw new Error(`Unexpected ECS command ${command.constructor.name}`);
    }
  };
  const s3Client = {
    async send(command) {
      assert.equal(command.constructor.name, 'HeadBucketCommand');
      assert.equal(command.input.Bucket, 'private-render-bucket');
      return {};
    }
  };

  const result = await checkVideoFactoryInfrastructure({
    env: VALID_ENV,
    ecsClient,
    s3Client
  });

  assert.equal(result.success, true);
  assert.equal(result.configured, true);
  assert.equal(result.cluster_status, 'ACTIVE');
  assert.equal(result.task_cpu, '2048');
  assert.equal(result.output_bucket, 'private-render-bucket');
  assert.equal(result.concurrency, 1);
});
