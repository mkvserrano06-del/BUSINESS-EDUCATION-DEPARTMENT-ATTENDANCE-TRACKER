create table if not exists public.app_state_snapshots (
  id text primary key,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state_snapshots enable row level security;

drop policy if exists "app state public read" on public.app_state_snapshots;
drop policy if exists "app state public write" on public.app_state_snapshots;

create policy "app state public read"
on public.app_state_snapshots
for select
to anon, authenticated
using (id = 'business-ed-event-attendance');

create policy "app state public write"
on public.app_state_snapshots
for all
to anon, authenticated
using (id = 'business-ed-event-attendance')
with check (id = 'business-ed-event-attendance');

insert into public.app_state_snapshots (id, state)
values ('business-ed-event-attendance', '{}'::jsonb)
on conflict (id) do nothing;
