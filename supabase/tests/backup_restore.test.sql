begin;
select plan(9);

insert into auth.users(id, aud, role, email) values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'b@example.com');
insert into public.jobs(id, user_id, title, company_name, deadline_kind, field_provenance, memo)
values ('10000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', '기존 제목', '기존 회사', 'unknown', '{}', '기존 메모');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

create temporary table backup_fixture(payload jsonb);
insert into backup_fixture values ($json$
{
  "schemaVersion":1,
  "generatedAt":"2026-08-07T00:00:00Z",
  "jobs":[{
    "id":"10000000-0000-4000-8000-00000000000a",
    "title":"복원 제목","companyName":"복원 회사","roleName":null,"summary":null,
    "responsibilities":[],"qualifications":[],"preferredQualifications":[],
    "careerMinYears":null,"careerMaxYears":null,"educationText":null,
    "employmentTypes":[],"locations":[],"salaryText":null,"skills":[],
    "postedAt":null,"deadlineAt":null,"deadlineKind":"unknown",
    "applicationStatus":"applied","memo":"복원 메모","nextActionAt":"2026-08-08T00:00:00Z",
    "duplicateGroupId":null,"fieldProvenance":{},
    "createdAt":"2026-08-01T00:00:00Z","updatedAt":"2026-08-07T00:00:00Z"
  }],
  "sources":[{
    "id":"20000000-0000-4000-8000-00000000000a",
    "jobId":"10000000-0000-4000-8000-00000000000a",
    "provider":"other","connectorMode":"manual","externalId":null,
    "originalUrl":"https://example.com/job/a","status":"unknown",
    "firstObservedAt":"2026-08-01T00:00:00Z","lastCheckedAt":null,"lastSuccessAt":null
  }],
  "duplicatePairs":[],
  "revisions":[{
    "id":"30000000-0000-4000-8000-00000000000a",
    "jobId":"10000000-0000-4000-8000-00000000000a",
    "snapshot":{"memo":"더 이전 메모","application_status":"unreviewed"},
    "changedAt":"2026-08-06T00:00:00Z",
    "deviceId":"40000000-0000-4000-8000-00000000000a",
    "changeKind":"update","restoredFromRevisionId":null
  }]
}
$json$::jsonb);

select lives_ok(
  $$select public.preview_backup_restore((select payload from backup_fixture))$$,
  'validation preview succeeds'
);
select is((select title from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), '기존 제목', 'validation preview performs no writes');

select lives_ok(
  $$select public.commit_backup_restore((select payload from backup_fixture), '50000000-0000-4000-8000-00000000000a')$$,
  'atomic restore succeeds'
);
select is((select memo from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), '복원 메모', 'job memo and schedule are restored');
select ok((select count(*) >= 2 from public.job_revisions where job_id = '10000000-0000-4000-8000-00000000000a'), 'existing state and imported revision are preserved');
select is((select count(*)::integer from public.job_sources where job_id = '10000000-0000-4000-8000-00000000000a'), 1, 'source is restored');

update backup_fixture
set payload = jsonb_set(
  jsonb_set(payload, '{jobs,0,memo}', '"반영되면 안 됨"'),
  '{sources,0,originalUrl}',
  '"http://invalid.example/job"'
);
select throws_ok(
  $$select public.commit_backup_restore((select payload from backup_fixture), '50000000-0000-4000-8000-00000000000a')$$,
  'P0001',
  'invalid source url',
  'mid-restore failure is raised'
);
select is((select memo from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), '복원 메모', 'failed restore rolls back earlier job update');
select is((select count(*)::integer from public.job_sources), 1, 'failed restore leaves child rows unchanged');

select * from finish();
rollback;