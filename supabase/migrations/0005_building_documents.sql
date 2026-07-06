-- Building documents: the standardized, exportable library of the files an owner
-- uploads for a building (permits, prior filings, inspection reports, cut sheets).
-- Fineprint doesn't file anything and doesn't re-key the document — it gives each
-- upload a consistent cover sheet (document type, building identifiers, dates,
-- reference number) and keeps them in one place the owner can export wherever
-- they submit for LL97 compliance.
--
-- One row per uploaded document. Files live in the private 'evidence' storage
-- bucket under the account's own `<owner>/documents/<building_id>/...` prefix.
-- This is an owner-owned record edited straight from the browser under RLS, so it
-- follows the same access shape as the compliance binder: full CRUD for the
-- owner, everything for service_role.

create table public.building_documents (
  id bigint generated always as identity primary key,
  owner text not null,
  building_id bigint not null references public.buildings (id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  -- A standardized type the owner picks on upload (permit, prior_ll97_report,
  -- inspection_report, plan, lease, other) — validated in the client, kept free
  -- text here so the vocabulary can grow without a migration.
  doc_type text not null default 'other',
  document_date date,
  reference_number text not null default '',
  note text not null default '',
  uploaded_at timestamptz not null default now()
);
create index building_documents_owner_idx on public.building_documents (owner);
create index building_documents_building_idx on public.building_documents (building_id);

-- The 0002/0004 do-blocks iterate hardcoded table arrays and will not pick up a
-- new table, so this migration issues its own RLS, grants, and realtime setup.

alter table public.building_documents enable row level security;

create policy building_documents_select_own on public.building_documents
  for select using (owner = public.requesting_owner());
create policy building_documents_insert_own on public.building_documents
  for insert with check (owner = public.requesting_owner());
create policy building_documents_update_own on public.building_documents
  for update using (owner = public.requesting_owner())
  with check (owner = public.requesting_owner());
create policy building_documents_delete_own on public.building_documents
  for delete using (owner = public.requesting_owner());

-- RLS only filters rows a role may already touch; the base privilege is granted
-- explicitly (0002 warns default privileges did not cover the binder tables).
grant select, insert, update, delete on public.building_documents to authenticated;
grant all on public.building_documents to service_role;

-- Realtime: deliver full rows so the client's row filters and RLS on the change
-- feed have every column, same as the other dashboard tables.
alter table public.building_documents replica identity full;
alter publication supabase_realtime add table public.building_documents;
