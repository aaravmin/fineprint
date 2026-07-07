begin;

do $$
declare
  new_building_id bigint;
  task_id bigint;
  worker_id bigint;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"smoke_owner_a","role":"authenticated"}',
    true
  );

  new_building_id := add_building(
    'Smoke Test Building, Manhattan',
    50000,
    false,
    '[{
      "law_id": "ll84",
      "kind": "benchmarking_filing",
      "title": "Smoke LL84 filing",
      "deadline": "2030-05-01T00:00:00Z",
      "fine_estimate_usd": 2000
    }]'::jsonb
  );

  select id into task_id
  from task
  where building_id = new_building_id
    and law_id = 'll84';

  if task_id is null then
    raise exception 'smoke task was not spawned';
  end if;

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  worker_id := register_worker('smoke-worker');
  perform claim_task(worker_id, task_id);
  perform submit_work(worker_id, task_id, 'smoke draft');

  perform set_config(
    'request.jwt.claims',
    '{"sub":"smoke_owner_b","role":"authenticated"}',
    true
  );

  begin
    perform approve(task_id, 'cross-account approval should fail');
    raise exception 'cross-account approval succeeded';
  exception
    when others then
      if sqlerrm not like '%belongs to another account%' then
        raise;
      end if;
  end;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"smoke_owner_a","role":"authenticated"}',
    true
  );
  perform approve(task_id, 'owner approval');
  perform mark_done(task_id, 'filed');

  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);

  begin
    perform approve(task_id, 'service role cannot approve');
    raise exception 'service-role approval succeeded';
  exception
    when others then
      if sqlerrm not like '%workers cannot do this%' then
        raise;
      end if;
  end;
end
$$;

rollback;
