-- Write-path helpers.
--
-- The SpacetimeDB module kept two invariants that live on here:
--   1. Every mutation appends one audit row  -> log_event()
--   2. Approving an intake creates the building and all its obligation tasks
--      inside ONE transaction (the approve reducer was atomic) -> ingest_building()
--
-- The law registry (applicability, statutory deadlines, penalties) is
-- TypeScript and cannot be reimplemented in SQL, so the caller computes the
-- building row and the full desired task set in TS and hands them here as jsonb.
-- This function only does the atomic write + the backfill/dedup that the old
-- ingestFromArgs did in one reducer.

create or replace function public.log_event(
  p_owner text,
  p_kind text,
  p_payload text,
  p_task_id bigint default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.events (owner, kind, payload, task_id)
  values (p_owner, p_kind, p_payload, p_task_id);
$$;

-- Only the service role (the Trigger.dev job and the server-side routes) may
-- call this. Hosted Supabase grants EXECUTE on new functions to anon and
-- authenticated by default via ALTER DEFAULT PRIVILEGES, and revoking from
-- PUBLIC does NOT remove those explicit role grants — so anon/authenticated
-- must be revoked by name, or any browser with the anon key and a Clerk token
-- could forge audit rows for any account.
revoke execute on function public.log_event(text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.log_event(text, text, text, bigint) to service_role;

-- Upsert a building by (owner, bbl) and spawn any covered-law tasks it does not
-- already have. Returns the building id. SECURITY DEFINER + explicit p_owner:
-- because a malicious browser could otherwise pass someone else's owner, EXECUTE
-- is granted only to service_role (see the grant at the end). The approve route
-- runs server-side with the service key after verifying the task's owner.
create or replace function public.ingest_building(
  p_owner text,
  p_building jsonb,
  p_tasks jsonb,
  p_ll97_fine integer default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_building_id bigint;
  v_bbl text := p_building ->> 'bbl';
  v_backfilled int;
  v_kind text := 'building_ingested';
begin
  select id into v_building_id
  from public.buildings
  where owner = p_owner and bbl = v_bbl;

  if found then
    v_kind := 'building_updated';

    update public.buildings set
      address              = p_building ->> 'address',
      bin                  = p_building ->> 'bin',
      sqft                 = (p_building ->> 'sqft')::int,
      is_affordable        = (p_building ->> 'is_affordable')::boolean,
      annual_emissions_tco2e = nullif(p_building ->> 'annual_emissions_tco2e', '')::double precision,
      uses_json            = p_building -> 'uses_json',
      ll97_covered         = nullif(p_building ->> 'll97_covered', '')::boolean,
      provenance_json      = p_building -> 'provenance_json',
      num_floors           = nullif(p_building ->> 'num_floors', '')::int,
      units_residential    = nullif(p_building ->> 'units_residential', '')::int,
      community_district   = nullif(p_building ->> 'community_district', '')::int,
      energy_star_score    = nullif(p_building ->> 'energy_star_score', '')::int,
      compliance_plan_json = p_building -> 'compliance_plan_json'
    where id = v_building_id;
  else
    insert into public.buildings (
      owner, address, bbl, bin, sqft, is_affordable, annual_emissions_tco2e,
      uses_json, ll97_covered, provenance_json, num_floors, units_residential,
      community_district, energy_star_score, compliance_plan_json
    ) values (
      p_owner,
      p_building ->> 'address',
      v_bbl,
      p_building ->> 'bin',
      (p_building ->> 'sqft')::int,
      (p_building ->> 'is_affordable')::boolean,
      nullif(p_building ->> 'annual_emissions_tco2e', '')::double precision,
      p_building -> 'uses_json',
      nullif(p_building ->> 'll97_covered', '')::boolean,
      p_building -> 'provenance_json',
      nullif(p_building ->> 'num_floors', '')::int,
      nullif(p_building ->> 'units_residential', '')::int,
      nullif(p_building ->> 'community_district', '')::int,
      nullif(p_building ->> 'energy_star_score', '')::int,
      p_building -> 'compliance_plan_json'
    )
    returning id into v_building_id;
  end if;

  -- Spawn only the covered-law tasks this building does not already have; this
  -- is the "backfill missing obligations" behaviour from ingestFromArgs.
  insert into public.tasks (
    owner, building_id, law_id, kind, title, status, deadline,
    sla_breached, fine_estimate_usd
  )
  select
    p_owner,
    v_building_id,
    e ->> 'law_id',
    e ->> 'kind',
    e ->> 'title',
    coalesce(e ->> 'status', 'open'),
    (e ->> 'deadline')::timestamptz,
    false,
    nullif(e ->> 'fine_estimate_usd', '')::int
  from jsonb_array_elements(p_tasks) as e
  where not exists (
    select 1 from public.tasks t
    where t.building_id = v_building_id and t.law_id = e ->> 'law_id'
  );
  get diagnostics v_backfilled = row_count;

  -- Fresher city data means a fresher fine: keep the LL97/Article 321 task
  -- estimates in step with the engine instead of letting a stale stub survive.
  if p_ll97_fine is not null then
    update public.tasks
    set fine_estimate_usd = p_ll97_fine
    where building_id = v_building_id and law_id in ('ll97', 'art321');
  end if;

  perform public.log_event(
    p_owner,
    v_kind,
    format('%s (BBL %s) %s from city data -> %s obligations spawned',
           p_building ->> 'address', v_bbl,
           case when v_kind = 'building_updated' then 'refreshed' else 'ingested' end,
           v_backfilled)
  );

  return v_building_id;
end
$$;

-- Same escalation risk, higher stakes: this is SECURITY DEFINER and takes
-- p_owner, so an authenticated caller could inject buildings and tasks into any
-- account. Revoke from anon and authenticated by name (not just PUBLIC) and
-- grant only to service_role; the approve route calls it through the admin
-- (service-role) client after verifying the task's owner.
revoke execute on function public.ingest_building(text, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.ingest_building(text, jsonb, jsonb, integer) to service_role;
