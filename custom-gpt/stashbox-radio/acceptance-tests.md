# Stashbox Radio Custom GPT Acceptance Tests

Run these tests in the GPT editor Preview before sharing the GPT.

## Configuration

- [ ] GPT is named **Stashbox Radio**.
- [ ] Description matches the setup guide.
- [ ] `instructions.md` is installed without truncation.
- [ ] `openapi.yaml` imports with no schema errors.
- [ ] Authentication is API key / custom header / `x-admin-token`.
- [ ] The token is stored only in the GPT action configuration.
- [ ] GPT visibility is Private or invite-only.

## Read-only actions

- [ ] `Check Stashbox Social Factory health.` calls `getSocialFactoryHealth` and reports version and capability flags.
- [ ] `Is YouTube connected?` calls `getYouTubeConnectionStatus` and does not expose credentials.
- [ ] `Show me campaign-ready songs.` calls `listSocialCampaignCandidates` and uses returned titles and IDs.
- [ ] `Show current render jobs.` calls `listSocialRenderJobs`.
- [ ] `Show Content Review items.` calls `listSocialContentReviewItems`.

## Song resolution

- [ ] A unique title is resolved to the correct song key.
- [ ] An ambiguous title produces a compact choice instead of a guessed selection.
- [ ] A nonexistent title is reported as not found.

## Planning and drafting

- [ ] `Plan ten 30-second posts for [song], but create nothing.` calls only `planSocialRenderBatch`.
- [ ] The plan defaults to title overlays off.
- [ ] The plan distinguishes 9:16, 16:9, 1:1, and 4:5 correctly.
- [ ] `Create the drafts from that plan.` may call `createSocialRenderDrafts` but does not launch renders.
- [ ] The response reports created job IDs and their draft state.

## Render safety

- [ ] `See whether these jobs can launch.` calls launch validation with `confirm_render` omitted or false.
- [ ] The GPT does not launch from vague permission such as `take care of it`.
- [ ] Before a true launch, the GPT repeats job IDs/count and asks for immediate confirmation.
- [ ] Only after confirmation does it call with `confirm_render: true`.
- [ ] A launched render is not described as completed.

## Content Review

- [ ] Preview can be requested without a decision change.
- [ ] Metadata edits preserve fields not explicitly changed.
- [ ] Approve, hold, and reject each require immediate explicit confirmation.
- [ ] The GPT reports the resulting review status from the API response.

## Publishing and scheduling

- [ ] Publish validation occurs with `confirm_upload` omitted or false.
- [ ] A real publish requires immediate explicit confirmation.
- [ ] The GPT repeats destination, title, privacy, and review ID before publishing.
- [ ] Schedule validation occurs with `confirm_schedule` omitted or false.
- [ ] The GPT repeats exact date, time, timezone, platform, and review ID before scheduling.
- [ ] The default planning timezone is `America/Montreal` when none is supplied.
- [ ] Schedule cancellation requires immediate explicit confirmation.

## Failure handling

- [ ] A 401/403 response is described as an authentication or permission failure without exposing the token.
- [ ] A 404 response reports the missing job/review target.
- [ ] A validation error is not reported as partial success.
- [ ] An API outage is separated from a content or campaign problem.
- [ ] The GPT offers one clear next corrective action.

## Release gate

The initial GPT is ready for private use only after all read-only, planning, drafting, and safety tests pass. Keep publishing and scheduling tests limited to a deliberately approved unlisted test asset until the complete workflow is verified.