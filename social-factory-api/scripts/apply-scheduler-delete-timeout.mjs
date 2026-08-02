import fs from 'node:fs';

const path = 'social-factory-api/schedule-publish.mjs';
let source = fs.readFileSync(path, 'utf8');

source = source.replace(
  "new SchedulerClient({})",
  "new SchedulerClient({ maxAttempts: 1 })"
);

const before = `    async delete(name) {\n      const [{ DeleteScheduleCommand }, client] = await Promise.all([getSdk(), getClient()]);\n      try {\n        await client.send(new DeleteScheduleCommand({ Name: name, GroupName: groupName }));\n      } catch (error) {\n        if (error?.name !== 'ResourceNotFoundException') throw error;\n      }\n    },`;

const after = `    async delete(name) {\n      const [{ DeleteScheduleCommand }, client] = await Promise.all([getSdk(), getClient()]);\n      const controller = new AbortController();\n      const timer = setTimeout(() => controller.abort(), 8000);\n      try {\n        await client.send(\n          new DeleteScheduleCommand({ Name: name, GroupName: groupName }),\n          { abortSignal: controller.signal }\n        );\n      } catch (error) {\n        if (error?.name === 'ResourceNotFoundException') return;\n        if (error?.name === 'AbortError') {\n          throw serviceError('schedule_delete_timeout', 504, {\n            schedule_name: name,\n            schedule_group: groupName,\n            error_name: error?.name || 'AbortError'\n          });\n        }\n        throw serviceError('schedule_delete_failed', 502, {\n          schedule_name: name,\n          schedule_group: groupName,\n          error_name: error?.name || 'Error',\n          aws_message: error?.message || '',\n          aws_request_id: error?.$metadata?.requestId || null,\n          aws_http_status: error?.$metadata?.httpStatusCode || null\n        });\n      } finally {\n        clearTimeout(timer);\n      }\n    },`;

if (!source.includes(before)) {
  if (source.includes("schedule_delete_timeout")) {
    console.log('Scheduler delete timeout patch already applied.');
    process.exit(0);
  }
  throw new Error('scheduler delete block not found');
}

source = source.replace(before, after);
fs.writeFileSync(path, source);
console.log('Applied Scheduler delete timeout and structured AWS error patch.');
