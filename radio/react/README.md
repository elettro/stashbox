# Stashbox Radio React Supabase Test

This directory is the only current scope for the React radio Supabase test:

- Test app: `/stashbox/radio/react/`
- Production app: `/stashbox/radio/` remains unchanged

## Required environment variables

The React test app reads Supabase config from Vite-style public environment variables:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

Do not commit Supabase secrets. The public anon key is the only key this browser app should receive. Never place server-only Supabase secrets in this directory or in any client-side bundle.

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
