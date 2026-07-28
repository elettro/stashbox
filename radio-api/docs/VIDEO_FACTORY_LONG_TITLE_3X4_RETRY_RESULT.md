# Video Factory Long-Title 3:4 Retry Validation

Status: completed
Started: 2026-07-28T19:57:11.143Z
Completed: 2026-07-28T19:58:00.940Z

- Original job ID: `ed85c085-40d8-425c-90af-3385821a1e34`
- Retried job ID: `ed85c085-40d8-425c-90af-3385821a1e34`
- Initial status: failed
- Initial error message: Video Factory API returned 503.
- Initial runtime: `{"updated_at":"2026-07-28T19:49:05.166Z","launched_at":"2026-07-28T19:48:40.823Z","ecs_task_arn":"arn:aws:ecs:us-east-1:656260749296:task/stashbox-video-factory-dev/341fa25caed8491cbe78d25171361e66","heartbeat_at":"2026-07-28T19:49:05.165Z","status_message":"Render failed.","progress_percent":0,"launch_requested_at":"2026-07-28T19:48:39.424Z"}`
- Retry response: `{"success":true,"message":"Video Factory render started.","job_id":"ed85c085-40d8-425c-90af-3385821a1e34","status":"pending","task_arn":"arn:aws:ecs:us-east-1:656260749296:task/stashbox-video-factory-dev/1884879fded14c14bde6f32183a74d5d"}`
- Final status: completed
- Final error message: 
- Final runtime: `{"updated_at":"2026-07-28T19:57:45.302Z","launched_at":"2026-07-28T19:57:13.106Z","completed_at":"2026-07-28T19:57:45.302Z","ecs_task_arn":"arn:aws:ecs:us-east-1:656260749296:task/stashbox-video-factory-dev/1884879fded14c14bde6f32183a74d5d","heartbeat_at":"2026-07-28T19:57:35.673Z","status_message":"Render completed.","progress_percent":100,"launch_requested_at":"2026-07-28T19:57:12.242Z"}`
- Dimensions: 1080×1440
- Duration: 15 seconds
- Frame rate: 30/1
- Video streams: 1
- Audio streams: 1
- Downloaded bytes: 653521
- Output filename: `stashbox_party-spots-and-waves-newport-beach_1080x1440_15s_3x4_v01.mp4`
- Frames: 0.5s (3x4-retry-0_5s.jpg), 3s (3x4-retry-3s.jpg), 7.5s (3x4-retry-7_5s.jpg), 12s (3x4-retry-12s.jpg), 14.5s (3x4-retry-14_5s.jpg)
- Error: none
