import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRunTaskInput, getRenderInfrastructureConfig } from '../video-factory/render-control.mjs';

test('render infrastructure config parses comma-separated networking values', () => {
  const config = getRenderInfrastructureConfig({
    VIDEO_FACTORY_ECS_CLUSTER: 'cluster-arn',
    VIDEO_FACTORY_ECS_TASK_DEFINITION: 'task-definition-arn',
    VIDEO_FACTORY_ECS_CONTAINER_NAME: 'renderer',
    VIDEO_FACTORY_ECS_SUBNETS: 'subnet-a, subnet-b',
    VIDEO_FACTORY_ECS_SECURITY_GROUPS: 'sg-one',
    VIDEO_FACTORY_RENDER_BUCKET: 'private-render-bucket',
    VIDEO_FACTORY_API_BASE: 'https://example.execute-api.us-east-1.amazonaws.com/dev',
    VIDEO_FACTORY_OUTPUT_PREFIX: 'factory-renders'
  });

  assert.deepEqual(config.subnets, ['subnet-a', 'subnet-b']);
  assert.deepEqual(config.securityGroups, ['sg-one']);
  assert.equal(config.containerName, 'renderer');
  assert.equal(config.outputPrefix, 'factory-renders');
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
