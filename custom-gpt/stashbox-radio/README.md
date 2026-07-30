# Stashbox Radio Custom GPT

This folder contains the configuration package for the private **Stashbox Radio** Custom GPT. The GPT operates the isolated Stashbox Social Factory API through GPT Actions and also produces the established six-size SR Profile Image Set from uploaded artwork.

## Current scope

The first version can safely:

- Check Social Factory service health.
- Inspect YouTube connection status.
- Find eligible songs for social campaigns.
- Plan a batch without creating renders.
- Create Video Factory render drafts.
- List and inspect render jobs.
- Validate render launches without launching.
- Launch renders only after explicit confirmation.
- List Content Review items.
- Preview, edit, hold, approve, or reject review items.
- Validate publishing or scheduling before execution.
- Turn one uploaded graphic into the six purpose-built SR Profile Image Set sizes.
- Verify exact image dimensions and filenames.
- Package the six PNG files into a properly named ZIP.

The GPT must never interpret vague language as approval to render, publish, delete, disconnect, or schedule.

## Official name

- GPT name: `Stashbox Radio`
- Conversational shorthand: `Stashbox`
- Description: `Plans, creates, reviews, and manages Stashbox Social Factory campaigns and produces complete Stashbox image sets through controlled workflows.`

## Required GPT capabilities

Enable:

- **Image Generation** — creates each image-kit ratio as its own purpose-built composition.
- **Code Interpreter & Data Analysis** — verifies exact pixel sizes, applies proportional final sizing when needed, names files, and creates the downloadable ZIP.
- **Actions** — connects the GPT to the isolated Social Factory DEV API.

Web Search and Canvas are optional. Do not enable Apps because this GPT uses Actions.

## Configure the GPT

1. Open the GPT editor on desktop web.
2. Set the name and description above.
3. Paste `instructions.md` into the Instructions field.
4. Upload `sr-profile-image-set.md` as a knowledge/reference file.
5. Enable Image Generation and Code Interpreter & Data Analysis.
6. Add these conversation starters:
   - `Show me the best songs ready for a social campaign.`
   - `Plan a 10-post campaign for one song without creating anything yet.`
   - `Show me render jobs that need attention.`
   - `Show me Content Review items ready for approval.`
   - `Make the full six-size extended image set from my uploaded artwork.`
7. In Actions, import `openapi.yaml`.
8. Configure authentication as an API key using the custom header `x-admin-token`.
9. Store the existing Social Factory DEV admin token in the GPT editor. Never place the token in this repository or GPT instructions.
10. Test all read-only actions first in Preview.
11. Run the image-set acceptance test using a non-critical source graphic.
12. Keep the GPT private or invite-only during DEV testing.

## SR Profile Image Set

The locked production specification is in `sr-profile-image-set.md`.

Canonical outputs:

- 1:1 — 2048 × 2048
- 9:16 — 1080 × 1920
- 16:9 — 1920 × 1080
- 3:4 — 1536 × 2048
- 4:5 — 1080 × 1350
- 21:9 — 2520 × 1080

The permanent rule is to **extend the complete design, not merely the canvas**. Empty padding, blurred filler, mirrored edges, mechanical crops, stretched typography, duplicate text, and cut-off text are prohibited.

## API

DEV server:

`https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev`

The public health route requires no authentication. All other routes require `x-admin-token`.

The SR Profile Image Set uses native GPT Image Generation and Code Interpreter capabilities in version one; it does not require a Social Factory API endpoint.

## Safety model

Actions and production work are divided into three levels:

1. **Read-only** — health, status, candidates, job lists, review lists.
2. **Drafting, creative production, and validation** — plans, draft creation, image-set generation, ZIP packaging, preview, save, validation-only launch/publish/schedule calls.
3. **Execution** — launch render, approve/reject/hold, publish, schedule, cancel schedule, disconnect.

For level 3, the GPT must summarize the exact action and obtain explicit user confirmation immediately before the action call. A prior general instruction such as “handle the campaign” is not sufficient.

A clear request such as `Make the full set from this image` is sufficient authorization for the Level 2 image-set workflow. No second confirmation is required.

## Initial test sequence

1. Get service health.
2. Get YouTube status.
3. List orchestration candidates.
4. Create a validation-only batch plan.
5. List render jobs.
6. List review items.
7. Preview one review item.
8. Save a harmless metadata edit.
9. Validate a launch without `confirm_render`.
10. Create one SR Profile Image Set and verify all six images and the ZIP.
11. Only after direct approval, test one render launch.

## Files

- `instructions.md` — complete GPT behavior and operating rules.
- `openapi.yaml` — Social Factory GPT Actions schema.
- `acceptance-tests.md` — manual verification checklist.
- `sr-profile-image-set.md` — exact six-size image production, naming, QA, and ZIP specification.

## Important implementation note

The current Action schema maps to the Social Factory API that exists today. Some campaign-management concepts are represented by batch planning and render/review workflows rather than a dedicated persistent campaign endpoint. A later API phase can add durable campaign CRUD, caption generation, platform-specific variations, and unified campaign status.

The image-set workflow must be tested in GPT Preview because the native handoff between generated images and Code Interpreter packaging is a GPT capability, not a Stashbox API call. Do not call the feature complete until the Preview test produces six valid files and a downloadable ZIP.
