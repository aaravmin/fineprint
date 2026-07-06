-- Feature C: owner-uploaded records that adjust the model, and inspection-driven
-- "act-by" deadlines. Three tables, all keyed to a building and (where relevant)
-- a SystemKey so they line up with the retrofit category taxonomy.
--
--   user_records      - metadata for a file the owner uploaded (blueprint,
--                       inspection report, spec sheet, utility bill). The file
--                       itself lives in the existing `evidence` storage bucket
--                       under <owner>/records/<building_id>/... (owner-prefix RLS
--                       already covers it). Owner full-CRUD.
--   building_overrides - the owner's corrections to the systems dossier, one row
--                       per building, jsonb keyed by system/field. Owner full-CRUD.
--   system_deadlines  - derived per-system inspection/cert deadlines computed at
--                       intake. Owner-read, service-write (a derived artifact,
--                       same shape as buildings/tasks).

create table public.user_records (
  id bigint generated always as identity primary key,
  owner text not null,
  building_id bigint not null references public.buildings (id) on delete cascade,
  system_key text,             -- one of the 8 SystemKeys, or null for a building-level record
  record_type text not null,   -- blueprint | inspection_report | spec_sheet | utility_bill | other
  file_name text not null,
  file_type text not null default '',
  storage_path text not null,  -- evidence-bucket object key
  notes text not null default '',
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now()
);
create index user_records_owner_idx on public.user_records (owner);
create index user_records_building_idx on public.user_records (building_id);

create table public.building_overrides (
  building_id bigint primary key references public.buildings (id) on delete cascade,
  owner text not null,
  -- { [systemKey]: { [field]: { value, recordId?, enteredAt? } } } — see data/src/overrides.ts
  data jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index building_overrides_owner_idx on public.building_overrides (owner);

create table public.system_deadlines (
  id bigint generated always as identity primary key,
  owner text not null,
  building_id bigint not null references public.buildings (id) on delete cascade,
  system_key text not null,    -- one of the 8 SystemKeys
  kind text not null,          -- boiler_inspection | cats_cert_expiry | elevator_cat1 | elevator_periodic
  title text not null,
  due_date timestamptz not null,   -- the inspection/cert date the work should precede
  act_by_date timestamptz not null, -- due_date minus a per-kind lead time
  basis text not null default '',
  source_dataset text not null default '',
  source_record_id text not null default '',
  status text not null default 'upcoming', -- upcoming | act_soon | overdue
  created_at timestamptz not null default now(),
  unique (building_id, system_key, kind)
);
create index system_deadlines_owner_idx on public.system_deadlines (owner);
create index system_deadlines_building_idx on public.system_deadlines (building_id);
create index system_deadlines_actby_idx on public.system_deadlines (owner, act_by_date);

-- RLS: owner-owned records (user_records, building_overrides) get full CRUD; the
-- derived system_deadlines are owner-read, service-write. Mirrors 0002_rls.sql.

alter table public.user_records enable row level security;
alter table public.building_overrides enable row level security;
alter table public.system_deadlines enable row level security;

do $$
declare
  tbl text;
  crud_tables text[] := array['user_records', 'building_overrides'];
begin
  foreach tbl in array crud_tables loop
    execute format('create policy %I on public.%I for select using (owner = public.requesting_owner())', tbl || '_select_own', tbl);
    execute format('create policy %I on public.%I for insert with check (owner = public.requesting_owner())', tbl || '_insert_own', tbl);
    execute format('create policy %I on public.%I for update using (owner = public.requesting_owner()) with check (owner = public.requesting_owner())', tbl || '_update_own', tbl);
    execute format('create policy %I on public.%I for delete using (owner = public.requesting_owner())', tbl || '_delete_own', tbl);
  end loop;
end
$$;

create policy system_deadlines_select_own on public.system_deadlines
  for select using (owner = public.requesting_owner());

grant select, insert, update, delete on public.user_records, public.building_overrides to authenticated;
grant select on public.system_deadlines to authenticated;
grant all on public.user_records, public.building_overrides, public.system_deadlines to service_role;

-- Realtime, so the dashboard picks up new records/overrides/deadlines live.
alter table public.user_records replica identity full;
alter table public.building_overrides replica identity full;
alter table public.system_deadlines replica identity full;
alter publication supabase_realtime add table public.user_records;
alter publication supabase_realtime add table public.building_overrides;
alter publication supabase_realtime add table public.system_deadlines;
