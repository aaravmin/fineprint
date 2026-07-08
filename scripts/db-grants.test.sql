-- Defense-in-depth for the fp_is_service() JWT-absence branch: even if that
-- guard were ever weakened, a stray EXECUTE grant to anon on a service- or
-- human-gated function would be the thing that turns it into a hole. This
-- asserts anon holds no such grant. It is data-driven — it finds every
-- function that calls fp_require_service()/fp_require_human() rather than
-- naming them, so a new gated function is covered the moment it is added.

begin;

create extension if not exists pgtap;

select plan(2);

-- Guard against a regex that silently matches nothing: if this drops to zero,
-- the "no grants" check below would pass vacuously.
select cmp_ok(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname not in ('fp_require_service', 'fp_require_human')
      and pg_get_functiondef(p.oid) ~ 'fp_require_(service|human)\('
  ),
  '>',
  0,
  'the gate query matches the fp_require_service/human-gated functions'
);

-- The invariant: anon can execute none of them. On failure the offending
-- function names are the diff, so the fix is obvious.
select is(
  (
    select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname not in ('fp_require_service', 'fp_require_human')
      and pg_get_functiondef(p.oid) ~ 'fp_require_(service|human)\('
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  '',
  'anon has no EXECUTE grant on any service- or human-gated function'
);

select * from finish();

rollback;
