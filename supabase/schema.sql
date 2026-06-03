create extension if not exists pgcrypto;

create table if not exists public.artists (
  id uuid primary key default gen_random_uuid(),
  external_id text,
  name text not null,
  image_url text default '',
  genres text[] default '{}',
  source text default 'manual',
  created_at timestamptz default now()
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid references public.artists(id) on delete cascade,
  artist_name text not null,
  type text not null,
  title text not null,
  description text default '',
  image_url text default '',
  date date not null,
  start_time text default '',
  location text default '',
  source_url text default '',
  created_at timestamptz default now(),
  constraint news_items_type_check check (type in ('concert', 'album', 'ticket', 'festival'))
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references public.news_items(id) on delete cascade,
  anonymous_user_id text not null,
  title text not null,
  date date not null,
  time text default '',
  location text default '',
  artist_name text not null,
  type text not null,
  created_at timestamptz default now(),
  constraint calendar_events_type_check check (type in ('concert', 'album', 'ticket', 'festival')),
  constraint calendar_events_user_news_unique unique (anonymous_user_id, news_id)
);

create table if not exists public.hidden_news (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references public.news_items(id) on delete cascade,
  anonymous_user_id text not null,
  created_at timestamptz default now(),
  constraint hidden_news_user_news_unique unique (anonymous_user_id, news_id)
);

create index if not exists artists_name_idx on public.artists using btree (name);
create unique index if not exists artists_source_external_id_unique
on public.artists (source, external_id)
where external_id is not null;
create index if not exists news_items_artist_created_idx on public.news_items (artist_id, created_at desc);
create index if not exists news_items_date_idx on public.news_items (date);
create index if not exists calendar_events_user_date_idx on public.calendar_events (anonymous_user_id, date);
create index if not exists hidden_news_user_idx on public.hidden_news (anonymous_user_id);

create or replace function public.goyo_request_header(header_name text)
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> lower(header_name),
    ''
  );
$$;

alter table public.artists enable row level security;
alter table public.news_items enable row level security;
alter table public.calendar_events enable row level security;
alter table public.hidden_news enable row level security;

drop policy if exists "anon can select artists" on public.artists;
create policy "anon can select artists"
on public.artists
for select
to anon
using (true);

drop policy if exists "anon can insert spotify artists" on public.artists;
create policy "anon can insert spotify artists"
on public.artists
for insert
to anon
with check (source = 'spotify');

drop policy if exists "anon can select news items" on public.news_items;
create policy "anon can select news items"
on public.news_items
for select
to anon
using (true);

drop policy if exists "anon can select own calendar events" on public.calendar_events;
create policy "anon can select own calendar events"
on public.calendar_events
for select
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can insert own calendar events" on public.calendar_events;
create policy "anon can insert own calendar events"
on public.calendar_events
for insert
to anon
with check (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can delete own calendar events" on public.calendar_events;
create policy "anon can delete own calendar events"
on public.calendar_events
for delete
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can select own hidden news" on public.hidden_news;
create policy "anon can select own hidden news"
on public.hidden_news
for select
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can insert own hidden news" on public.hidden_news;
create policy "anon can insert own hidden news"
on public.hidden_news
for insert
to anon
with check (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can delete own hidden news" on public.hidden_news;
create policy "anon can delete own hidden news"
on public.hidden_news
for delete
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

grant usage on schema public to anon;
grant select, insert on public.artists to anon;
grant select on public.news_items to anon;
grant select, insert, delete on public.calendar_events to anon;
grant select, insert, delete on public.hidden_news to anon;
