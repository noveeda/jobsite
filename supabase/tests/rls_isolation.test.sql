begin;
select plan(8);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'b@example.com');

insert into public.jobs(id, user_id, title, company_name, deadline_kind, field_provenance)
values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', 'A job', 'A company', 'unknown', '{}'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', 'B job', 'B company', 'unknown', '{}');

insert into public.job_revisions(user_id, job_id, snapshot, device_id, change_kind)
values ('00000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-00000000000b', '{}', '20000000-0000-4000-8000-00000000000b', 'update');

select is((select relrowsecurity from pg_class where oid = 'public.jobs'::regclass), true, 'jobs has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.job_sources'::regclass), true, 'job_sources has RLS');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

select is((select count(*)::integer from public.jobs), 1, 'A reads only A jobs');
select throws_like(
  $$insert into public.jobs(user_id, title, company_name, deadline_kind, field_provenance) values ('00000000-0000-4000-8000-00000000000b', 'bad', 'bad', 'unknown', '{}')$$,
  '%row-level security%',
  'A cannot insert a B-owned job'
);
with changed as (update public.jobs set title = 'changed' where id = '10000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::integer from changed), 0, 'A cannot update B jobs');
with removed as (delete from public.jobs where id = '10000000-0000-4000-8000-00000000000b' returning 1)
select is((select count(*)::integer from removed), 0, 'A cannot delete B jobs');
select is((select count(*)::integer from public.job_revisions where job_id = '10000000-0000-4000-8000-00000000000b'), 0, 'A cannot read B revisions');
select throws_like(
  $$insert into public.duplicate_groups(user_id) values ('00000000-0000-4000-8000-00000000000b')$$,
  '%row-level security%',
  'A cannot create a B-owned group'
);

select * from finish();
rollback;
