# Stashbox Radio Custom GPT

This folder contains the initial configuration package for the private **Stashbox Radio** Custom GPT. The GPT is designed to operate the isolated Stashbox Social Factory API through GPT Actions.

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

The GPT must never interpret vague language as approval to render, publish, delete, disconnect, or schedule.

## Official name

- GPT name: `Stashbox Radio`
- Conversational shorthand: `Stashbox`
- Description: `Plans, creates, reviews, and manages Stashbox Social Factory campaigns through controlled actions.`

## Configure the GPT

1. Open the GPT editor.
2. Set the name and description above.
3. Paste `instructions.md` into the Instructions field.
4. Add these conversation starters:
   - `Show me the best songs ready for a social campaign.`
   - `Plan a 10-post campaign for one song without creating anything yet.`
   - `Show me render jobs that need attention.`
   - `Show me Content Review items ready for approval.`
5. In Actions, import `openapi.yaml`.
6. Configure authentication as an API key using the custom header `x-admin-token`.
7. Store the existing Social Factory DEV admin token in the GPT editor. Never place the token in this repository or GPT instructions.
8. Test all read-only actions first in Preview.
9. Keep the GPT private or invite-only during DEV testing.

## API

DEV server:

`https://tnrca1ff32.execute-api.us-east-1.amazonaws.com/dev`

The public health route requires no authentication. All other routes require `x-admin-token`.

## Safety model

Actions are divided into three levels:

1. **Read-only** — health, status, candidates, job lists, review lists.
2. **Drafting and validation** — plans, draft creation, preview, save, validation-only launch/publish/schedule calls.
3. **Execution** — launch render, approve/reject/hold, publish, schedule, cancel schedule, disconnect.

For level 3, the GPT must summarize the exact action and obtain explicit user confirmation immediately before the action call. A prior general instruction such as “handle the campaign” is not sufficient.

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
10. Only after direct approval, test one render launch.

## Files

- `instructions.md` — complete GPT behavior and operating rules.
- `openapi.yaml` — GPT Actions schema.
- `acceptance-tests.md` — manual verification checklist.

## Important implementation note

The current Action schema maps to the API that exists today. Some campaign-management concepts are represented by batch planning and render/review workflows rather than a dedicated persistent campaign endpoint. A later API phase can add durable campaign CRUD, caption generation, platform-specific variations, and unified campaign status.