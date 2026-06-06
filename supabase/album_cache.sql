create table if not exists public.album_cache (
  artist_id text not null,
  album_id text not null,
  album_name text default '',
  release_date date not null,
  image_url text default '',
  cached_at timestamptz default now(),
  constraint album_cache_artist_album_unique unique (artist_id, album_id)
);

create index if not exists album_cache_artist_cached_idx
on public.album_cache (artist_id, cached_at desc);

create index if not exists album_cache_release_date_idx
on public.album_cache (release_date desc);

alter table public.album_cache enable row level security;

drop policy if exists "anon can select album cache" on public.album_cache;
create policy "anon can select album cache"
on public.album_cache
for select
to anon
using (true);

grant select on public.album_cache to anon;

create table if not exists public.artist_album_cache_status (
  artist_id text primary key,
  album_count integer default 0,
  checked_at timestamptz default now()
);

create index if not exists artist_album_cache_status_checked_idx
on public.artist_album_cache_status (checked_at desc);

alter table public.artist_album_cache_status enable row level security;

drop policy if exists "anon can select artist album cache status" on public.artist_album_cache_status;
create policy "anon can select artist album cache status"
on public.artist_album_cache_status
for select
to anon
using (true);

grant select on public.artist_album_cache_status to anon;

create table if not exists public.spotify_rate_limits (
  provider text primary key default 'spotify',
  retry_after_seconds integer default 0,
  retry_after_until timestamptz,
  last_status integer default 429,
  last_body jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);

alter table public.spotify_rate_limits enable row level security;

drop policy if exists "anon can select spotify rate limits" on public.spotify_rate_limits;
create policy "anon can select spotify rate limits"
on public.spotify_rate_limits
for select
to anon
using (true);

grant select on public.spotify_rate_limits to anon;
