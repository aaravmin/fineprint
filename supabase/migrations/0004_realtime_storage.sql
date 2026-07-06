-- Realtime: the dashboard replaces SpacetimeDB subscriptions with Supabase
-- postgres_changes. Add every table the dashboard watches to the realtime
-- publication. `replica identity full` makes UPDATE/DELETE deliver the whole
-- row (not just the primary key) so the client's row filters and RLS on the
-- change feed have every column to evaluate.

do $$
declare
  tbl text;
  realtime_tables text[] := array[
    'buildings', 'tasks', 'submissions', 'approvals', 'settings', 'events',
    'vendors', 'obligations', 'evidence', 'binder_events'
  ];
begin
  foreach tbl in array realtime_tables loop
    execute format('alter table public.%I replica identity full', tbl);
    execute format('alter publication supabase_realtime add table public.%I', tbl);
  end loop;
end
$$;

-- Storage: evidence files move off arbitrary URLs into a private bucket. The
-- object key convention is `<owner>/<obligation_id>/<filename>`, so the first
-- path segment is the Clerk user id and the policies key off it — an account
-- can only read/write objects under its own prefix.
insert into storage.buckets (id, name, public)
values ('evidence', 'evidence', false)
on conflict (id) do nothing;

create policy "evidence_read_own"
  on storage.objects for select
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.requesting_owner()
  );

create policy "evidence_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.requesting_owner()
  );

-- Needed for upsert (overwrite) uploads under the account's own prefix.
create policy "evidence_update_own"
  on storage.objects for update
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.requesting_owner()
  )
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.requesting_owner()
  );

create policy "evidence_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = public.requesting_owner()
  );
