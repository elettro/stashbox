-- Supabase engagement-event setup for /stashbox/radio/react/ only.
-- Run after radio/react/song-likes-schema.sql when likes are confirmed.
-- The production /stashbox/radio/ page remains unchanged.

create extension if not exists pgcrypto;

create table if not exists public.song_play_events (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade,
  session_id text not null,
  event_type text not null,
  source_page text default '/stashbox/radio/react/',
  created_at timestamptz default now(),
  constraint song_play_events_event_type_check check (
    event_type in ('play', 'pause', 'skip', 'complete', 'next_click', 'random_click', 'video_open')
  )
);

create table if not exists public.product_click_events (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  session_id text not null,
  product_url text,
  source_page text default '/stashbox/radio/react/',
  created_at timestamptz default now()
);

create index if not exists song_play_events_song_id_idx on public.song_play_events (song_id);
create index if not exists song_play_events_session_id_idx on public.song_play_events (session_id);
create index if not exists song_play_events_event_type_idx on public.song_play_events (event_type);
create index if not exists song_play_events_created_at_idx on public.song_play_events (created_at);
create index if not exists product_click_events_song_id_idx on public.product_click_events (song_id);
create index if not exists product_click_events_product_id_idx on public.product_click_events (product_id);
create index if not exists product_click_events_session_id_idx on public.product_click_events (session_id);
create index if not exists product_click_events_created_at_idx on public.product_click_events (created_at);

alter table public.song_play_events enable row level security;
alter table public.product_click_events enable row level security;

revoke update, delete on public.song_play_events from anon, authenticated;
revoke update, delete on public.product_click_events from anon, authenticated;
grant insert on public.song_play_events to anon, authenticated;
grant insert on public.product_click_events to anon, authenticated;

drop policy if exists "Anon can insert song play events" on public.song_play_events;
create policy "Anon can insert song play events"
  on public.song_play_events
  for insert
  to anon
  with check (
    song_id is not null
    and session_id <> ''
    and event_type in ('play', 'pause', 'skip', 'complete', 'next_click', 'random_click', 'video_open')
    and source_page = '/stashbox/radio/react/'
  );

drop policy if exists "Anon can insert product click events" on public.product_click_events;
create policy "Anon can insert product click events"
  on public.product_click_events
  for insert
  to anon
  with check (
    session_id <> ''
    and coalesce(source_page, '/stashbox/radio/react/') = '/stashbox/radio/react/'
  );

-- Dashboard-ready aggregated views intentionally omit session_id.
create or replace view public.song_like_counts as
select
  song_id,
  count(*)::bigint as like_count
from public.song_likes
group by song_id;

create or replace view public.song_event_counts as
select
  song_id,
  event_type,
  count(*)::bigint as event_count
from public.song_play_events
group by song_id, event_type;

create or replace view public.top_songs_by_plays as
select
  songs.id as song_id,
  songs.title,
  count(song_play_events.id)::bigint as play_count
from public.songs
left join public.song_play_events
  on song_play_events.song_id = songs.id
  and song_play_events.event_type = 'play'
group by songs.id, songs.title
order by play_count desc, songs.title asc;

create or replace view public.top_songs_by_likes as
select
  songs.id as song_id,
  songs.title,
  count(song_likes.id)::bigint as like_count
from public.songs
left join public.song_likes
  on song_likes.song_id = songs.id
group by songs.id, songs.title
order by like_count desc, songs.title asc;

grant select on public.song_like_counts to anon, authenticated;
grant select on public.song_event_counts to anon, authenticated;
grant select on public.top_songs_by_plays to anon, authenticated;
grant select on public.top_songs_by_likes to anon, authenticated;
