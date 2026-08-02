import fs from 'node:fs';

const path = 'social-factory-api/schedule-publish.mjs';
const source = fs.readFileSync(path, 'utf8');

const before = `    async delete(name) {
      const [{ DeleteScheduleCommand }, client] = await Promise.all([getSdk(), getClient()]);
      try {
        await client.send(new DeleteScheduleCommand({ Name: name, GroupName: groupName }));
      } catch (error) {
        if (error?.name !== 'ResourceNotFoundException') throw error;
      }
    },`;

const after = `    async delete(name) {
      const [{ DeleteScheduleCommand }, client] = await Promise.all([getSdk(), getClient()]);
      try {
        await client.send(new DeleteScheduleCommand({ Name: name, GroupName: groupName }));
        return { deleted: true, already_missing: false };
      } catch (error) {
        if (error?.name === 'ResourceNotFoundException') {
          return { deleted: false, already_missing: true };
        }
        throw serviceError('schedule_delete_failed', 502, {
          operation: 'scheduler:DeleteSchedule',
          schedule_name: String(name || ''),
          schedule_group: String(groupName || ''),
          aws_error_name: String(error?.name || error?.Code || 'UnknownError'),
          aws_error_message: String(error?.message || 'AWS Scheduler deletion failed.'),
          aws_http_status: Number(error?.$metadata?.httpStatusCode || 0) || null,
          aws_request_id: String(error?.$metadata?.requestId || ''),
          retryable: Boolean(error?.$retryable)
        });
      }
    },`;

const count = source.split(before).length - 1;
if (count !== 1) {
  throw new Error(`Expected exactly one AWS Scheduler delete block, found ${count}.`);
}

fs.writeFileSync(path, source.replace(before, after));
console.log('Added structured AWS Scheduler cancellation diagnostics.');
