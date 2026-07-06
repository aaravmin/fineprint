-- Row-level security: each account sees only its own rows, keyed on the Clerk
-- user id. This replaces the clientVisibilityFilter.sql owner-views from the
-- SpacetimeDB module.
--
-- The Clerk session token is minted from a Supabase JWT template / third-party
-- auth integration, so its `sub` claim is the Clerk user id and matches the
-- `owner` column every table carries. The Trigger.dev job and the server-side
-- routes connect with the service_role key, which bypasses RLS entirely — that
-- is how they write any account's rows (the old module gave registered workers a
-- see-everything filter; here the service role is that privilege).
--
-- Two access shapes, matching how the old module worked:
--
--   State-machine + audit tables (buildings, tasks, submissions, approvals,
--   events): owner may only SELECT. Every mutation went through a reducer that
--   validated the transition; here the equivalent writes happen only through the
--   service-role routes and the job. A browser cannot flip a task to approved,
--   forge an approval, or edit the append-only audit log.
--
--   Binder + settings tables (vendors, obligations, evidence, binder_events,
--   settings): the customer's own records, edited directly from the browser, so
--   owner gets full CRUD under RLS.

-- The requesting account's Clerk id, or '' for an unauthenticated/service call.
-- STABLE so the planner can treat it as constant within a statement.
create or replace function public.requesting_owner()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'sub', '')
$$;

-- Owner-readable, service-role-writable: the state machine and the audit log.
do $$
declare
  tbl text;
  read_only_tables text[] := array[
    'buildings', 'tasks', 'submissions', 'approvals', 'events'
  ];
begin
  foreach tbl in array read_only_tables loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format(
      'create policy %I on public.%I for select using (owner = public.requesting_owner())',
      tbl || '_select_own', tbl
    );
  end loop;
end
$$;

-- Owner-owned records the customer edits directly: the compliance binder and the
-- per-account settings row.
do $$
declare
  tbl text;
  crud_tables text[] := array[
    'settings', 'vendors', 'obligations', 'evidence', 'binder_events'
  ];
begin
  foreach tbl in array crud_tables loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format(
      'create policy %I on public.%I for select using (owner = public.requesting_owner())',
      tbl || '_select_own', tbl
    );
    execute format(
      'create policy %I on public.%I for insert with check (owner = public.requesting_owner())',
      tbl || '_insert_own', tbl
    );
    execute format(
      'create policy %I on public.%I for update using (owner = public.requesting_owner()) with check (owner = public.requesting_owner())',
      tbl || '_update_own', tbl
    );
    execute format(
      'create policy %I on public.%I for delete using (owner = public.requesting_owner())',
      tbl || '_delete_own', tbl
    );
  end loop;
end
$$;

-- Table-level GRANTs. RLS policies only filter rows a role is ALREADY allowed to
-- touch — the role still needs the base privilege, and relying on Supabase's
-- implicit default privileges for that is fragile (it did not cover these tables
-- in a clean stack). So grant explicitly, matching the two access shapes above:
-- the browser (`authenticated`) gets read on the state machine and full CRUD on
-- the binder; the service role (routes + job) gets everything.
grant select on
  public.buildings, public.tasks, public.submissions, public.approvals, public.events
  to authenticated;

grant select, insert, update, delete on
  public.settings, public.vendors, public.obligations, public.evidence,
  public.binder_events
  to authenticated;

grant all on all tables in schema public to service_role;
