# DEV Artist API Diagnostic

Production touched: No

## Artist profile

- URL: `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/artists/stashbox`
- HTTP: `200`
- Access-Control-Allow-Origin: `*`

```json
{"success":true,"artist":{"id":"artist-f1828cce","artist_key":"stashbox","slug":"stashbox","name":"Stashbox","sort_name":"Stashbox","profile_image_url":"","banner_image_url":"","bio":"","location":"South Florida","website_url":"","spotify_url":"","apple_music_url":"","youtube_url":"","instagram_url":"","x_url":"","facebook_url":"","merch_url":"","verified":false,"featured":false,"follower_count":0,"song_count":67,"is_following":false,"created_at":"2026-07-21T03:41:59.719Z","updated_at":"2026-07-21T11:35:43.979Z"},"songs":[{"id":"504eb797-a31a-46d1-87a4-56dbb015bfc7","song_key":"space-jam-05d-stashbox","song_name":"Space Jam","display_title":"Space Jam","artist":"Stashbox","genre":"Psychedelic Rock","secondary_genre":"Psychedelic","mood":null,"mood_tags":["psychedelic","chill","uplifting"],"release_format":"single","album_name":null,"audio_url":"https://stashbox-media-656260749296-us-east-2-an.s3.us-east-2.amazonaws.com/songs/stashbox/tracks/space-jam-05d-stashbox/audio/1781705834622-z-
```

## Song catalog

- URL: `https://d21fbe6u80.execute-api.us-east-1.amazonaws.com/dev/radio/songs`
- HTTP: `200`
- Access-Control-Allow-Origin: `*`

```json
{"success":true,"count":71,"songs":[{"id":"504eb797-a31a-46d1-87a4-56dbb015bfc7","song_key":"space-jam-05d-stashbox","song_name":"Space Jam","display_title":"Space Jam","artist":"Stashbox","genre":"Psychedelic Rock","secondary_genre":"Psychedelic","mood":null,"mood_tags":["psychedelic","chill","uplifting"],"release_format":"single","album_name":null,"audio_url":"https://stashbox-media-656260749296-us-east-2-an.s3.us-east-2.amazonaws.com/songs/stashbox/tracks/space-jam-05d-stashbox/audio/1781705834622-z-Radio-Space-Jam-05d-Distrokid-Vervelike-Cool.wav","song_artwork_url":"https://stashbox-media-656260749296-us-east-2-an.s3.us-east-2.amazonaws.com/songs/stashbox/tracks/space-jam-05d-stashbox/artwork/1781706015845-deanpalermo_Scandinavian_supermodels_Album_Cover_for_a_super__a2566c9d-108a-4da7-bc2e-85999854e7a3_2.png","video_link":"","graphics_folder_link":null,"public_track_note":"","show_public_note":false,"public_video_note":"","video_setlist":"","public_visibility":"visible","exclusiv
```

## CORS preflight

- HTTP: `204`
- Allow-Origin: `*`
- Allow-Headers: `Content-Type,x-admin-token,Authorization,X-Cognito-Id-Token,X-Anonymous-Visitor-Id`

## Upload presign reachability

- HTTP: `401` (401/403 is acceptable without admin token; network failure is not)
- Allow-Origin: `*`

```json
{"success":false,"error":"Unauthorized. Check admin token."}
```
