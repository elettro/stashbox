# Supabase Import Guide for `/stashbox/radio/react/`

This guide sets up the Supabase database tables used by the React radio test app in `/stashbox/radio/react/`.
The production `/stashbox/radio/` app remains unchanged.

## Required runtime configuration

The React app is served as static files on GitHub Pages and reads Supabase settings from `radio/react/config.js`, not from Vite build-time environment variables.

Start from the example file:

```bash
cp radio/react/config.example.js radio/react/config.js
```

Then open `radio/react/config.js` and paste the public values from **Supabase Dashboard → Project Settings → API**:

```js
window.STASHBOX_SUPABASE_CONFIG = {
  // Paste the Supabase Project URL here.
  url: "https://your-project-ref.supabase.co",

  // Paste the Supabase Publishable Key here.
  anonKey: "your-supabase-publishable-key"
};
```

> **Security warning:** Never expose the Supabase service role key in frontend code, committed files, browser builds, or public hosting settings. The React app should only use the Publishable Key intended for browser use.

## How to run the SQL setup

1. Open your Supabase project dashboard.
2. Go to **SQL Editor**.
3. Create a new query.
4. Open `radio/react/supabase-schema.sql` in this repo.
5. Copy the full SQL file into the Supabase SQL Editor.
6. Click **Run**.
7. Confirm these tables appear under **Database > Tables**:
   - `songs`
   - `products`
   - `song_products`

The SQL creates the tables, indexes, row-level security settings, and public read-only policies needed by `/stashbox/radio/react/`.

## Sample insert SQL for two test songs

The schema file already includes these two placeholder test rows. You can also run this SQL separately after creating the tables if you skipped the sample section.

```sql
insert into public.songs (
  title,
  artist,
  album,
  genre,
  audio_url,
  artwork_url,
  video_url,
  description,
  is_active,
  sort_order
) values
  (
    'Supabase Test Track 1',
    'Stashbox Radio',
    'Supabase Test Imports',
    'Reggae',
    'https://example.com/audio/supabase-test-track-1.mp3',
    'https://example.com/artwork/supabase-test-track-1.jpg',
    null,
    'Placeholder test song for validating the /stashbox/radio/react/ Supabase connection.',
    true,
    10
  ),
  (
    'Supabase Test Track 2',
    'Stashbox Radio',
    'Supabase Test Imports',
    'Rock',
    'https://example.com/audio/supabase-test-track-2.mp3',
    'https://example.com/artwork/supabase-test-track-2.jpg',
    null,
    'Second placeholder test song for validating the /stashbox/radio/react/ Supabase connection.',
    true,
    20
  );
```

Replace the placeholder `https://example.com/...` URLs with real public audio and artwork URLs when you are ready to test playback and cover art.

## How to manually add the first 5 songs

1. In Supabase, go to **Database > Tables > songs**.
2. Click **Insert > Insert row**.
3. Fill in the song fields:
   - `title` is required.
   - `artist`, `album`, `genre`, `audio_url`, `artwork_url`, `video_url`, and `description` are optional but recommended.
   - Set `is_active` to `true` for songs that should appear in the React app.
   - Use `sort_order` values like `10`, `20`, `30`, `40`, and `50` so you can insert songs between them later.
4. Click **Save**.
5. Repeat until the first 5 songs are added.
6. Reload `/stashbox/radio/react/` and confirm the active songs appear in sort order.

Suggested first 5-song layout:

| title | artist | album | genre | sort_order | is_active |
| --- | --- | --- | --- | ---: | --- |
| First Song Title | Artist Name | Album Name | Reggae | 10 | true |
| Second Song Title | Artist Name | Album Name | Rock | 20 | true |
| Third Song Title | Artist Name | Album Name | Blues | 30 | true |
| Fourth Song Title | Artist Name | Album Name | Funk | 40 | true |
| Fifth Song Title | Artist Name | Album Name | Electronic | 50 | true |

## How to import CSV from Google Sheets later

1. In Google Sheets, create columns that match the Supabase `songs` table fields you want to import:
   - `title`
   - `artist`
   - `album`
   - `genre`
   - `audio_url`
   - `artwork_url`
   - `video_url`
   - `description`
   - `is_active`
   - `sort_order`
2. Keep `title` populated for every row.
3. Use `true` or `false` for `is_active`.
4. Use whole numbers for `sort_order`.
5. Leave `id` and `created_at` out of the CSV unless you intentionally want to provide your own UUIDs/timestamps.
6. In Google Sheets, choose **File > Download > Comma Separated Values (.csv)**.
7. In Supabase, go to **Database > Tables > songs**.
8. Use the table import option to upload the CSV.
9. Map the CSV columns to the matching Supabase columns.
10. Import, then reload `/stashbox/radio/react/` to confirm the active songs appear.

You can repeat the same CSV process for `products`. For `song_products`, first copy the UUID values from the imported `songs` and `products` rows, then import rows with `song_id`, `product_id`, and `priority`.

## Notes about read-only public access

The SQL enables row-level security on all three tables and adds only public `SELECT` policies:

- Public users can read active rows from `songs`.
- Public users can read active rows from `products`.
- Public users can read `song_products` rows.

No public `INSERT`, `UPDATE`, or `DELETE` policies are created. Manage content from the Supabase dashboard or trusted backend/admin tools only.
