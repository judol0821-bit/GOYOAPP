create extension if not exists pgcrypto;

create table if not exists public.notified_news (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id text not null,
  news_id text not null,
  news_title text default '',
  artist_name text default '',
  type text default '',
  notified_at timestamptz default now(),
  constraint notified_news_anonymous_user_news_unique unique (anonymous_user_id, news_id)
);

create index if not exists notified_news_anonymous_user_id_idx
  on public.notified_news (anonymous_user_id, notified_at desc);

alter table public.notified_news enable row level security;

drop policy if exists "notified_news_select_own" on public.notified_news;
drop policy if exists "notified_news_insert_own" on public.notified_news;
drop policy if exists "notified_news_delete_own" on public.notified_news;

create policy "notified_news_select_own"
  on public.notified_news
  for select
  to anon
  using (anonymous_user_id = current_setting('request.headers', true)::json->>'x-goyo-anonymous-id');

create policy "notified_news_insert_own"
  on public.notified_news
  for insert
  to anon
  with check (anonymous_user_id = current_setting('request.headers', true)::json->>'x-goyo-anonymous-id');

create policy "notified_news_delete_own"
  on public.notified_news
  for delete
  to anon
  using (anonymous_user_id = current_setting('request.headers', true)::json->>'x-goyo-anonymous-id');

grant select, insert, delete on public.notified_news to anon;
