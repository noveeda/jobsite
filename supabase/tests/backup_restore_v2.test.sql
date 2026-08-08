begin;
select plan(14);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'backup-v2-owner@example.com'),
  ('00000000-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated', 'backup-v2-neighbor@example.com');

insert into public.source_providers(code, display_name, enabled, retention_policy)
values ('backup-v2-fixture', 'Backup v2 fixture', false, '{"retainDays":30}'::jsonb);

insert into public.canonical_jobs(
  id,
  title,
  company_name,
  lifecycle_status,
  last_observed_at,
  field_provenance
)
values (
  '10000000-0000-4000-8000-0000000000c1',
  'Backup source identity fixture',
  'Shared company',
  'active',
  '2026-08-08T00:00:00Z',
  '{}'
);

insert into public.source_postings(
  id,
  provider_code,
  canonical_job_id,
  external_id,
  original_url,
  normalized_url,
  source_values,
  source_status,
  first_observed_at,
  last_observed_at,
  content_fingerprint
)
values (
  '20000000-0000-4000-8000-0000000000c1',
  'backup-v2-fixture',
  '10000000-0000-4000-8000-0000000000c1',
  'backup-source-1',
  'https://example.com/jobs/backup-source-1',
  'https://example.com/jobs/backup-source-1',
  '{"title":"Backup source identity fixture","companyName":"Shared company"}',
  'active',
  '2026-08-01T00:00:00Z',
  '2026-08-08T00:00:00Z',
  encode(digest('{"title":"Backup source identity fixture"}', 'sha256'), 'hex')
);

create temporary table backup_v1_fixture(payload jsonb);
insert into backup_v1_fixture values ($json$
{
  "schemaVersion": 1,
  "generatedAt": "2026-08-08T00:00:00Z",
  "jobs": [],
  "sources": [],
  "duplicatePairs": [],
  "revisions": []
}
$json$::jsonb);

create temporary table backup_v2_fixture(payload jsonb);
insert into backup_v2_fixture values ($json$
{
  "version": 2,
  "exportedAt": "2026-08-09T00:00:00Z",
  "legacy": {
    "schemaVersion": 1,
    "generatedAt": "2026-08-09T00:00:00Z",
    "jobs": [],
    "sources": [],
    "duplicatePairs": [],
    "revisions": []
  },
  "personalStates": [
    {
      "sourceRef": {
        "provider": "backup-v2-fixture",
        "externalId": "backup-source-1",
        "originalUrl": "https://example.com/jobs/backup-source-1"
      },
      "displaySnapshot": {
        "title": "Backup source identity fixture",
        "companyName": "Shared company"
      },
      "saved": true,
      "excluded": false,
      "applicationStatus": "interviewing",
      "memo": "Restored personal memo",
      "nextActionAt": "2026-08-25T09:30:00Z",
      "updatedAt": "2026-08-09T00:00:00Z"
    }
  ],
  "duplicateDecisions": [],
  "manualLinks": []
}
$json$::jsonb);

grant select on table backup_v1_fixture, backup_v2_fixture to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);

select lives_ok(
  $$select public.preview_backup_restore((select payload from backup_v1_fixture))$$,
  'backup v1 preview remains supported after adding v2'
);
select lives_ok(
  $$select public.commit_backup_restore((select payload from backup_v1_fixture), '30000000-0000-4000-8000-0000000000c1')$$,
  'backup v1 commit remains supported after adding v2'
);
reset role;
select is(
  (select count(*)::integer from public.canonical_jobs where id = '10000000-0000-4000-8000-0000000000c1'),
  1,
  'an empty v1 restore leaves the shared catalog unchanged'
);

insert into public.personal_job_states(
  user_id,
  canonical_job_id,
  saved,
  excluded,
  application_status,
  memo
)
values (
  '00000000-0000-4000-8000-0000000000d1',
  '10000000-0000-4000-8000-0000000000c1',
  false,
  true,
  'rejected',
  'Neighbor state must survive'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);

select todo('T047 implements backup v2 after duplicate decisions and legacy links', 1);
select lives_ok(
  $$select public.preview_backup_restore((select payload from backup_v2_fixture))$$,
  'backup v2 preview accepts the versioned personal-state envelope'
);
select is(
  (select count(*)::integer from public.personal_job_states),
  0,
  'backup v2 preview performs no writes'
);
select todo('T047 implements backup v2 after duplicate decisions and legacy links', 7);
select lives_ok(
  $$select public.commit_backup_restore((select payload from backup_v2_fixture), '30000000-0000-4000-8000-0000000000c1')$$,
  'backup v2 commit restores personal state transactionally'
);
select is(
  (select count(*)::integer from public.personal_job_states),
  1,
  'the owner receives exactly one personal state row'
);
select is(
  (
    select concat_ws('|', saved, excluded, application_status, memo, next_action_at)
    from public.personal_job_states
    where canonical_job_id = '10000000-0000-4000-8000-0000000000c1'
  ),
  't|f|interviewing|Restored personal memo|2026-08-25 09:30:00+00',
  'backup v2 restores every personal state value'
);
select is(
  (select canonical_job_id from public.personal_job_states limit 1),
  '10000000-0000-4000-8000-0000000000c1'::uuid,
  'backup v2 resolves provider and externalId to the shared canonical job'
);

select lives_ok(
  $$select public.commit_backup_restore((select payload from backup_v2_fixture), '30000000-0000-4000-8000-0000000000c1')$$,
  'repeating the same backup v2 restore succeeds'
);
select is(
  (select count(*)::integer from public.personal_job_states),
  1,
  'repeating backup v2 restore is idempotent and creates no duplicate overlay row'
);
select is(
  (select memo from public.personal_job_states limit 1),
  'Restored personal memo',
  'repeating backup v2 restore converges on the same personal values'
);
reset role;

select is(
  (select memo from public.personal_job_states
   where user_id = '00000000-0000-4000-8000-0000000000d1'),
  'Neighbor state must survive',
  'one user restore never changes another user personal state'
);
select is(
  (
    select (select count(*) from public.canonical_jobs where id = '10000000-0000-4000-8000-0000000000c1')::text
      || '|'
      || (select count(*) from public.source_postings where id = '20000000-0000-4000-8000-0000000000c1')::text
  ),
  '1|1',
  'personal-state restore neither duplicates nor deletes shared catalog rows'
);

select * from finish();
rollback;
