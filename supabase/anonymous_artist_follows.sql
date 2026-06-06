create table if not exists public.anonymous_artist_follows (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id text not null,
  artist_id text default '',
  external_id text default '',
  name text not null,
  image_url text default '',
  genres text[] default '{}',
  source text default 'manual',
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists anonymous_artist_follows_user_artist_unique
on public.anonymous_artist_follows (anonymous_user_id, artist_id);

drop index if exists anonymous_artist_follows_user_external_unique;
create unique index anonymous_artist_follows_user_external_unique
on public.anonymous_artist_follows (anonymous_user_id, external_id)
where external_id <> '';

create index if not exists anonymous_artist_follows_user_enabled_idx
on public.anonymous_artist_follows (anonymous_user_id, enabled, updated_at desc);

alter table public.anonymous_artist_follows enable row level security;

drop policy if exists "anon can select own artist follows" on public.anonymous_artist_follows;
create policy "anon can select own artist follows"
on public.anonymous_artist_follows
for select
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can insert own artist follows" on public.anonymous_artist_follows;
create policy "anon can insert own artist follows"
on public.anonymous_artist_follows
for insert
to anon
with check (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can update own artist follows" on public.anonymous_artist_follows;
create policy "anon can update own artist follows"
on public.anonymous_artist_follows
for update
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'))
with check (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can delete own artist follows" on public.anonymous_artist_follows;
create policy "anon can delete own artist follows"
on public.anonymous_artist_follows
for delete
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

grant select, insert, update, delete on public.anonymous_artist_follows to anon;
