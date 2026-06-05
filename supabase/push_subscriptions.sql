create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  anonymous_user_id text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text default '',
  enabled boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint push_subscriptions_endpoint_unique unique (endpoint)
);

create index if not exists push_subscriptions_user_idx
on public.push_subscriptions (anonymous_user_id);

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

create or replace function public.set_push_subscriptions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_push_subscriptions_updated_at on public.push_subscriptions;
create trigger set_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row
execute function public.set_push_subscriptions_updated_at();

alter table public.push_subscriptions enable row level security;

drop policy if exists "anon can select own push subscriptions" on public.push_subscriptions;
create policy "anon can select own push subscriptions"
on public.push_subscriptions
for select
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can insert own push subscriptions" on public.push_subscriptions;
create policy "anon can insert own push subscriptions"
on public.push_subscriptions
for insert
to anon
with check (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can update own push subscriptions" on public.push_subscriptions;
create policy "anon can update own push subscriptions"
on public.push_subscriptions
for update
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'))
with check (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

drop policy if exists "anon can delete own push subscriptions" on public.push_subscriptions;
create policy "anon can delete own push subscriptions"
on public.push_subscriptions
for delete
to anon
using (anonymous_user_id = public.goyo_request_header('x-goyo-anonymous-id'));

grant usage on schema public to anon;
grant select, insert, update, delete on public.push_subscriptions to anon;
