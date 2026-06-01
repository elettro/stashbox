-- Supabase setup for /stashbox/radio/react/
--
-- 1. Open your Supabase project.
-- 2. Go to SQL Editor.
-- 3. Paste this SQL into a new query.
-- 4. Run it.
-- 5. Confirm the tables appear under Database > Tables.
--
-- This schema supports only the React test app at /stashbox/radio/react/.
-- The production /stashbox/radio/ page remains unchanged.

create extension if not exists pgcrypto;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  artist text,
  album text,
  genre text,
  audio_url text,
  artwork_url text,
  video_url text,
  description text,
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  product_url text,
  price text,
  collection text,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.song_products (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  priority integer default 0,
  created_at timestamptz default now()
);

create index if not exists songs_is_active_idx on public.songs (is_active);
create index if not exists songs_genre_idx on public.songs (genre);
create index if not exists songs_sort_order_idx on public.songs (sort_order);
create index if not exists products_is_active_idx on public.products (is_active);
create index if not exists song_products_song_id_idx on public.song_products (song_id);
create index if not exists song_products_product_id_idx on public.song_products (product_id);

alter table public.songs enable row level security;
alter table public.products enable row level security;
alter table public.song_products enable row level security;

drop policy if exists "Public can read active songs" on public.songs;
create policy "Public can read active songs"
  on public.songs
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Public can read active products" on public.products;
create policy "Public can read active products"
  on public.products
  for select
  to anon, authenticated
  using (is_active = true);

drop policy if exists "Public can read song products" on public.song_products;
create policy "Public can read song products"
  on public.song_products
  for select
  to anon, authenticated
  using (true);

-- Sample test rows for confirming the React app can read from Supabase.
-- Replace the placeholder URLs with real public audio and artwork URLs before launch.
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
