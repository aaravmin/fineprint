-- Feature B: per-owner category tracking. Every building's work is bucketed into
-- a retrofit category (lighting, heating, ... from engine/src/categories.ts) plus
-- one always-on statutory bucket, 'compliance', for LL97/Article 321 filings. An
-- owner can opt out of any retrofit category they don't want to track; compliance
-- is never toggleable.
--
--   tasks.category        - which bucket a task belongs to. Defaults to
--                           'compliance' because every task the app spawns today
--                           is a statutory obligation (the law tickets from
--                           ingest_building, the intake task).
--   settings.primary_address - the address an owner onboarded with, so the
--                           dashboard can lead with their building.
--   category_preferences  - one row per (owner, category) an owner has toggled.
--                           Opt-out: no row means the category is tracked. Owner
--                           full-CRUD. Mirrors 0006's owner-owned tables.

alter table public.tasks add column if not exists category text not null default 'compliance';

alter table public.settings add column if not exists primary_address text;

create table public.category_preferences (
  id bigint generated always as identity primary key,
  owner text not null,
  category text not null,   -- 'compliance' or one of the enabled RetrofitCategories
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (owner, category)
);
create index category_preferences_owner_idx on public.category_preferences (owner);

-- RLS: owner-owned, full CRUD. Mirrors 0002_rls.sql / 0006_records_deadlines.sql.

alter table public.category_preferences enable row level security;

create policy category_preferences_select_own on public.category_preferences
  for select using (owner = public.requesting_owner());
create policy category_preferences_insert_own on public.category_preferences
  for insert with check (owner = public.requesting_owner());
create policy category_preferences_update_own on public.category_preferences
  for update using (owner = public.requesting_owner()) with check (owner = public.requesting_owner());
create policy category_preferences_delete_own on public.category_preferences
  for delete using (owner = public.requesting_owner());

grant select, insert, update, delete on public.category_preferences to authenticated;
grant all on public.category_preferences to service_role;

-- Realtime, so a toggle flips the dashboard live.
alter table public.category_preferences replica identity full;
alter publication supabase_realtime add table public.category_preferences;
