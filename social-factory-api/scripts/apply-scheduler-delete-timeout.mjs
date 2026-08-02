import fs from 'node:fs';

const path = 'social-factory-api/schedule-publish.mjs';
let source = fs.readFileSync(path, 'utf8');

if (source.includes("schedule_delete_timeout") && source.includes("maxAttempts: 1")) {
  console.log('Scheduler delete timeout patch already applied.');
  process.exit(0);
}

source = source.replace(
  "new SchedulerClient({})",
  "new SchedulerClient({ maxAttempts: 1 })"
);

const startMarker = '    async delete(name) {';
const endMarker = '\n    },\n\n    async create(';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start === -1 || end === -1) {
  throw new Error('scheduler delete function not found');
}

const replacement = `    async delete(name) {
      const [{ DeleteScheduleCommand }, client] = await Promise.all([getSdk(), getClient()]);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        await client.send(
          new DeleteScheduleCommand({ Name: name, GroupName: groupName }),
          { abortSignal: controller.signal }
        );
        return { deleted: true, already_missing: false };
      } catch (error) {
        if (error?.name === 'ResourceNotFoundException') {
          return { deleted: false, already_missing: true };
        }
        if (error?.name === 'AbortError') {
          throw serviceError('schedule_delete_timeout', 504, {
            operation: 'scheduler:DeleteSchedule',
            schedule_name: String(name || ''),
            schedule_group: String(groupName || ''),
            aws_error_name: 'AbortError',
            aws_error_message: 'AWS Scheduler deletion exceeded 8 seconds.',
            aws_http_status: null,
            aws_request_id: '',
            retryable: false
          });
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
      } finally {
        clearTimeout(timer);
      }
    },`;

source = source.slice(0, start) + replacement + source.slice(end + '\n    },'.length);
fs.writeFileSync(path, source);
console.log('Applied Scheduler delete timeout and structured AWS error patch.');
