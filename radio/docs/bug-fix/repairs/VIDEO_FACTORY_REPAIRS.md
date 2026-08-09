# Video Factory Repair Playbook

Use for render requests, job creation, receipts, ratios, exports, and publishing handoff.

## Fast checks

1. Capture review/job/render ID.
2. Confirm request reached the API.
3. Confirm a job/receipt record exists.
4. Check requested ratio, duration, quality, song key, and recipe.
5. Check worker/deployment status and output location.
6. Separate rendering failures from publishing failures.
7. Compare current behavior with prior successful receipts.

## Common failure patterns

- Request accepted but no job created.
- Job created but worker never starts.
- Render completes but receipt/status does not update.
- Wrong aspect ratio or duration.
- Publishing action fails after successful render.
- Schedule exists but publishing trigger does not fire.

## Regression checks

- 9x16, 16x9, 1x1, 3x4, and 4x5 paths as applicable.
- Receipt creation.
- Status transitions.
- Output URL availability.
- YouTube/social handoff remains separate from render completion.