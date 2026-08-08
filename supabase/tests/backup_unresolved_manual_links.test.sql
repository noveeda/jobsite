begin;

select plan(20);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000b11', 'authenticated', 'authenticated', 'unresolved-link-owner@example.com'),
  ('00000000-0000-4000-8000-000000000b12', 'authenticated', 'authenticated', 'unresolved-link-neighbor@example.com');

insert into public.source_providers(code, display_name, enabled, retention_policy)
values ('unresolved-link-fixture', 'Unresolved link fixture', false, '{"retainDays":30}'::jsonb);

create temporary table unresolved_link_backup(payload jsonb);
insert into unresolved_link_backup values ($json$
{
  "version": 2,
  "exportedAt": "2026-08-09T00:00:00Z",
  "legacy": {
    "schemaVersion": 1,
    "generatedAt": "2026-08-09T00:00:00Z",
    "jobs": [{
      "id":"30000000-0000-4000-8000-000000000b11",
      "title":"Restored private manual job","companyName":"Private company","roleName":null,"summary":null,
      "responsibilities":[],"qualifications":[],"preferredQualifications":[],
      "careerMinYears":null,"careerMaxYears":null,"educationText":null,
      "employmentTypes":[],"locations":[],"salaryText":null,"skills":[],
      "postedAt":null,"deadlineAt":null,"deadlineKind":"unknown",
      "applicationStatus":"applied","memo":"Keep private link","nextActionAt":null,
      "duplicateGroupId":null,"fieldProvenance":{},"createdAt":"2026-08-09T00:00:00Z","updatedAt":"2026-08-09T00:00:00Z"
    }],
    "sources": [], "duplicatePairs": [], "revisions": []
  },
  "personalStates": [], "duplicateDecisions": [],
  "manualLinks": [{
    "legacyJobId":"30000000-0000-4000-8000-000000000b11",
    "sourceRef":{"provider":"unresolved-link-fixture","externalId":"late-source","originalUrl":"https://example.com/jobs/late-source"}
  }]
}
$json$::jsonb);

grant select on table unresolved_link_backup to authenticated;

select has_table('public', 'unresolved_manual_catalog_links', 'missing manual links have dedicated private storage');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.unresolved_manual_catalog_links'::regclass),
  true,
  'unresolved manual link table forces RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.unresolved_manual_catalog_links', 'SELECT')
  and not has_table_privilege('authenticated', 'public.unresolved_manual_catalog_links', 'INSERT')
  and not has_table_privilege('service_role', 'public.unresolved_manual_catalog_links', 'INSERT'),
  'private unresolved manual links expose no direct browser or service DML'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000b11', true);
select lives_ok(
  $$select public.commit_backup_restore((select payload from unresolved_link_backup), '40000000-0000-4000-8000-000000000b11')$$,
  'v2 restore accepts a manual link whose source is currently absent'
);
reset role;
select is(
  (select count(*)::integer from public.unresolved_manual_catalog_links where user_id = '00000000-0000-4000-8000-000000000b11'),
  1,
  'missing source identity is retained privately instead of dropped'
);
select is(
  (select count(*)::integer from public.manual_catalog_links where user_id = '00000000-0000-4000-8000-000000000b11'),
  0,
  'missing source creates no resolved shared catalog link'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000b11', true);
select is(
  public.export_backup_v2_overlays() #>> '{manualLinks,0,sourceRef,externalId}',
  'late-source',
  'unresolved manual link round-trips through v2 export'
);
reset role;

select is(
  (select count(*)::integer from public.canonical_jobs),
  0,
  'preserving an unresolved manual link never creates a shared canonical job'
);

insert into public.canonical_jobs(
  id, title, company_name, lifecycle_status, last_observed_at, field_provenance
) values (
  '10000000-0000-4000-8000-000000000b11',
  'Late source', 'Shared company', 'active', '2026-08-09T00:00:00Z', '{}'
);
insert into public.source_postings(
  id, provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint
) values (
  '20000000-0000-4000-8000-000000000b11',
  'unresolved-link-fixture', '10000000-0000-4000-8000-000000000b11', 'late-source',
  'https://example.com/jobs/late-source', 'https://example.com/jobs/late-source',
  '{"title":"Late source"}', 'closed', '2026-08-09T00:00:00Z', '2026-08-09T00:00:00Z', 'unresolved-link-fixture-late-source'
);

select is(
  (select count(*)::integer from public.unresolved_manual_catalog_links where user_id = '00000000-0000-4000-8000-000000000b11'),
  1,
  'an inactive source remains privately unresolved'
);
select is(
  (select count(*)::integer from public.manual_catalog_links where user_id = '00000000-0000-4000-8000-000000000b11'),
  0,
  'an inactive source does not create a resolved catalog link'
);

update public.source_postings
set source_status = 'active'
where id = '20000000-0000-4000-8000-000000000b11';

select is(
  (select count(*)::integer from public.manual_catalog_links where user_id = '00000000-0000-4000-8000-000000000b11'),
  1,
  'an exact source becoming active automatically reconciles the manual link'
);
select is(
  (select count(*)::integer from public.unresolved_manual_catalog_links where user_id = '00000000-0000-4000-8000-000000000b11'),
  0,
  'reconciliation removes only the fulfilled private unresolved link'
);
select is(
  (select source_posting_id from public.manual_catalog_links where user_id = '00000000-0000-4000-8000-000000000b11'),
  '20000000-0000-4000-8000-000000000b11'::uuid,
  'reconciliation uses the exact source identity rather than a canonical guess'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000b11', true);
select lives_ok(
  $$select public.commit_backup_restore((select payload from unresolved_link_backup), '40000000-0000-4000-8000-000000000b11')$$,
  'restoring a now-active source still succeeds'
);
reset role;
select is(
  (select count(*)::integer from public.unresolved_manual_catalog_links where user_id = '00000000-0000-4000-8000-000000000b11'),
  0,
  'restoring a live identity leaves no stale unresolved manual link'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000b11', true);
select is(
  public.export_backup_v2_overlays() #>> '{manualLinks,0,sourceRef,externalId}',
  'late-source',
  'resolved manual link keeps the same portable identity on export'
);
select throws_like(
  $$insert into public.unresolved_manual_catalog_links(user_id, manual_job_id, provider_code, external_id, original_url) values ('00000000-0000-4000-8000-000000000b11', '30000000-0000-4000-8000-000000000b11', 'unresolved-link-fixture', 'bypass', 'https://example.com/jobs/bypass')$$,
  '%permission denied for table unresolved_manual_catalog_links%',
  'an authenticated owner cannot bypass the restore path with direct DML'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000b12', true);
select is(
  public.export_backup_v2_overlays() -> 'manualLinks',
  '[]'::jsonb,
  'a neighbor cannot export another owner unresolved or resolved manual link'
);
reset role;

select is(
  (select count(*)::integer from public.canonical_jobs),
  1,
  'automatic reconciliation never duplicates shared catalog rows'
);
select is(
  (select count(*)::integer from public.source_postings),
  1,
  'automatic reconciliation never duplicates source postings'
);

select * from finish();
rollback;
