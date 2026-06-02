-- Supabase song-like setup for /stashbox/radio/react/ only.
-- Run this before enabling song likes in the React radio preview.
-- The production /stashbox/radio/ page remains unchanged.

create extension if not exists pgcrypto;

create table if not exists public.song_likes (
  id uuid primary key default gen_random_uuid(),
  song_id uuid references public.songs(id) on delete cascade,
  session_id text not null,
  created_at timestamptz default now()
);

create index if not exists song_likes_song_id_idx on public.song_likes (song_id);
create index if not exists song_likes_session_id_idx on public.song_likes (session_id);
create unique index if not exists song_likes_song_id_session_id_uidx
  on public.song_likes (song_id, session_id);

alter table public.song_likes enable row level security;

revoke update, delete on public.song_likes from anon, authenticated;
grant select, insert on public.song_likes to anon, authenticated;

drop policy if exists "Anon can read song likes" on public.song_likes;
create policy "Anon can read song likes"
  on public.song_likes
  for select
  to anon
  using (true);

drop policy if exists "Anon can insert song likes" on public.song_likes;
create policy "Anon can insert song likes"
  on public.song_likes
  for insert
  to anon
  with check (song_id is not null and session_id <> '');

create or replace view public.song_like_counts as
select
  song_id,
  count(*)::bigint as like_count
from public.song_likes
group by song_id;

grant select on public.song_like_counts to anon, authenticated;
