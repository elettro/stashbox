# Stashbox Radio React Supabase Test

This directory is the only current scope for the React radio Supabase test:

- Test app: `/stashbox/radio/react/`
- Production app: `/stashbox/radio/` remains unchanged

## Supabase configuration for GitHub Pages

The React test app is served as static files on GitHub Pages, so it does **not** use Vite build-time environment variables. Runtime Supabase configuration is loaded from `radio/react/config.js` before `app.js` starts.

`radio/react/config.js` is intentionally gitignored so local Supabase values are not accidentally committed. Start from the example file:

```bash
cp radio/react/config.example.js radio/react/config.js
```

Then open `radio/react/config.js` and paste your public Supabase values exactly here:

```js
window.STASHBOX_SUPABASE_CONFIG = {
  // Paste your Supabase Project URL between these quotes.
  // Supabase Dashboard → Project Settings → API → Project URL
  url: "https://your-project-ref.supabase.co",

  // Paste your Supabase Publishable Key between these quotes.
  // Supabase Dashboard → Project Settings → API → Project API keys → Publishable key
  anonKey: "your-supabase-publishable-key"
};
```

Do not use Vite names such as `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` for this static GitHub Pages app. The browser reads only `window.STASHBOX_SUPABASE_CONFIG.url` and `window.STASHBOX_SUPABASE_CONFIG.anonKey`.

The Supabase Publishable Key is intended for browser use, but never paste server-only Supabase secrets, service-role keys, database passwords, or JWT secrets into this directory or any client-side file.

> GitHub Pages note: because `config.js` is gitignored, make sure the deployment source that GitHub Pages publishes contains a configured `radio/react/config.js` file by your chosen deployment process. If Pages publishes directly from the repository branch, you must provide that runtime file in the published branch/path for the app to connect to Supabase.

## Expected Supabase tables

### `songs`

The app fetches only active songs, ordered by `sort_order`:

```js
.eq('is_active', true)
.order('sort_order', { ascending: true })
```

Expected columns:

- `id`
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
- `created_at`

If the `songs` table returns no active rows, the UI shows a friendly empty state instead of falling back to the production radio source.

### Optional `products`

Expected columns:

- `id`
- `title`
- `image_url`
- `product_url`
- `price`
- `collection`
- `is_active`

### Optional `song_products`

Expected columns:

- `id`
- `song_id`
- `product_id`
- `priority`

When a song is selected, the app tries to load active products linked through `song_products`, ordered by `priority`. If the optional relationship tables do not exist or no linked products are returned, the app keeps the existing general Stashbox merch fallback carousel.

## Current scope

This Supabase integration is intentionally limited to `/stashbox/radio/react/`. Do not update the production `/stashbox/radio/` page as part of this test.
