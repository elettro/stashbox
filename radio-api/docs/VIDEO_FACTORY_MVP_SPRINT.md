# Stashbox Radio Video Factory MVP

## Purpose

Video Factory is a private Stashbox Radio backend CMS tool for producing finished MP4 music videos and promotional edits from Song CMS audio, VEC recipes, artwork, and visual assets.

It is not public-facing. All routes remain under `/admin/video-factory/*` and use the existing Stashbox Radio admin token.

## Sprint 1 goal

Create one render definition at a time and retain it in permanent Render History.

The first complete proof should:

1. Select one Song CMS song.
2. Create one 16:9 full-song render job.
3. Build and save a deterministic render recipe.
4. Launch one FFmpeg render worker.
5. Save the MP4 and thumbnail to private S3 storage.
6. Update the job to Completed.
7. Preview and re-download the output from Render History.

## Architecture

### Existing Lambda remains

The existing DEV Lambda remains `stashbox-radio-api-dev-v2`.

The deployment package preserves the current API as `radio-main.mjs`. A lightweight wrapper becomes the deployed `index.mjs` and intercepts only `/admin/video-factory/*`. Every other request is passed directly to the existing radio handler.

This keeps Video Factory modular without adding another API Lambda.

### Separate renderer

FFmpeg rendering will not run inside Lambda. A later sprint step will add one ECS Fargate task for the active render job.

Initial concurrency is one active render at a time. SQS and Step Functions are intentionally deferred.

## DEV locations

- CMS: `/radio-admin/dev/video-factory/`
- API jobs: `/admin/video-factory/jobs`
- API job detail: `/admin/video-factory/jobs/{jobId}`
- API summary: `/admin/video-factory/summary`

## Current data model

The route module creates these tables inside the schema selected by `PGSCHEMA`:

- `video_render_batches`
- `video_render_jobs`
- `video_render_outputs`

DEV therefore writes to `radio_dev`. Production will write to `radio` after a separate promotion sprint.

## Current job statuses

- draft
- pending
- preparing
- rendering
- uploading
- completed
- failed
- cancelled
- archived

Sprint 1 currently creates Draft jobs. Worker submission will be added after the ECS task and private S3 output location exist.

## Render recipe foundation

Each job stores:

- Song key, title, artist, album, and audio URL
- Duration mode and optional duration seconds
- Aspect ratio, width, height, and FPS
- Output type
- Random seed
- Intro, outro, and corner icon settings
- Artist, song, and album burn-in settings
- Embedded metadata defaults
- Filename template and resolved output filename
- Timeline placeholder for VEC asset ordering

## Filename tokens

Supported foundation tokens:

- `{artist}`
- `{song}`
- `{album}`
- `{duration}`
- `{aspect}`
- `{resolution}`
- `{variation}`
- `{date}`
- `{jobId}`
- `{batchId}`

Default:

`{artist}_{song}_{duration}_{aspect}_v{variation}`

## Render History

The DEV CMS supports:

- Song, artist, client, project, and filename search
- Status filtering
- Render summary totals
- Output format badges
- Output filename display
- Completed-file download when `output_url` exists
- Permanent job IDs

## Storage rule

Video Factory outputs must remain private by default. Do not use a publicly readable prefix for unreleased client or Stashbox master files.

Temporary render files should use lifecycle cleanup. Completed masters, thumbnails, recipes, metadata, and job history remain until manually archived or deleted.

## Deferred work

- Private S3 render prefix or dedicated bucket decision
- ECS cluster, task definition, ECR repository, and FFmpeg container
- Render submission endpoint
- One-active-job enforcement
- VEC timeline construction
- Clip preloading and aspect-ratio crop rules
- Intro and outro motion templates
- Thumbnail generation
- Worker status callbacks
- Preview and re-download validation
- Song and Visuals Folder assignment
- Batch rendering and SQS
- Production promotion
