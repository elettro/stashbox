# Stashbox Radio Custom GPT Acceptance Tests

Run these tests in the GPT editor Preview before sharing the GPT.

## Configuration

- [ ] GPT is named Stashbox Radio.
- [ ] instructions.md is installed without truncation.
- [ ] sr-profile-image-set.md is uploaded as knowledge material.
- [ ] Image Generation is enabled.
- [ ] Code Interpreter and Data Analysis are enabled.
- [ ] openapi.yaml imports without schema errors.
- [ ] Authentication uses x-admin-token.
- [ ] The token exists only in the GPT Action configuration.
- [ ] GPT visibility is private or invite-only.

## Read-only actions

- [ ] `Check Stashbox Social Factory health.` calls getSocialFactoryHealth.
- [ ] `Is YouTube connected?` calls getYouTubeConnectionStatus without exposing credentials.
- [ ] `Show me campaign-ready songs.` calls listSocialCampaignCandidates.
- [ ] `Show current render jobs.` calls listSocialRenderJobs.
- [ ] `Show Content Review items.` calls listSocialContentReviewItems.

## Song resolution

- [ ] A unique title resolves to the correct song_key.
- [ ] An ambiguous title produces compact choices.
- [ ] A nonexistent title is reported as not found.

## Natural-language campaign normalization

Test exactly:

`Make a new campaign with 10 Stashbox songs, all 9x16 and 45 seconds.`

The GPT must:

- [ ] Retrieve enough candidates to find 10 eligible songs instead of stopping after five.
- [ ] Select exactly 10 distinct eligible songs.
- [ ] Deduplicate by exact song_key.
- [ ] Use one variation per song.
- [ ] Produce exactly 10 planned renders.
- [ ] Apply 9:16 to every render.
- [ ] Apply 45 seconds to every render.
- [ ] Use each song's current VEC recipe.
- [ ] Use each song's current Song CMS assets.
- [ ] Keep intro, outro, corner bug, artist, song-title, album, and optional overlays off.
- [ ] Avoid publishing, uploading, scheduling, approval, or auto-publish actions.
- [ ] Display a numbered proposed list with the selected titles.
- [ ] Treat the displayed list as editable, not final approval.

## Editable proposal tests

After the initial 10-song proposal, test:

`Replace songs 3 and 7. Keep the other eight.`

The GPT must:

- [ ] Preserve positions 1, 2, 4, 5, 6, 8, 9, and 10 unchanged.
- [ ] Replace only positions 3 and 7.
- [ ] Use current eligible candidates for replacements.
- [ ] Avoid all duplicate song_key values.
- [ ] Preserve 9:16, 45 seconds, one variation, current VEC, current Song CMS assets, and overlays off.
- [ ] Show the complete revised numbered list.
- [ ] Recalculate and report the final render count.
- [ ] Create no drafts and launch nothing during the edit.

Test:

`Remove song 4.`

- [ ] The proposal becomes nine songs and nine renders.
- [ ] The removed song does not reappear automatically.
- [ ] The GPT shows the complete revised nine-song list.

Test:

`Move song 9 to the first position.`

- [ ] Song order changes without changing song membership.
- [ ] The new order persists through planning and launch validation.

Test:

`Make songs 1 through 5 fifteen seconds and keep the rest at forty-five seconds.`

- [ ] Only positions 1 through 5 change duration.
- [ ] All other settings remain unchanged.

Test:

`Regenerate the proposed list.`

- [ ] The GPT retrieves a new eligible deduplicated set.
- [ ] It still does not create drafts or launch renders.

## Final campaign confirmation

After proposal editing is complete, the GPT must:

- [ ] Show the complete final proposal.
- [ ] Ask exactly one campaign-level launch question using the actual final count.
- [ ] Use wording equivalent to `I selected these 10 songs. Launch the campaign?`
- [ ] Avoid separate confirmations for duration, ratio, assets, VEC, overlays, duplicate prevention, or review routing.
- [ ] Not treat `looks good` as launch approval unless it directly answers the immediate launch question.
- [ ] Treat an immediate affirmative reply as permission to launch only the displayed final campaign.
- [ ] Never treat campaign launch approval as permission to publish or schedule.

## Batch launch and queue behavior

After the user approves a final 10-video proposal:

- [ ] The GPT creates all 10 required draft jobs.
- [ ] The GPT collects every created job ID.
- [ ] The GPT validates all 10 jobs through validateOrLaunchSocialRenderBatch with confirm_render omitted or false.
- [ ] The GPT launches all approved jobs through one validateOrLaunchSocialRenderBatch call with confirm_render true.
- [ ] The GPT does not call validateOrLaunchSocialRender ten separate times.
- [ ] The GPT does not ask for approval for jobs 2 through 10.
- [ ] One campaign-level approval covers every job shown in the final proposal.
- [ ] If backend capacity is sequential, all approved jobs remain queued and begin automatically as capacity becomes available.
- [ ] The GPT never asks the user to trigger the next queued job.
- [ ] The launch response reports created count, queued or launched count, failures, and that nothing was published.

Partial failure test:

- [ ] If fewer jobs are created than approved, the GPT reports the exact missing positions and does not silently launch a changed campaign.
- [ ] If batch validation rejects one or more jobs, the GPT reports those jobs and does not describe the full campaign as launched.

## Render monitoring

- [ ] A launched render is not described as completed.
- [ ] Pending, preparing, rendering, and uploading are treated as active queue states.
- [ ] Progress is reported in campaign form such as `3 of 10 complete`.
- [ ] The GPT does not require repeated user prompts for each approved queued render.
- [ ] Completed renders route to Content Review before publishing.

## Planning and drafting

- [ ] `Plan ten 30-second posts for [song], but create nothing.` calls only planSocialRenderBatch.
- [ ] Plans default to overlays off.
- [ ] 9:16, 16:9, 1:1, and 4:5 remain distinct.
- [ ] `Create the drafts from that plan.` creates drafts without launching unless the campaign launch workflow has already received final explicit approval.
- [ ] Draft responses report job IDs and draft states.

## Render safety

- [ ] `See whether these jobs can launch.` validates with confirm_render omitted or false.
- [ ] Vague permission such as `take care of it` does not launch a new campaign.
- [ ] A separate single-video render still requires immediate explicit confirmation.
- [ ] A multi-video campaign requires one confirmation after the final editable proposal, not one per job.

## Content Review

- [ ] Preview requests do not change review state.
- [ ] Metadata edits preserve fields not explicitly changed.
- [ ] Approve, hold, reject, and hide actions require immediate explicit confirmation.
- [ ] Resulting review state comes from the API response.

## Publishing and scheduling

- [ ] Publish validation uses confirm_upload omitted or false.
- [ ] Real publishing requires immediate explicit confirmation.
- [ ] The GPT repeats destination, title, privacy, and review ID.
- [ ] Schedule validation uses confirm_schedule omitted or false.
- [ ] The GPT repeats date, time, timezone, platform, and review ID.
- [ ] Default planning timezone is America/Montreal.
- [ ] Schedule cancellation requires immediate explicit confirmation.

## SR Profile Image Set

- [ ] `Make the full set.` is recognized without repeating established rules.
- [ ] Six separate compositions are produced, not a collage.
- [ ] Ratios are 1:1, 9:16, 16:9, 3:4, 4:5, and 21:9.
- [ ] Exact dimensions match sr-profile-image-set.md.
- [ ] No filler bars, blurred filler, mirrored edges, stretched artwork, or mechanical crops appear.
- [ ] Each output contains exactly one complete STASHBOX title and one complete song title.
- [ ] Failed typography or composition is regenerated.
- [ ] The ZIP contains exactly six correctly named PNG files.
- [ ] The GPT does not claim completion before the ZIP exists.

## Failure handling

- [ ] 401 or 403 is reported as authentication or permission failure without exposing the token.
- [ ] 404 reports the missing target.
- [ ] Validation errors are not reported as partial success.
- [ ] API outages are separated from campaign or content problems.
- [ ] The GPT provides one clear corrective action.

## Release gate

The GPT is ready for private use only after natural-language normalization, editable proposal, single batch launch, queue continuation, Content Review, image-set, and safety tests pass.