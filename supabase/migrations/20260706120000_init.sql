-- fineprint schema: the entire backend as one Postgres migration.
--
-- This replaces the SpacetimeDB module. The shape is the same on purpose:
-- clients never write tables directly — every mutation goes through a
-- SECURITY DEFINER function (the old "reducers"), each function appends an
-- event row, and claim_task stays an atomic check-then-set. Live reads reach
-- the dashboard through Supabase Realtime instead of table subscriptions.
--
-- Identity model:
--   * Humans sign in with Clerk. Supabase third-party auth validates the
--     Clerk JWT, so `auth.jwt()->>'sub'` is the Clerk user id. That string is
--     the `owner` column everywhere — same login, same data, any machine.
--   * Agent workers and scripts connect with the service-role key. Service
--     role bypasses RLS (the old "workers see every row" rule) and is the
--     only caller allowed on the fleet functions (register/claim/submit/...).
--   * Functions that sign off work (approve, reject, mark_done) refuse the
--     service role: a human approves, never an agent. Same guarantee the
--     module enforced with its worker-identity check.

-- Statuses are plain strings validated by CHECK constraints and functions:
-- task:   open | claimed | in_review | approved | rejected | done
-- worker: idle | working | dead

create extension if not exists pg_cron;

-- --- identity helpers -------------------------------------------------------

create or replace function fp_owner()
returns text
language sql stable
as $$
  select nullif(coalesce(auth.jwt()->>'sub', ''), '');
$$;

-- Fleet processes carry the service-role key (JWT role claim); pg_cron and a
-- direct psql/CLI session run with no PostgREST request JWT at all. Both count
-- as "the trusted side of the house".
--
-- We test for an absent request JWT, NOT current_user: inside a SECURITY DEFINER
-- function current_user is the function's owner (the role that ran the migration),
-- so a current_user check would treat every caller — humans included — as service
-- and silently disable fp_require_human(). Do not reintroduce a current_user test.
create or replace function fp_is_service()
returns boolean
language sql stable
as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role'
      or coalesce(current_setting('request.jwt.claims', true), '') = '';
$$;

-- A human caller: authenticated through Clerk, not a fleet process.
create or replace function fp_require_human()
returns text
language plpgsql stable
as $$
declare
  caller text := fp_owner();
begin
  if fp_is_service() then
    raise exception 'workers cannot do this — a human signs off';
  end if;
  if caller is null then
    raise exception 'sign in first';
  end if;
  return caller;
end;
$$;

create or replace function fp_require_service()
returns void
language plpgsql stable
as $$
begin
  if not fp_is_service() then
    raise exception 'only fleet workers may call this';
  end if;
end;
$$;

-- --- tables ------------------------------------------------------------------

create table building (
  id bigint generated always as identity primary key,
  owner text not null,
  address text not null,
  bbl text,
  -- NYC Building Identification Number — the second stable identifier (with
  -- BBL) that lets an external system cross-reference DOB/PLUTO/BEAM records.
  bin text,
  -- 0 means the city data never resolved a floor area (manual entry always
  -- validates > 0 in add_building).
  sqft integer not null check (sqft >= 0),
  is_affordable boolean not null,
  -- Real-data fields, filled by ingest from NYC public datasets. The *_json
  -- columns are opaque blobs in the data layer's vocabulary (ESPM use splits,
  -- per-field provenance, the serialized compliance plan) — stored as text and
  -- passed through, exactly as the module did.
  annual_emissions_tco2e double precision,
  uses_json text,
  ll97_covered boolean,
  provenance_json text,
  num_floors integer,
  units_residential integer,
  community_district integer,
  energy_star_score integer,
  compliance_plan_json text,
  created_at timestamptz not null default now()
);

create index building_owner_idx on building (owner);
-- One building per (owner, BBL): the dedup the module did with a scan, now a
-- real constraint. Heuristic buildings (add_building) have no BBL yet.
create unique index building_owner_bbl_idx on building (owner, bbl) where bbl is not null;

create table task (
  id bigint generated always as identity primary key,
  owner text not null,
  -- NULL while a building_intake is still resolving; set on ingest.
  building_id bigint references building (id),
  law_id text not null,
  kind text not null,
  title text not null,
  status text not null default 'open'
    check (status in ('open', 'claimed', 'in_review', 'approved', 'rejected', 'done')),
  deadline timestamptz not null,
  sla_breached boolean not null default false,
  fine_estimate_usd integer,
  claimed_by bigint,
  intake_address text,
  created_at timestamptz not null default now()
);

create index task_owner_idx on task (owner);
create index task_building_idx on task (building_id);
create index task_status_idx on task (status);

create table worker (
  id bigint generated always as identity primary key,
  name text not null,
  status text not null default 'idle' check (status in ('idle', 'working', 'dead')),
  last_heartbeat timestamptz not null default now(),
  current_task_id bigint
);

create table submission (
  id bigint generated always as identity primary key,
  owner text not null,
  task_id bigint not null references task (id),
  worker_id bigint not null,
  body text not null,
  -- Intake submissions carry the ready-to-ingest building payload as JSON;
  -- approval replays it through the shared ingest path. Absent on ordinary
  -- drafts.
  payload_json text,
  submitted_at timestamptz not null default now()
);

create index submission_owner_idx on submission (owner);
create index submission_task_idx on submission (task_id);

create table approval (
  id bigint generated always as identity primary key,
  owner text not null,
  task_id bigint not null references task (id),
  approved_by text not null,
  verdict text not null check (verdict in ('approved', 'rejected')),
  note text not null,
  at timestamptz not null default now()
);

create index approval_owner_idx on approval (owner);
create index approval_task_idx on approval (task_id);

-- One row per account: that account's switches. reviewMode "manual" means
-- every draft waits for a human; "auto" approves obligation drafts on
-- submit — building intakes always wait either way. A missing row reads as
-- manual.
create table settings (
  owner text primary key,
  review_mode text not null check (review_mode in ('manual', 'auto'))
);

-- Append-only audit log. Every function writes one row — except heartbeat,
-- which used to flood ~17k rows/day/worker into everyone's activity feed.
-- Fleet-level events (registrations, reaps) carry owner 'fleet' and stay off
-- the customer feeds.
create table event (
  id bigint generated always as identity primary key,
  owner text not null,
  kind text not null,
  task_id bigint,
  worker_id bigint,
  payload text not null,
  at timestamptz not null default now()
);

create index event_owner_at_idx on event (owner, at desc);
create index event_at_idx on event (at);

-- --- compliance binder (customer-facing) ------------------------------------
-- The owner's organized, exportable compliance record: an obligation per law,
-- the proof filed against each, the vendor responsible, and a plain-language
-- history. Deliberately separate from the internal `event` audit log.

create table vendor (
  id bigint generated always as identity primary key,
  owner text not null,
  name text not null,
  company text not null default '',
  role_type text not null check (role_type in (
    'QEWI', 'LMP', 'energy_auditor', 'retro_commissioning_agent', 'contractor',
    'engineer', 'architect', 'expeditor', 'property_manager', 'elevator_vendor',
    'sprinkler_vendor', 'general_vendor', 'other'
  )),
  email text not null default '',
  phone text not null default '',
  license_number text not null default '',
  license_type text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index vendor_owner_idx on vendor (owner);

create table obligation (
  id bigint generated always as identity primary key,
  owner text not null,
  building_id bigint not null references building (id),
  law_id text not null,
  title text not null,
  status text not null default 'not_started' check (status in (
    'not_started', 'in_progress', 'submitted', 'filed', 'completed',
    'overdue', 'blocked', 'not_applicable', 'missing_data'
  )),
  due_date timestamptz,
  responsible_party text not null default '',
  vendor_id bigint references vendor (id),
  filing_reference_number text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index obligation_owner_idx on obligation (owner);
create index obligation_building_idx on obligation (building_id);

create table evidence (
  id bigint generated always as identity primary key,
  owner text not null,
  obligation_id bigint not null references obligation (id),
  building_id bigint not null references building (id),
  law_id text not null,
  file_name text not null,
  file_type text not null default '',
  file_url_or_key text not null default '',
  uploaded_by text not null default '',
  uploaded_at timestamptz not null default now(),
  document_date timestamptz,
  expiration_date timestamptz,
  issuer text not null default '',
  vendor_id bigint references vendor (id),
  filing_reference_number text not null default '',
  verification_status text not null default 'unreviewed' check (verification_status in (
    'unreviewed', 'accepted', 'needs_review', 'rejected', 'expired', 'missing'
  )),
  notes text not null default ''
);

create index evidence_owner_idx on evidence (owner);
create index evidence_obligation_idx on evidence (obligation_id);

create table binder_event (
  id bigint generated always as identity primary key,
  owner text not null,
  building_id bigint not null references building (id),
  obligation_id bigint,
  law_id text not null,
  kind text not null,
  summary text not null,
  at timestamptz not null default now()
);

create index binder_event_owner_idx on binder_event (owner);
create index binder_event_building_idx on binder_event (building_id);

-- --- row-level security ------------------------------------------------------
-- Each account sees its own rows. The worker table stays open to signed-in
-- users — the agents page shows the fleet to everyone. Fleet processes use
-- the service-role key, which bypasses RLS entirely (the old worker views).
-- Writes never go through the tables: no insert/update/delete policies exist,
-- so the definer functions below are the only write path.

alter table building enable row level security;
alter table task enable row level security;
alter table worker enable row level security;
alter table submission enable row level security;
alter table approval enable row level security;
alter table settings enable row level security;
alter table event enable row level security;
alter table vendor enable row level security;
alter table obligation enable row level security;
alter table evidence enable row level security;
alter table binder_event enable row level security;

create policy building_owner_read on building for select to authenticated
  using (owner = (select fp_owner()));
create policy task_owner_read on task for select to authenticated
  using (owner = (select fp_owner()));
create policy worker_fleet_read on worker for select to authenticated
  using (
    current_task_id is not null
    and exists (
      select 1 from task
      where task.id = worker.current_task_id
        and task.owner = (select fp_owner())
    )
  );
create policy submission_owner_read on submission for select to authenticated
  using (owner = (select fp_owner()));
create policy approval_owner_read on approval for select to authenticated
  using (owner = (select fp_owner()));
create policy settings_owner_read on settings for select to authenticated
  using (owner = (select fp_owner()));
create policy event_owner_read on event for select to authenticated
  using (owner = (select fp_owner()));
create policy vendor_owner_read on vendor for select to authenticated
  using (owner = (select fp_owner()));
create policy obligation_owner_read on obligation for select to authenticated
  using (owner = (select fp_owner()));
create policy evidence_owner_read on evidence for select to authenticated
  using (owner = (select fp_owner()));
create policy binder_event_owner_read on binder_event for select to authenticated
  using (owner = (select fp_owner()));

-- --- shared plumbing ---------------------------------------------------------

create or replace function fp_log_event(
  p_owner text,
  p_kind text,
  p_payload text,
  p_task_id bigint default null,
  p_worker_id bigint default null
) returns void
language sql
as $$
  insert into event (owner, kind, task_id, worker_id, payload)
  values (p_owner, p_kind, p_task_id, p_worker_id, p_payload);
$$;

create or replace function fp_log_binder_event(
  p_owner text,
  p_building_id bigint,
  p_obligation_id bigint,
  p_law_id text,
  p_kind text,
  p_summary text
) returns void
language sql
as $$
  insert into binder_event (owner, building_id, obligation_id, law_id, kind, summary)
  values (p_owner, p_building_id, p_obligation_id, p_law_id, p_kind, p_summary);
$$;

-- Guard rails on every string that crosses the boundary: the module accepted
-- unbounded input, and a client could park megabytes in a public row.
create or replace function fp_check_text(p_value text, p_name text, p_max integer)
returns text
language plpgsql immutable
as $$
begin
  if p_value is null or btrim(p_value) = '' then
    raise exception '% cannot be empty', p_name;
  end if;
  if length(p_value) > p_max then
    raise exception '% is too long (max % characters)', p_name, p_max;
  end if;
  return p_value;
end;
$$;

-- Length-only guard for optional free-text (empty or null is fine, just bounded)
-- so a client can't park megabytes in an otherwise-optional column.
create or replace function fp_check_len(p_value text, p_name text, p_max integer)
returns void
language plpgsql immutable
as $$
begin
  if p_value is not null and length(p_value) > p_max then
    raise exception '% is too long (max % characters)', p_name, p_max;
  end if;
end;
$$;

-- Task specs ride in from the callers that own the law registry (the module
-- could not import the data layer either — engine fines and compliance plans
-- already traveled this way). Shape: [{law_id, kind, title, deadline,
-- fine_estimate_usd}]. Validated here so a bad caller cannot spawn junk.
create or replace function fp_validate_task_specs(p_specs jsonb)
returns jsonb
language plpgsql immutable
as $$
declare
  spec jsonb;
begin
  if p_specs is null or jsonb_typeof(p_specs) <> 'array' then
    raise exception 'task specs must be a JSON array';
  end if;
  if jsonb_array_length(p_specs) > 100 then
    raise exception 'too many task specs (max 100)';
  end if;

  for spec in select * from jsonb_array_elements(p_specs) loop
    perform fp_check_text(spec->>'law_id', 'task spec law_id', 64);
    perform fp_check_text(spec->>'kind', 'task spec kind', 64);
    perform fp_check_text(spec->>'title', 'task spec title', 500);
    if (spec->>'deadline') is null then
      raise exception 'task spec for % is missing a deadline', spec->>'law_id';
    end if;
    perform (spec->>'deadline')::timestamptz;
    if spec ? 'fine_estimate_usd' and jsonb_typeof(spec->'fine_estimate_usd') not in ('number', 'null') then
      raise exception 'task spec fine_estimate_usd must be a number';
    end if;
  end loop;

  return p_specs;
end;
$$;

create or replace function fp_spawn_tasks(
  p_owner text,
  p_building_id bigint,
  p_address text,
  p_specs jsonb
) returns integer
language plpgsql
as $$
declare
  spec jsonb;
  spawned integer := 0;
begin
  for spec in select * from jsonb_array_elements(fp_validate_task_specs(p_specs)) loop
    -- Backfill semantics: a law that already has a task on this building is
    -- skipped, so re-ingesting only adds what is missing.
    if exists (
      select 1 from task
      where building_id = p_building_id and law_id = spec->>'law_id'
    ) then
      continue;
    end if;

    insert into task (owner, building_id, law_id, kind, title, deadline, fine_estimate_usd)
    values (
      p_owner,
      p_building_id,
      spec->>'law_id',
      spec->>'kind',
      (spec->>'title'),
      (spec->>'deadline')::timestamptz,
      (spec->>'fine_estimate_usd')::integer
    );
    spawned := spawned + 1;
  end loop;

  return spawned;
end;
$$;

-- --- account functions (humans, via the dashboard) ---------------------------

create or replace function set_review_mode(p_mode text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
begin
  if p_mode not in ('manual', 'auto') then
    raise exception 'review mode must be "manual" or "auto", got "%"', p_mode;
  end if;

  insert into settings (owner, review_mode)
  values (caller, p_mode)
  on conflict (owner) do update set review_mode = excluded.review_mode;

  perform fp_log_event(
    caller,
    'review_mode_changed',
    case when p_mode = 'auto'
      then 'auto — obligation drafts approve on submit; intakes still wait for a human'
      else 'manual — every draft waits for a human'
    end
  );
end;
$$;

-- Manual entry: the caller supplies the profile and the task specs its law
-- registry computed. The heuristic path — real city data comes in through
-- request_building instead.
create or replace function add_building(
  p_address text,
  p_sqft integer,
  p_is_affordable boolean,
  p_task_specs jsonb
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  caller text := coalesce(fp_owner(), case when fp_is_service() then 'seed' end);
  new_building_id bigint;
  spawned integer;
begin
  if caller is null then
    raise exception 'sign in first';
  end if;
  perform fp_check_text(p_address, 'address', 500);
  if p_sqft is null or p_sqft <= 0 then
    raise exception 'sqft must be positive';
  end if;

  insert into building (owner, address, sqft, is_affordable)
  values (caller, p_address, p_sqft, p_is_affordable)
  returning id into new_building_id;

  spawned := fp_spawn_tasks(caller, new_building_id, p_address, p_task_specs);

  perform fp_log_event(
    caller,
    'building_added',
    format('%s (%s sqft%s) → %s obligations spawned',
      p_address, p_sqft, case when p_is_affordable then ', affordable' else '' end, spawned)
  );

  return new_building_id;
end;
$$;

-- The dashboard's magic moment: one call with a bare address. A worker claims
-- the intake task, runs the data pipeline (GeoSearch -> LL84 -> covered list
-- -> engine), and submits the resolved payload for review. Approving the
-- intake is what creates the building.
create or replace function request_building(p_address text)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  new_task_id bigint;
begin
  perform fp_check_text(p_address, 'address', 500);

  if (
    select count(*) from task
    where owner = caller
      and kind = 'building_intake'
      and created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'too many intake requests this hour; wait before adding more buildings';
  end if;

  if exists (
    select 1 from task
    where kind = 'building_intake'
      and owner = caller
      and intake_address = p_address
      and status in ('open', 'claimed', 'in_review')
  ) then
    raise exception 'an intake for "%" is already in the queue', p_address;
  end if;

  insert into task (owner, law_id, kind, title, deadline, intake_address)
  values (
    caller, 'intake', 'building_intake',
    'Building intake — ' || p_address,
    now() + interval '1 day',
    p_address
  )
  returning id into new_task_id;

  perform fp_log_event(caller, 'building_requested',
    format('intake queued for "%s"', p_address), new_task_id);

  return new_task_id;
end;
$$;

-- --- ingest ------------------------------------------------------------------
-- The one place a building comes to exist from city data: called by the
-- ingest_building function (scripts/CLI) and by approve when an intake draft
-- is signed off. The payload carries everything the data layer resolved,
-- including the task specs its law registry computed.

create or replace function fp_ingest(p jsonb, p_owner text)
returns bigint
language plpgsql
as $$
declare
  v_address text := fp_check_text(p->>'address', 'address', 500);
  v_bbl text := fp_check_text(p->>'bbl', 'bbl', 32);
  -- 0 is a legal sqft here: intake ingests a building whose floor area the
  -- city data never resolved (PLUTO/CBL still identify it).
  v_sqft integer := (p->>'sqft')::integer;
  existing building%rowtype;
  v_building_id bigint;
  v_ll97_fine integer := (p->>'ll97_annual_fine_usd')::integer;
  backfilled integer;
begin
  if v_sqft is null or v_sqft < 0 then
    raise exception 'sqft cannot be negative';
  end if;
  perform fp_validate_task_specs(p->'task_specs');

  select * into existing from building where owner = p_owner and bbl = v_bbl;

  if found then
    update building set
      address = v_address,
      bin = p->>'bin',
      sqft = v_sqft,
      is_affordable = (p->>'is_article321')::boolean,
      annual_emissions_tco2e = (p->>'annual_emissions_tco2e')::double precision,
      uses_json = p->>'uses_json',
      ll97_covered = (p->>'ll97_covered')::boolean,
      provenance_json = p->>'provenance_json',
      num_floors = (p->>'num_floors')::integer,
      units_residential = (p->>'units_residential')::integer,
      community_district = (p->>'community_district')::integer,
      energy_star_score = (p->>'energy_star_score')::integer,
      compliance_plan_json = p->>'compliance_plan_json'
    where id = existing.id;

    -- Fresher data means a fresher fine, including clearing a stale estimate
    -- when the engine can no longer price the building.
    update task set fine_estimate_usd = v_ll97_fine
    where building_id = existing.id and law_id in ('ll97', 'art321');

    backfilled := fp_spawn_tasks(p_owner, existing.id, v_address, p->'task_specs');

    perform fp_log_event(p_owner, 'building_updated',
      case when backfilled > 0
        then format('%s (BBL %s) refreshed from city data → %s missing obligations backfilled', v_address, v_bbl, backfilled)
        else format('%s (BBL %s) refreshed from city data', v_address, v_bbl)
      end);

    return existing.id;
  end if;

  insert into building (
    owner, address, bbl, bin, sqft, is_affordable,
    annual_emissions_tco2e, uses_json, ll97_covered, provenance_json,
    num_floors, units_residential, community_district, energy_star_score,
    compliance_plan_json
  ) values (
    p_owner, v_address, v_bbl, p->>'bin', v_sqft, (p->>'is_article321')::boolean,
    (p->>'annual_emissions_tco2e')::double precision, p->>'uses_json',
    (p->>'ll97_covered')::boolean, p->>'provenance_json',
    (p->>'num_floors')::integer, (p->>'units_residential')::integer,
    (p->>'community_district')::integer, (p->>'energy_star_score')::integer,
    p->>'compliance_plan_json'
  )
  -- Two intakes that geocode to the same BBL can both pass the select above and
  -- race to insert; the partial unique index would fail the loser with a raw
  -- constraint error. Fold the loser into the existing row instead of throwing.
  on conflict (owner, bbl) where bbl is not null do update set
    address = excluded.address,
    bin = excluded.bin,
    sqft = excluded.sqft,
    is_affordable = excluded.is_affordable,
    annual_emissions_tco2e = excluded.annual_emissions_tco2e,
    uses_json = excluded.uses_json,
    ll97_covered = excluded.ll97_covered,
    provenance_json = excluded.provenance_json,
    num_floors = excluded.num_floors,
    units_residential = excluded.units_residential,
    community_district = excluded.community_district,
    energy_star_score = excluded.energy_star_score,
    compliance_plan_json = excluded.compliance_plan_json
  returning id into v_building_id;

  backfilled := fp_spawn_tasks(p_owner, v_building_id, v_address, p->'task_specs');

  perform fp_log_event(p_owner, 'building_ingested',
    format('%s (BBL %s) ingested from city data → %s obligations spawned', v_address, v_bbl, backfilled));

  return v_building_id;
end;
$$;

-- Direct ingest for scripts and the CLI. Fleet processes name the account the
-- building belongs to; a signed-in human ingests under their own account.
create or replace function ingest_building(p jsonb, p_owner text default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  caller text;
begin
  if fp_is_service() then
    caller := coalesce(p_owner, 'cli');
  else
    caller := fp_require_human();
  end if;

  return fp_ingest(p, caller);
end;
$$;

-- --- fleet functions (workers and scripts, service-role only) ----------------

create or replace function register_worker(p_name text, p_worker_id bigint default null)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
begin
  perform fp_require_service();
  perform fp_check_text(p_name, 'worker name', 100);

  if p_worker_id is not null then
    -- Same process reconnecting: revive it.
    update worker
    set name = p_name, status = 'idle', last_heartbeat = now(), current_task_id = null
    where id = p_worker_id
    returning id into v_id;

    if v_id is not null then
      perform fp_log_event('fleet', 'worker_registered', p_name || ' re-registered', null, v_id);
      return v_id;
    end if;
  end if;

  insert into worker (name) values (p_name) returning id into v_id;
  perform fp_log_event('fleet', 'worker_registered', p_name || ' joined the fleet', null, v_id);
  return v_id;
end;
$$;

-- No event row here on purpose: the module logged one per beat (~17k
-- rows/day/worker) and drowned the audit log. The row update is the heartbeat.
create or replace function heartbeat(p_worker_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  w worker%rowtype;
begin
  perform fp_require_service();

  select * into w from worker where id = p_worker_id;
  if not found then
    raise exception 'heartbeat came from an unregistered worker';
  end if;
  if w.status = 'dead' then
    return; -- killed workers stay dead; the process should exit
  end if;

  update worker set last_heartbeat = now() where id = p_worker_id;
end;
$$;

-- THE critical function: exactly one owner per task. The UPDATE's WHERE
-- clause is the check-then-set — two workers racing on the same row means one
-- matches status='open' and commits, the other matches nothing and errors.
create or replace function claim_task(p_worker_id bigint, p_task_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  w worker%rowtype;
  claimed task%rowtype;
begin
  perform fp_require_service();

  select * into w from worker where id = p_worker_id;
  if not found then
    raise exception 'claim came from an unregistered worker';
  end if;
  if w.status <> 'idle' then
    raise exception '% is already working on something', w.name;
  end if;

  update task
  set status = 'claimed', claimed_by = p_worker_id
  where id = p_task_id and status = 'open'
  returning * into claimed;

  if not found then
    if exists (select 1 from task where id = p_task_id) then
      raise exception 'task % was already claimed', p_task_id;
    end if;
    raise exception 'no task with id %', p_task_id;
  end if;

  update worker
  set status = 'working', current_task_id = p_task_id, last_heartbeat = now()
  where id = p_worker_id;

  perform fp_log_event(claimed.owner, 'task_claimed',
    format('%s claimed "%s"', w.name, claimed.title), p_task_id, p_worker_id);
end;
$$;

create or replace function submit_work(
  p_worker_id bigint,
  p_task_id bigint,
  p_body text,
  p_payload_json text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  w worker%rowtype;
  t task%rowtype;
  mode text;
begin
  perform fp_require_service();

  select * into w from worker where id = p_worker_id;
  if not found then
    raise exception 'submission came from an unregistered worker';
  end if;

  select * into t from task where id = p_task_id for update;
  if not found then
    raise exception 'no task with id %', p_task_id;
  end if;
  if t.status <> 'claimed' or t.claimed_by <> p_worker_id then
    raise exception 'task % is not claimed by %', p_task_id, w.name;
  end if;
  perform fp_check_text(p_body, 'submission body', 200000);
  if p_payload_json is not null and length(p_payload_json) > 500000 then
    raise exception 'ingest payload is too large';
  end if;

  insert into submission (owner, task_id, worker_id, body, payload_json)
  values (t.owner, p_task_id, p_worker_id, p_body, p_payload_json);

  update worker
  set status = 'idle', current_task_id = null, last_heartbeat = now()
  where id = p_worker_id;

  perform fp_log_event(t.owner, 'work_submitted',
    w.name || ' submitted a draft for review', p_task_id, p_worker_id);

  -- Auto mode signs off obligation drafts on the spot. Intakes are exempt:
  -- creating a building always takes a human, whatever the mode says.
  -- The mode is the task owner's setting, not the submitting worker's.
  select review_mode into mode from settings where owner = t.owner;
  if coalesce(mode, 'manual') = 'auto' and t.kind <> 'building_intake' then
    insert into approval (owner, task_id, approved_by, verdict, note)
    values (t.owner, p_task_id, 'agent:' || w.name, 'approved', 'auto-approved — review mode is auto');

    update task set status = 'approved', claimed_by = null where id = p_task_id;

    perform fp_log_event(t.owner, 'task_approved',
      'auto-approved — review mode is auto', p_task_id);
  else
    update task set status = 'in_review' where id = p_task_id;
  end if;
end;
$$;

-- A worker's dead end: the address didn't survive the geocode gate (or the
-- lookup itself blew up in a way retrying won't fix). The reason lands as a
-- submission so the dashboard shows why, and the task closes as rejected.
create or replace function fail_intake(p_worker_id bigint, p_task_id bigint, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  w worker%rowtype;
  t task%rowtype;
begin
  perform fp_require_service();

  select * into w from worker where id = p_worker_id;
  if not found then
    raise exception 'intake failure came from an unregistered worker';
  end if;

  select * into t from task where id = p_task_id;
  if not found then
    raise exception 'no task with id %', p_task_id;
  end if;
  if t.kind <> 'building_intake' then
    raise exception 'task % is not an intake task', p_task_id;
  end if;
  if t.status <> 'claimed' or t.claimed_by <> p_worker_id then
    raise exception 'task % is not claimed by %', p_task_id, w.name;
  end if;
  perform fp_check_text(p_reason, 'failure reason', 10000);

  insert into submission (owner, task_id, worker_id, body)
  values (t.owner, p_task_id, p_worker_id, p_reason);

  update task set status = 'rejected', claimed_by = null where id = p_task_id;
  update worker
  set status = 'idle', current_task_id = null, last_heartbeat = now()
  where id = p_worker_id;

  perform fp_log_event(t.owner, 'intake_failed', p_reason, p_task_id, p_worker_id);
end;
$$;

-- --- review functions (humans only) ------------------------------------------

create or replace function approve(p_task_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  t task%rowtype;
  latest submission%rowtype;
  new_building_id bigint;
begin
  select * into t from task where id = p_task_id;
  if not found then
    raise exception 'task % not found', p_task_id;
  end if;
  if t.owner <> caller then
    raise exception 'task % belongs to another account', p_task_id;
  end if;
  if t.status <> 'in_review' then
    raise exception 'task % is not in review', p_task_id;
  end if;
  if length(coalesce(p_note, '')) > 10000 then
    raise exception 'note is too long';
  end if;

  -- Approving an intake is what creates the building: replay the resolved
  -- city data the worker attached to its submission.
  if t.kind = 'building_intake' then
    select * into latest from submission
    where task_id = p_task_id
    order by id desc
    limit 1;

    if latest.payload_json is null then
      raise exception 'intake % has no ingest payload — reject it and re-request the address', p_task_id;
    end if;

    new_building_id := fp_ingest(latest.payload_json::jsonb, t.owner);
    update task set building_id = new_building_id where id = p_task_id;
  end if;

  insert into approval (owner, task_id, approved_by, verdict, note)
  values (t.owner, p_task_id, caller, 'approved', coalesce(p_note, ''));

  update task set status = 'approved', claimed_by = null where id = p_task_id;

  perform fp_log_event(t.owner, 'task_approved',
    case when coalesce(p_note, '') = '' then 'approved' else p_note end, p_task_id);
end;
$$;

create or replace function reject(p_task_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  t task%rowtype;
begin
  select * into t from task where id = p_task_id;
  if not found then
    raise exception 'task % not found', p_task_id;
  end if;
  if t.owner <> caller then
    raise exception 'task % belongs to another account', p_task_id;
  end if;
  if t.status <> 'in_review' then
    raise exception 'task % is not in review', p_task_id;
  end if;
  if length(coalesce(p_note, '')) > 10000 then
    raise exception 'note is too long';
  end if;

  insert into approval (owner, task_id, approved_by, verdict, note)
  values (t.owner, p_task_id, caller, 'rejected', coalesce(p_note, ''));

  if t.kind = 'building_intake' then
    -- Rejecting an intake means "wrong building" — re-running the same
    -- lookup would reproduce the same answer. Terminal; re-request with a
    -- corrected address instead.
    update task set status = 'rejected', claimed_by = null where id = p_task_id;
    perform fp_log_event(t.owner, 'task_rejected',
      case when coalesce(p_note, '') = '' then 'intake rejected' else p_note end, p_task_id);
    return;
  end if;

  -- Back to the queue for another worker.
  update task set status = 'open', claimed_by = null where id = p_task_id;
  perform fp_log_event(t.owner, 'task_rejected',
    case when coalesce(p_note, '') = '' then 'rejected — returned to queue' else p_note end, p_task_id);
end;
$$;

-- The end of the line: a human confirms the approved filing actually went
-- out the door (DOB NOW, HPD, wherever the law wants it).
create or replace function mark_done(p_task_id bigint, p_note text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  t task%rowtype;
begin
  select * into t from task where id = p_task_id;
  if not found then
    raise exception 'task % not found', p_task_id;
  end if;
  if t.owner <> caller then
    raise exception 'task % belongs to another account', p_task_id;
  end if;
  if t.status <> 'approved' then
    raise exception 'task % is not approved — only approved work can be filed', p_task_id;
  end if;
  if length(coalesce(p_note, '')) > 10000 then
    raise exception 'note is too long';
  end if;

  update task set status = 'done' where id = p_task_id;
  perform fp_log_event(t.owner, 'task_done',
    case when coalesce(p_note, '') = '' then 'filing confirmed' else p_note end, p_task_id);
end;
$$;

-- --- fleet management --------------------------------------------------------

create or replace function fp_release_worker(p_worker_id bigint, p_reason text)
returns void
language plpgsql
as $$
declare
  w worker%rowtype;
  abandoned task%rowtype;
begin
  select * into w from worker where id = p_worker_id;
  if not found then
    return;
  end if;

  if w.current_task_id is not null then
    select * into abandoned from task
    where id = w.current_task_id and status = 'claimed' and claimed_by = w.id;

    if found then
      update task set status = 'open', claimed_by = null where id = abandoned.id;
      perform fp_log_event(abandoned.owner, 'task_released',
        format('"%s" returned to open (%s)', abandoned.title, p_reason),
        abandoned.id, w.id);
    end if;
  end if;

  update worker set status = 'dead', current_task_id = null where id = p_worker_id;
end;
$$;

-- Crash simulation for the fleet. Service-role only (workers, the CLI, pg_cron):
-- a tenant must never be able to kill a shared fleet worker and bounce another
-- account's in-flight task back to the queue.
create or replace function kill_worker(p_worker_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  w worker%rowtype;
begin
  perform fp_require_service();

  select * into w from worker where id = p_worker_id;
  if not found then
    raise exception 'no worker with id %', p_worker_id;
  end if;
  if w.status = 'dead' then
    return;
  end if;

  perform fp_release_worker(p_worker_id, 'killed');
  perform fp_log_event('fleet', 'worker_killed', w.name || ' was killed',
    w.current_task_id, w.id);
end;
$$;

-- Housekeeping: per-task agents leave one dead row each. Sweep them on
-- demand; the live fleet is untouched.
create or replace function prune_dead_workers()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  pruned integer;
begin
  perform fp_require_service();

  delete from worker where status = 'dead';
  get diagnostics pruned = row_count;

  perform fp_log_event('fleet', 'workers_pruned',
    pruned || ' dead agent rows cleared');
end;
$$;

-- Scheduled every 5s by pg_cron: crash recovery + SLA breach flagging + audit
-- log retention (the module never deleted an event row; this caps the table).
create or replace function reap()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  w record;
  t record;
  silence_s integer;
begin
  for w in select * from worker where status <> 'dead' loop
    silence_s := extract(epoch from (now() - w.last_heartbeat));
    if silence_s > 15 then -- 3 missed 5s heartbeats = dead
      perform fp_release_worker(w.id, 'heartbeat stale — presumed crashed');
      perform fp_log_event('fleet', 'worker_reaped',
        format('%s reaped after %ss of silence', w.name, silence_s), null, w.id);
    end if;
  end loop;

  for t in
    select * from task
    where sla_breached = false
      and status not in ('approved', 'done')
      and deadline < now()
  loop
    update task set sla_breached = true where id = t.id;
    perform fp_log_event(t.owner, 'sla_breached',
      format('deadline passed: "%s"', t.title), t.id);
  end loop;

  delete from event where at < now() - interval '90 days';
end;
$$;

-- --- compliance binder functions ---------------------------------------------

-- One obligation per law that binds a building. The caller's law registry
-- computes the specs ([{law_id, title, due_date}]); idempotent — a law that
-- already has an obligation is skipped, so re-running only backfills.
create or replace function seed_obligations(p_building_id bigint, p_specs jsonb)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  b building%rowtype;
  spec jsonb;
  new_obligation_id bigint;
  created integer := 0;
begin
  select * into b from building where id = p_building_id and owner = caller;
  if not found then
    raise exception 'no building with id %', p_building_id;
  end if;
  if p_specs is null or jsonb_typeof(p_specs) <> 'array' or jsonb_array_length(p_specs) > 100 then
    raise exception 'obligation specs must be a JSON array of at most 100 entries';
  end if;

  for spec in select * from jsonb_array_elements(p_specs) loop
    perform fp_check_text(spec->>'law_id', 'obligation law_id', 64);
    perform fp_check_text(spec->>'title', 'obligation title', 500);

    if exists (
      select 1 from obligation
      where building_id = p_building_id and owner = caller and law_id = spec->>'law_id'
    ) then
      continue;
    end if;

    insert into obligation (owner, building_id, law_id, title, due_date)
    values (caller, p_building_id, spec->>'law_id', spec->>'title',
            (spec->>'due_date')::timestamptz)
    returning id into new_obligation_id;

    perform fp_log_binder_event(caller, p_building_id, new_obligation_id,
      spec->>'law_id', 'obligation_created', 'Obligation opened: ' || (spec->>'title'));
    created := created + 1;
  end loop;

  perform fp_log_event(caller, 'binder_seeded',
    format('%s obligations seeded for building %s', created, p_building_id));
end;
$$;

create or replace function add_vendor(
  p_name text, p_company text, p_role_type text, p_email text,
  p_phone text, p_license_number text, p_license_type text, p_notes text
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  v_id bigint;
begin
  perform fp_check_text(p_name, 'vendor name', 200);
  perform fp_check_len(p_company, 'vendor company', 200);
  perform fp_check_len(p_email, 'vendor email', 320);
  perform fp_check_len(p_phone, 'vendor phone', 50);
  perform fp_check_len(p_license_number, 'license number', 100);
  perform fp_check_len(p_license_type, 'license type', 100);
  perform fp_check_len(p_notes, 'vendor notes', 10000);

  insert into vendor (owner, name, company, role_type, email, phone, license_number, license_type, notes)
  values (caller, p_name, coalesce(p_company, ''), p_role_type, coalesce(p_email, ''),
          coalesce(p_phone, ''), coalesce(p_license_number, ''), coalesce(p_license_type, ''),
          coalesce(p_notes, ''))
  returning id into v_id;

  perform fp_log_event(caller, 'vendor_added', format('Added vendor %s', p_name));

  return v_id;
end;
$$;

create or replace function assign_vendor(p_obligation_id bigint, p_vendor_id bigint)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  o obligation%rowtype;
  v vendor%rowtype;
  who text;
begin
  select * into o from obligation where id = p_obligation_id and owner = caller;
  if not found then
    raise exception 'no such obligation';
  end if;
  select * into v from vendor where id = p_vendor_id and owner = caller;
  if not found then
    raise exception 'no such vendor';
  end if;

  update obligation set vendor_id = p_vendor_id, updated_at = now()
  where id = p_obligation_id;

  who := case when v.company <> '' then format('%s (%s)', v.name, v.company) else v.name end;
  perform fp_log_binder_event(caller, o.building_id, o.id, o.law_id,
    'vendor_assigned', format('Assigned %s as %s', who, replace(v.role_type, '_', ' ')));
  perform fp_log_event(caller, 'vendor_assigned', format('Assigned %s to %s', who, o.law_id));
end;
$$;

create or replace function set_obligation_status(p_obligation_id bigint, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  o obligation%rowtype;
begin
  if p_status not in ('not_started', 'in_progress', 'submitted', 'filed', 'completed',
                      'overdue', 'blocked', 'not_applicable', 'missing_data') then
    raise exception 'unknown obligation status "%"', p_status;
  end if;

  select * into o from obligation where id = p_obligation_id and owner = caller;
  if not found then
    raise exception 'no such obligation';
  end if;

  update obligation set
    status = p_status,
    completed_at = case when p_status = 'completed' then now() else completed_at end,
    updated_at = now()
  where id = p_obligation_id;

  perform fp_log_binder_event(caller, o.building_id, o.id, o.law_id,
    'status_changed', 'Status set to ' || replace(p_status, '_', ' '));
  perform fp_log_event(caller, 'obligation_status_changed',
    format('%s status set to %s', o.law_id, p_status));
end;
$$;

create or replace function add_evidence(
  p_obligation_id bigint, p_file_name text, p_file_type text,
  p_file_url_or_key text, p_uploaded_by text, p_issuer text,
  p_filing_reference_number text, p_notes text
) returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  o obligation%rowtype;
  v_id bigint;
begin
  perform fp_check_text(p_file_name, 'evidence file name', 300);
  perform fp_check_len(p_file_type, 'evidence file type', 100);
  perform fp_check_len(p_file_url_or_key, 'evidence file link', 2000);
  perform fp_check_len(p_uploaded_by, 'uploaded-by', 200);
  perform fp_check_len(p_issuer, 'evidence issuer', 200);
  perform fp_check_len(p_filing_reference_number, 'filing reference', 200);
  perform fp_check_len(p_notes, 'evidence notes', 10000);

  select * into o from obligation where id = p_obligation_id and owner = caller;
  if not found then
    raise exception 'no such obligation';
  end if;

  insert into evidence (
    owner, obligation_id, building_id, law_id, file_name, file_type,
    file_url_or_key, uploaded_by, issuer, vendor_id, filing_reference_number, notes
  ) values (
    caller, o.id, o.building_id, o.law_id, p_file_name, coalesce(p_file_type, ''),
    coalesce(p_file_url_or_key, ''), coalesce(p_uploaded_by, ''), coalesce(p_issuer, ''),
    o.vendor_id, coalesce(p_filing_reference_number, ''), coalesce(p_notes, '')
  )
  returning id into v_id;

  perform fp_log_binder_event(caller, o.building_id, o.id, o.law_id,
    'evidence_uploaded', 'Proof filed: ' || p_file_name);
  perform fp_log_event(caller, 'evidence_added',
    format('Proof filed for %s: %s', o.law_id, p_file_name));

  return v_id;
end;
$$;

create or replace function set_evidence_verification(p_evidence_id bigint, p_status text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  e evidence%rowtype;
begin
  if p_status not in ('unreviewed', 'accepted', 'needs_review', 'rejected', 'expired', 'missing') then
    raise exception 'unknown verification status "%"', p_status;
  end if;

  select * into e from evidence where id = p_evidence_id and owner = caller;
  if not found then
    raise exception 'no such evidence';
  end if;

  update evidence set verification_status = p_status where id = p_evidence_id;

  perform fp_log_binder_event(caller, e.building_id, e.obligation_id, e.law_id,
    'evidence_reviewed', format('Proof "%s" marked %s', e.file_name, replace(p_status, '_', ' ')));
  perform fp_log_event(caller, 'evidence_reviewed',
    format('Proof "%s" marked %s', e.file_name, p_status));
end;
$$;

create or replace function add_binder_note(p_obligation_id bigint, p_note text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  caller text := fp_require_human();
  o obligation%rowtype;
begin
  perform fp_check_text(p_note, 'note', 10000);

  select * into o from obligation where id = p_obligation_id and owner = caller;
  if not found then
    raise exception 'no such obligation';
  end if;

  update obligation set notes = p_note, updated_at = now() where id = p_obligation_id;
  perform fp_log_binder_event(caller, o.building_id, o.id, o.law_id, 'note_added', p_note);
  perform fp_log_event(caller, 'binder_note_added', format('Note added on %s', o.law_id));
end;
$$;

-- --- grants ------------------------------------------------------------------
-- Reads flow through RLS. Writes only exist as the definer functions above;
-- the internal helpers are revoked so nothing reaches them directly.

grant usage on schema public to anon, authenticated, service_role;
grant select on all tables in schema public to authenticated;
grant select on task, building to service_role;

revoke all on function fp_ingest(jsonb, text) from public, anon, authenticated;
revoke all on function fp_release_worker(bigint, text) from public, anon, authenticated;
revoke all on function fp_log_event(text, text, text, bigint, bigint) from public, anon, authenticated;
revoke all on function fp_log_binder_event(text, bigint, bigint, text, text, text) from public, anon, authenticated;
revoke all on function fp_spawn_tasks(text, bigint, text, jsonb) from public, anon, authenticated;
revoke all on function reap() from public, anon, authenticated;

revoke all on function register_worker(text, bigint) from public, anon, authenticated;
revoke all on function heartbeat(bigint) from public, anon, authenticated;
revoke all on function claim_task(bigint, bigint) from public, anon, authenticated;
revoke all on function submit_work(bigint, bigint, text, text) from public, anon, authenticated;
revoke all on function fail_intake(bigint, bigint, text) from public, anon, authenticated;

revoke all on function set_review_mode(text) from public, anon;
revoke all on function add_building(text, integer, boolean, jsonb) from public, anon;
revoke all on function request_building(text) from public, anon;
revoke all on function ingest_building(jsonb, text) from public, anon;
revoke all on function approve(bigint, text) from public, anon;
revoke all on function reject(bigint, text) from public, anon;
revoke all on function mark_done(bigint, text) from public, anon;
revoke all on function kill_worker(bigint) from public, anon;
revoke all on function prune_dead_workers() from public, anon;
revoke all on function seed_obligations(bigint, jsonb) from public, anon;
revoke all on function add_vendor(text, text, text, text, text, text, text, text) from public, anon;
revoke all on function assign_vendor(bigint, bigint) from public, anon;
revoke all on function set_obligation_status(bigint, text) from public, anon;
revoke all on function add_evidence(bigint, text, text, text, text, text, text, text) from public, anon;
revoke all on function set_evidence_verification(bigint, text) from public, anon;
revoke all on function add_binder_note(bigint, text) from public, anon;

-- Revoking PUBLIC strips the default execute grant, so name who may call what.
grant execute on function register_worker(text, bigint) to service_role;
grant execute on function heartbeat(bigint) to service_role;
grant execute on function claim_task(bigint, bigint) to service_role;
grant execute on function submit_work(bigint, bigint, text, text) to service_role;
grant execute on function fail_intake(bigint, bigint, text) to service_role;

grant execute on function set_review_mode(text) to authenticated;
grant execute on function add_building(text, integer, boolean, jsonb) to authenticated, service_role;
grant execute on function request_building(text) to authenticated;
grant execute on function ingest_building(jsonb, text) to authenticated, service_role;
grant execute on function approve(bigint, text) to authenticated;
grant execute on function reject(bigint, text) to authenticated;
grant execute on function mark_done(bigint, text) to authenticated;
grant execute on function kill_worker(bigint) to service_role;
grant execute on function prune_dead_workers() to service_role;
grant execute on function seed_obligations(bigint, jsonb) to authenticated;
grant execute on function add_vendor(text, text, text, text, text, text, text, text) to authenticated;
grant execute on function assign_vendor(bigint, bigint) to authenticated;
grant execute on function set_obligation_status(bigint, text) to authenticated;
grant execute on function add_evidence(bigint, text, text, text, text, text, text, text) to authenticated;
grant execute on function set_evidence_verification(bigint, text) to authenticated;
grant execute on function add_binder_note(bigint, text) to authenticated;

grant execute on function fp_owner() to anon, authenticated, service_role;
grant execute on function fp_is_service() to anon, authenticated, service_role;
grant execute on function fp_require_human() to authenticated, service_role;
grant execute on function fp_require_service() to authenticated, service_role;
grant execute on function fp_check_text(text, text, integer) to authenticated, service_role;
grant execute on function fp_validate_task_specs(jsonb) to authenticated, service_role;

-- --- realtime ----------------------------------------------------------------
-- The dashboard subscribes to row changes on these tables; RLS filters what
-- each account receives, same as the old owner-scoped table subscriptions.

alter publication supabase_realtime add table
  building, task, worker, submission, approval, settings, event,
  vendor, obligation, evidence, binder_event;

-- Worker rows are the one thing the dashboard watches that actually gets
-- deleted (prune_dead_workers). Full replica identity lets Realtime deliver
-- those deletes so the fleet page drops the rows live.
alter table worker replica identity full;

-- --- reaper schedule ---------------------------------------------------------
-- pg_cron 1.5+ supports second-granularity schedules; every 5 seconds matches
-- the module's reaper tick.

select cron.schedule('fineprint-reap', '5 seconds', 'select public.reap()');
