# Stashbox Radio Custom GPT Acceptance Tests

Run these tests in the GPT editor Preview before sharing the GPT.

## Configuration

- [ ] GPT is named **Stashbox Radio**.
- [ ] Description matches the setup guide.
- [ ] `instructions.md` is installed without truncation.
- [ ] `sr-profile-image-set.md` is uploaded as knowledge/reference material.
- [ ] Image Generation is enabled.
- [ ] Code Interpreter & Data Analysis is enabled.
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

## SR Profile Image Set

Use one non-critical source graphic containing a clear `STASHBOX` title and song title.

- [ ] `Make the full set.` is recognized without requiring the established rules to be repeated.
- [ ] The GPT creates six separate compositions rather than one collage.
- [ ] The six ratios are exactly 1:1, 9:16, 16:9, 3:4, 4:5, and 21:9.
- [ ] The exact dimensions are 2048×2048, 1080×1920, 1920×1080, 1536×2048, 1080×1350, and 2520×1080.
- [ ] Each output extends the actual design across the full frame.
- [ ] No output contains empty extensions, filler bars, blurred filler, mirrored edges, repeated edge strips, or a small source image floating in a larger canvas.
- [ ] No output is a mechanical center crop of the same master composition.
- [ ] Exactly one complete `STASHBOX` title appears in each image.
- [ ] Exactly one complete song title appears in each image.
- [ ] All text is readable with generous safe margins.
- [ ] No partial letters, duplicate words, stretched typography, or cut-off text appear.
- [ ] The GPT regenerates any failed output before packaging.
- [ ] The six PNG filenames follow `stashbox_<song-slug>_<ratio>_<width>x<height>.png`.
- [ ] The ZIP follows `stashbox_<song-slug>_sr_profile_image_set.zip`.
- [ ] The ZIP contains exactly six PNG files at the root and no temporary or duplicate files.
- [ ] The GPT returns a real downloadable ZIP and does not claim completion before it exists.
- [ ] The individual outputs are presented separately or in a native gallery, never flattened into one contact sheet.

## Image-set negative tests

- [ ] With no attached image, `Make the full set.` asks for a usable source image instead of inventing one.
- [ ] With two plausible source images, the GPT asks which image to use.
- [ ] With an unreadable or ambiguous song title, the GPT asks one compact clarification.
- [ ] If Image Generation is unavailable, the GPT reports that capability as blocked rather than creating simple padded resizes.
- [ ] If Code Interpreter cannot create the ZIP, the GPT reports the packaging failure and does not claim a completed set.

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
- [ ] A failed image or ZIP operation is separated from a Social Factory API problem.
- [ ] The GPT offers one clear next corrective action.

## Release gate

The initial GPT is ready for private use only after all read-only, planning, drafting, image-set, and safety tests pass. Keep publishing and scheduling tests limited to a deliberately approved unlisted test asset until the complete workflow is verified.
