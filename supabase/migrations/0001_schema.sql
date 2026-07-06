-- FinePrint schema on Postgres. A faithful port of spacetimedb/src/schema.ts.
--
-- Type shifts from the SpacetimeDB module:
--   t.identity (the Clerk user)  -> owner text        (the Clerk JWT `sub`)
--   t.u64 primaryKey autoInc     -> bigint generated always as identity
--   t.timestamp                  -> timestamptz
--   t.option(...)                -> nullable column
--   JSON-string columns          -> jsonb (Postgres-native; the new data layer
--                                   reads objects directly instead of re-parsing)
--
-- What disappears: the worker/reaperTick tables and the whole lease-and-reap
-- mechanism (register_worker, heartbeat, claim_task, reap, kill_worker,
-- prune_dead_workers). Trigger.dev owns run concurrency, retries, and stall
-- recovery now, so `fleetScope` (only ever there for the worker RLS join) and
-- `claimedBy` (the lease) are gone too. A task instead carries the id of the
-- Trigger.dev run working it.

create table public.buildings (
  id bigint generated always as identity primary key,
  owner text not null,
  address text not null,
  bbl text,
  -- NYC Building Identification Number — the second stable cross-reference id.
  bin text,
  sqft integer not null,
  is_affordable boolean not null,
  annual_emissions_tco2e double precision,
  uses_json jsonb,
  ll97_covered boolean,
  provenance_json jsonb,
  num_floors integer,
  units_residential integer,
  community_district integer,
  energy_star_score integer,
  compliance_plan_json jsonb,
  created_at timestamptz not null default now()
);
create index buildings_owner_idx on public.buildings (owner);
create index buildings_bbl_idx on public.buildings (owner, bbl);

-- task status: open | running | in_review | approved | rejected | done | failed
--   open      created, awaiting dispatch
--   running   a Trigger.dev run is drafting it (replaces the old "claimed" lease)
--   in_review draft submitted, waiting on a human
--   approved / rejected / done as before
--   failed    the run exhausted its retries (no equivalent under the old reaper)
create table public.tasks (
  id bigint generated always as identity primary key,
  owner text not null,
  building_id bigint references public.buildings (id) on delete cascade,
  law_id text not null,
  kind text not null,
  title text not null,
  status text not null default 'open',
  deadline timestamptz not null,
  sla_breached boolean not null default false,
  fine_estimate_usd integer,
  -- Intake tasks (kind 'building_intake') carry the address to resolve;
  -- building_id stays null until an approval ingests the building.
  intake_address text,
  -- The Trigger.dev run currently working this task, for the agents view and
  -- for idempotent dispatch. Null when open or finished.
  trigger_run_id text,
  created_at timestamptz not null default now()
);
create index tasks_owner_idx on public.tasks (owner);
create index tasks_building_idx on public.tasks (building_id);
create index tasks_status_idx on public.tasks (status);

-- Race-safe version of request_building's "already in the queue" guard: at most
-- one live intake per (owner, address). A second concurrent submit hits a unique
-- violation instead of slipping past a check-then-insert. The row leaves the
-- index once the intake reaches a terminal status, so a later re-request is fine.
create unique index tasks_active_intake_uniq
  on public.tasks (owner, intake_address)
  where kind = 'building_intake' and status in ('open', 'running', 'in_review');

create table public.submissions (
  id bigint generated always as identity primary key,
  owner text not null,
  task_id bigint not null references public.tasks (id) on delete cascade,
  -- The agent that produced this draft, for display (replaces worker_id).
  agent_name text not null default '',
  body text not null,
  -- Intake submissions carry the ready-to-ingest building args; approval
  -- replays them through the shared ingest path. Null on ordinary drafts.
  payload_json jsonb,
  submitted_at timestamptz not null default now()
);
create index submissions_owner_idx on public.submissions (owner);
create index submissions_task_idx on public.submissions (task_id);

create table public.approvals (
  id bigint generated always as identity primary key,
  owner text not null,
  task_id bigint not null references public.tasks (id) on delete cascade,
  approved_by text not null,
  verdict text not null,
  note text not null default '',
  at timestamptz not null default now()
);
create index approvals_owner_idx on public.approvals (owner);
create index approvals_task_idx on public.approvals (task_id);

-- One row per account. reviewMode 'manual' means every draft waits for a human;
-- 'auto' approves obligation drafts on submit — intakes always wait either way.
-- A missing row reads as manual.
create table public.settings (
  owner text primary key,
  review_mode text not null default 'manual' check (review_mode in ('manual', 'auto'))
);

-- Append-only audit log. Every write path appends one row (see log_event()).
create table public.events (
  id bigint generated always as identity primary key,
  owner text not null,
  kind text not null,
  task_id bigint,
  payload text not null default '',
  at timestamptz not null default now()
);
create index events_owner_idx on public.events (owner);
create index events_at_idx on public.events (owner, at desc);

-- --- Compliance binder (customer-facing) -----------------------------------

create table public.vendors (
  id bigint generated always as identity primary key,
  owner text not null,
  name text not null,
  company text not null default '',
  role_type text not null,
  email text not null default '',
  phone text not null default '',
  license_number text not null default '',
  license_type text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index vendors_owner_idx on public.vendors (owner);

create table public.obligations (
  id bigint generated always as identity primary key,
  owner text not null,
  building_id bigint not null references public.buildings (id) on delete cascade,
  law_id text not null,
  title text not null,
  status text not null default 'not_started',
  due_date timestamptz,
  responsible_party text not null default '',
  vendor_id bigint references public.vendors (id) on delete set null,
  filing_reference_number text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index obligations_owner_idx on public.obligations (owner);
create index obligations_building_idx on public.obligations (building_id);

create table public.evidence (
  id bigint generated always as identity primary key,
  owner text not null,
  obligation_id bigint not null references public.obligations (id) on delete cascade,
  building_id bigint not null references public.buildings (id) on delete cascade,
  law_id text not null,
  file_name text not null,
  file_type text not null default '',
  -- Object key in the Supabase Storage 'evidence' bucket (replaces the old
  -- fileUrlOrKey column, which held an arbitrary URL or key).
  storage_path text not null default '',
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now(),
  document_date timestamptz,
  expiration_date timestamptz,
  issuer text not null default '',
  vendor_id bigint references public.vendors (id) on delete set null,
  filing_reference_number text not null default '',
  verification_status text not null default 'unreviewed',
  notes text not null default ''
);
create index evidence_owner_idx on public.evidence (owner);
create index evidence_obligation_idx on public.evidence (obligation_id);

create table public.binder_events (
  id bigint generated always as identity primary key,
  owner text not null,
  building_id bigint not null references public.buildings (id) on delete cascade,
  obligation_id bigint,
  law_id text not null,
  kind text not null,
  summary text not null,
  at timestamptz not null default now()
);
create index binder_events_owner_idx on public.binder_events (owner);
create index binder_events_building_idx on public.binder_events (building_id);
