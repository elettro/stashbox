# TRUE DEV Notification Activity Status

- Verified: 2026-07-21T17:58:51Z
- Result: PASS
- Target Lambda: `stashbox-radio-api-dev-v2`
- Production Lambda touched: No
- Public notifications HTTP: 200
- Admin notifications HTTP: 200
- Total active public notifications: 42
- Active automatic like/share notifications: 41
- Active daily ranking notifications: 1
- Public personalization flag: false
- Personalization sync result: `{"achievements":0,"favorite_milestones":0,"daily_top_song":1}`
- Account auth config route HTTP: 200
- Protected account route without token HTTP: 401
- Protected artist follows route without token HTTP: 401
- Cognito JWT signing keys bundled for private-VPC verification: Yes
- Followed-artist, registered-user, specific-user, and premium audience query: Enabled for authenticated requests
- Listener and favorite milestones: Deduplicated by stable source key
- Daily top song: Uses existing qualified play_start events; no new analytics table
- Rate limit: 10 automatic public activity notifications per clock hour
- Duplicate protection: one public activity notification per song and activity type within 30 minutes
- Listener identity exposed publicly: No

## Automatic public notifications
```json
[
  {
    "source_type": "daily_rankings",
    "headline": "Today's most-played song: Crowd of Two",
    "message": "Crowd of Two by Stashbox leads today's qualified plays with 3 listens.",
    "action_url": "/radio/dev/?song=crowd-of-two-001b-stashbox",
    "publish_at": "2026-07-21T17:58:50.384Z",
    "expires_at": "2026-07-22T23:58:50.384Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was shared",
    "message": "A listener shared “Space Jam” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T17:06:01.339Z",
    "expires_at": "2026-07-22T17:06:01.339Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was liked",
    "message": "A listener liked “Space Jam” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T17:05:57.903Z",
    "expires_at": "2026-07-22T17:05:57.903Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Yoga Pants for Days was liked",
    "message": "A listener liked “Yoga Pants for Days” by The Ras Box on Stashbox Radio.",
    "action_url": "/radio/dev/?song=yoga-pants-for-days-the-ras-box",
    "publish_at": "2026-07-21T15:42:57.010Z",
    "expires_at": "2026-07-22T15:42:57.010Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was liked",
    "message": "A listener liked “Space Jam” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T15:41:41.817Z",
    "expires_at": "2026-07-22T15:41:41.817Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was shared",
    "message": "A listener shared “Space Jam” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T15:26:27.072Z",
    "expires_at": "2026-07-22T15:26:27.072Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was liked",
    "message": "A listener liked “Space Jam” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T15:26:26.304Z",
    "expires_at": "2026-07-22T15:26:26.304Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "I'm Waiting was shared",
    "message": "A listener shared “I'm Waiting” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=im-waiting-001b-stashbox",
    "publish_at": "2026-07-21T15:22:11.341Z",
    "expires_at": "2026-07-22T15:22:11.341Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "I'm Waiting was liked",
    "message": "A listener liked “I'm Waiting” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=im-waiting-001b-stashbox",
    "publish_at": "2026-07-21T15:22:08.781Z",
    "expires_at": "2026-07-22T15:22:08.781Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Blue Dream was shared",
    "message": "A listener shared “Blue Dream” by The Ras Box from Stashbox Radio.",
    "action_url": "/radio/dev/?song=blue-dream-01b-stashbox",
    "publish_at": "2026-07-21T15:09:23.290Z",
    "expires_at": "2026-07-22T15:09:23.290Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Blue Dream was liked",
    "message": "A listener liked “Blue Dream” by The Ras Box on Stashbox Radio.",
    "action_url": "/radio/dev/?song=blue-dream-01b-stashbox",
    "publish_at": "2026-07-21T15:09:22.583Z",
    "expires_at": "2026-07-22T15:09:22.583Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Mr. Top Mi Up (Italian) was liked",
    "message": "A listener liked “Mr. Top Mi Up (Italian)” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=mr-top-mi-up-italian-33b-female-stashbox",
    "publish_at": "2026-07-21T14:44:28.732Z",
    "expires_at": "2026-07-22T14:44:28.732Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Mr. Top Mi Up (Italian) was shared",
    "message": "A listener shared “Mr. Top Mi Up (Italian)” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=mr-top-mi-up-italian-33b-female-stashbox",
    "publish_at": "2026-07-21T14:44:19.313Z",
    "expires_at": "2026-07-22T14:44:19.313Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was shared",
    "message": "A listener shared “Space Jam” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T14:43:05.306Z",
    "expires_at": "2026-07-22T14:43:05.306Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was liked",
    "message": "A listener liked “Space Jam” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T14:43:04.032Z",
    "expires_at": "2026-07-22T14:43:04.032Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Marianne (Feat. Squidly Cole) was liked",
    "message": "A listener liked “Marianne (Feat. Squidly Cole)” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=marianne-10b-stashbox",
    "publish_at": "2026-07-21T14:00:39.906Z",
    "expires_at": "2026-07-22T14:00:39.906Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Marianne (Feat. Squidly Cole) was shared",
    "message": "A listener shared “Marianne (Feat. Squidly Cole)” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=marianne-10b-stashbox",
    "publish_at": "2026-07-21T14:00:37.447Z",
    "expires_at": "2026-07-22T14:00:37.447Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Bee and the Flower was shared",
    "message": "A listener shared “Bee and the Flower” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=bee-and-the-flower-06a-stashbox",
    "publish_at": "2026-07-21T13:52:43.173Z",
    "expires_at": "2026-07-22T13:52:43.173Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Bee and the Flower was liked",
    "message": "A listener liked “Bee and the Flower” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=bee-and-the-flower-06a-stashbox",
    "publish_at": "2026-07-21T13:52:34.798Z",
    "expires_at": "2026-07-22T13:52:34.798Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Hippy Speedball (I'm On My Way) was shared",
    "message": "A listener shared “Hippy Speedball (I'm On My Way)” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=hippy-speedball-i-m-on-my-way-original-stashbox",
    "publish_at": "2026-07-21T12:58:34.963Z",
    "expires_at": "2026-07-22T12:58:34.963Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Hippy Speedball (I'm On My Way) was liked",
    "message": "A listener liked “Hippy Speedball (I'm On My Way)” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=hippy-speedball-i-m-on-my-way-original-stashbox",
    "publish_at": "2026-07-21T12:57:57.842Z",
    "expires_at": "2026-07-22T12:57:57.842Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was shared",
    "message": "A listener shared “Space Jam” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T11:57:43.383Z",
    "expires_at": "2026-07-22T11:57:43.383Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was liked",
    "message": "A listener liked “Space Jam” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T11:57:35.755Z",
    "expires_at": "2026-07-22T11:57:35.755Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Blue Dream was shared",
    "message": "A listener shared “Blue Dream” by The Ras Box from Stashbox Radio.",
    "action_url": "/radio/dev/?song=blue-dream-01b-stashbox",
    "publish_at": "2026-07-21T10:51:16.440Z",
    "expires_at": "2026-07-22T10:51:16.440Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Blue Dream was liked",
    "message": "A listener liked “Blue Dream” by The Ras Box on Stashbox Radio.",
    "action_url": "/radio/dev/?song=blue-dream-01b-stashbox",
    "publish_at": "2026-07-21T10:50:56.520Z",
    "expires_at": "2026-07-22T10:50:56.520Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Dub Reggae 01 was liked",
    "message": "A listener liked “Dub Reggae 01” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=dub-reggae-01a-ras-claat-stashbox",
    "publish_at": "2026-07-21T10:44:06.836Z",
    "expires_at": "2026-07-22T10:44:06.836Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was liked",
    "message": "A listener liked “Space Jam” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T03:55:22.945Z",
    "expires_at": "2026-07-22T03:55:22.945Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Dub Reggae 01 was liked",
    "message": "A listener liked “Dub Reggae 01” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=dub-reggae-01a-ras-claat-stashbox",
    "publish_at": "2026-07-21T03:08:30.245Z",
    "expires_at": "2026-07-22T03:08:30.245Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Blue Dream was shared",
    "message": "A listener shared “Blue Dream” by The Ras Box from Stashbox Radio.",
    "action_url": "/radio/dev/?song=blue-dream-01b-stashbox",
    "publish_at": "2026-07-21T02:35:15.479Z",
    "expires_at": "2026-07-22T02:35:15.479Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was liked",
    "message": "A listener liked “Space Jam” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T02:13:27.972Z",
    "expires_at": "2026-07-22T02:13:27.972Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Party Spots in Cali (Hermosa Beach) was shared",
    "message": "A listener shared “Party Spots in Cali (Hermosa Beach)” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=party-spots-in-cali-001-stashbox",
    "publish_at": "2026-07-21T02:02:55.736Z",
    "expires_at": "2026-07-22T02:02:55.736Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Party Spots in Cali (Hermosa Beach) was liked",
    "message": "A listener liked “Party Spots in Cali (Hermosa Beach)” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=party-spots-in-cali-001-stashbox",
    "publish_at": "2026-07-21T01:52:55.863Z",
    "expires_at": "2026-07-22T01:52:55.863Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Party Spots in Cali (Hermosa Beach) was shared",
    "message": "A listener shared “Party Spots in Cali (Hermosa Beach)” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=party-spots-in-cali-001-stashbox",
    "publish_at": "2026-07-21T01:52:39.587Z",
    "expires_at": "2026-07-22T01:52:39.587Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Blue Dream was liked",
    "message": "A listener liked “Blue Dream” by The Ras Box on Stashbox Radio.",
    "action_url": "/radio/dev/?song=blue-dream-01b-stashbox",
    "publish_at": "2026-07-21T01:31:17.860Z",
    "expires_at": "2026-07-22T01:31:17.860Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Streets of New York was liked",
    "message": "A listener liked “Streets of New York” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=streets-of-new-york-03b-stashbox",
    "publish_at": "2026-07-21T01:31:08.879Z",
    "expires_at": "2026-07-22T01:31:08.879Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Blue Dream was liked",
    "message": "A listener liked “Blue Dream” by The Ras Box on Stashbox Radio.",
    "action_url": "/radio/dev/?song=blue-dream-01b-stashbox",
    "publish_at": "2026-07-21T01:14:53.929Z",
    "expires_at": "2026-07-22T01:14:53.929Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Crowd of Two was liked",
    "message": "A listener liked “Crowd of Two” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=crowd-of-two-0005a-stashbox",
    "publish_at": "2026-07-21T00:55:59.144Z",
    "expires_at": "2026-07-22T00:55:59.144Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "I'm Waiting was liked",
    "message": "A listener liked “I'm Waiting” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=im-waiting-001b-stashbox",
    "publish_at": "2026-07-21T00:54:56.593Z",
    "expires_at": "2026-07-22T00:54:56.593Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Travelling was shared",
    "message": "A listener shared “Travelling” by Stashbox from Stashbox Radio.",
    "action_url": "/radio/dev/?song=travelling-001b-stashbox",
    "publish_at": "2026-07-21T00:54:44.303Z",
    "expires_at": "2026-07-22T00:54:44.303Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Travelling was liked",
    "message": "A listener liked “Travelling” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=travelling-001b-stashbox",
    "publish_at": "2026-07-21T00:54:37.633Z",
    "expires_at": "2026-07-22T00:54:37.633Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Love Her Love Her was liked",
    "message": "A listener liked “Love Her Love Her” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=love-her-love-her--04a-stashbox",
    "publish_at": "2026-07-21T00:54:21.633Z",
    "expires_at": "2026-07-22T00:54:21.633Z"
  },
  {
    "source_type": "activity_engine",
    "headline": "Space Jam was liked",
    "message": "A listener liked “Space Jam” by Stashbox on Stashbox Radio.",
    "action_url": "/radio/dev/?song=space-jam-05d-stashbox",
    "publish_at": "2026-07-21T00:53:53.796Z",
    "expires_at": "2026-07-22T00:53:53.796Z"
  }
]
```
