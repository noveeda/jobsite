begin;
select plan(15);

insert into auth.users(id, aud, role, email) values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'b@example.com');
insert into public.jobs(id, user_id, title, company_name, deadline_kind, field_provenance, memo) values
  ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', '원래 제목', '회사', 'unknown', '{}', '원래 메모'),
  ('10000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', '다른 사용자', '회사 B', 'unknown', '{}', '비공개');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

select lives_ok(
  $$select public.update_job_tracking('10000000-0000-4000-8000-00000000000a','applied','새 메모','2026-08-08T00:30:00Z','20000000-0000-4000-8000-000000000001')$$,
  'owner update succeeds'
);
select is((select count(*)::integer from public.job_revisions where job_id = '10000000-0000-4000-8000-00000000000a'), 1, 'revision created');
select is((select snapshot->>'memo' from public.job_revisions where job_id = '10000000-0000-4000-8000-00000000000a' limit 1), '원래 메모', 'old snapshot preserved');
select is((select application_status::text from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), 'applied', 'status persisted');
select is((select next_action_at::text from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), '2026-08-08 00:30:00+00', 'next action persisted');

select throws_ok(
  $$select public.update_job_tracking('10000000-0000-4000-8000-00000000000b','accepted','침범',null,'20000000-0000-4000-8000-000000000001')$$,
  'P0001',
  'job not found',
  'other account update is rejected'
);

select lives_ok(
  format(
    'select public.restore_job_revision(%L,%L,%L)',
    '10000000-0000-4000-8000-00000000000a',
    (select id from public.job_revisions where job_id = '10000000-0000-4000-8000-00000000000a' order by changed_at limit 1),
    '20000000-0000-4000-8000-000000000002'
  ),
  'restore succeeds'
);
select is((select memo from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), '원래 메모', 'memo restored');
select is((select count(*)::integer from public.job_revisions where job_id = '10000000-0000-4000-8000-00000000000a'), 2, 'restore creates another revision');
select ok((select count(*) = 1 from public.job_revisions where job_id = '10000000-0000-4000-8000-00000000000a' and restored_from_revision_id is not null), 'restore source is linked');

select lives_ok(
  $$select public.delete_job('10000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-000000000003')$$,
  'owner delete succeeds'
);
select is((select count(*)::integer from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), 0, 'job is deleted');
select ok((select count(*) = 1 from public.job_revisions where job_id = '10000000-0000-4000-8000-00000000000a' and change_kind = 'delete'), 'delete snapshot retained');

select lives_ok(
  format(
    'select public.restore_job_revision(%L,%L,%L)',
    '10000000-0000-4000-8000-00000000000a',
    (select id from public.job_revisions where job_id = '10000000-0000-4000-8000-00000000000a' and change_kind = 'delete' limit 1),
    '20000000-0000-4000-8000-000000000004'
  ),
  'deleted job can be restored'
);
select is((select memo from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), '원래 메모', 'deleted job data restored');

select * from finish();
rollback;