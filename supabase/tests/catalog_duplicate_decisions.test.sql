begin;
select plan(25);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000401', 'authenticated', 'authenticated', 'duplicate-a@example.com'),
  ('00000000-0000-4000-8000-000000000402', 'authenticated', 'authenticated', 'duplicate-b@example.com');

insert into public.source_providers(code, display_name, enabled, access_mode, terms_url, attribution, retention_policy)
values
  ('dup-one', 'Duplicate one', true, 'approved_api', 'https://one.example.com/terms', '{"text":"one"}', '{"allowedSourceFields":["title"]}'),
  ('dup-two', 'Duplicate two', true, 'approved_api', 'https://two.example.com/terms', '{"text":"two"}', '{"allowedSourceFields":["title"]}');

insert into public.collection_runs(id, provider_code, schedule_bucket, run_kind, status, snapshot_complete, started_at, finished_at)
values
  ('30000000-0000-4000-8000-000000000401', 'dup-one', '2026-08-09T00:00:00Z', 'reconciliation', 'succeeded', true, '2026-08-09T00:00:00Z', '2026-08-09T00:01:00Z'),
  ('30000000-0000-4000-8000-000000000402', 'dup-two', '2026-08-09T00:00:00Z', 'reconciliation', 'succeeded', true, '2026-08-09T00:00:00Z', '2026-08-09T00:01:00Z');

insert into public.canonical_jobs(id, title, company_name, lifecycle_status, last_observed_at, field_provenance)
values
  ('10000000-0000-4000-8000-000000000401', 'Duplicate left', 'Shared company', 'active', '2026-08-09T00:00:00Z', '{}'),
  ('10000000-0000-4000-8000-000000000402', 'Duplicate right', 'Shared company', 'active', '2026-08-09T00:00:00Z', '{}');

insert into public.source_postings(id, provider_code, canonical_job_id, external_id, original_url, normalized_url, source_values, source_status, first_observed_at, last_observed_at, last_collection_run_id, content_fingerprint)
values
  ('20000000-0000-4000-8000-000000000401', 'dup-one', '10000000-0000-4000-8000-000000000401', 'left-1', 'https://one.example.com/jobs/left-1', 'https://one.example.com/jobs/left-1', '{"title":"Duplicate left"}', 'active', '2026-08-09T00:00:00Z', '2026-08-09T00:00:00Z', '30000000-0000-4000-8000-000000000401', 'left'),
  ('20000000-0000-4000-8000-000000000402', 'dup-two', '10000000-0000-4000-8000-000000000402', 'right-1', 'https://two.example.com/jobs/right-1', 'https://two.example.com/jobs/right-1', '{"title":"Duplicate right"}', 'active', '2026-08-09T00:00:00Z', '2026-08-09T00:00:00Z', '30000000-0000-4000-8000-000000000402', 'right');

insert into public.account_consents(user_id, terms_version, privacy_version)
values
  ('00000000-0000-4000-8000-000000000401', '2026-08-07', '2026-08-07'),
  ('00000000-0000-4000-8000-000000000402', '2026-08-07', '2026-08-07');

select has_table('public', 'catalog_duplicate_candidates', 'shared candidates are additive catalog facts');
select has_table('public', 'catalog_duplicate_decisions', 'effective decisions are owner-scoped');
select has_table('public', 'catalog_duplicate_decision_events', 'decision history is append-only');
select has_table('public', 'catalog_duplicate_issue_reports', 'issue reports are persisted privately');
select is((select relforcerowsecurity from pg_class where oid = 'public.catalog_duplicate_decisions'::regclass), true, 'effective decisions force RLS');
select is((select relforcerowsecurity from pg_class where oid = 'public.catalog_duplicate_decision_events'::regclass), true, 'event history forces RLS');
select ok(not has_table_privilege('authenticated', 'public.catalog_duplicate_candidates', 'INSERT'), 'browser role has no candidate DML');
select ok(not has_table_privilege('authenticated', 'public.catalog_duplicate_decisions', 'INSERT'), 'browser role has no direct decision DML');
select ok(not has_table_privilege('authenticated', 'public.catalog_duplicate_decision_events', 'INSERT'), 'browser role has no direct audit DML');
select ok(not has_table_privilege('authenticated', 'public.catalog_duplicate_issue_reports', 'INSERT'), 'browser role has no direct report DML');
select ok(
  has_table_privilege('service_role', 'public.catalog_duplicate_candidates', 'INSERT')
  and has_table_privilege('service_role', 'public.catalog_duplicate_candidates', 'UPDATE'),
  'service role can maintain shared candidate evidence'
);

insert into public.catalog_duplicate_candidates(id, left_canonical_job_id, right_canonical_job_id, left_source_posting_id, right_source_posting_id, left_generation_id, right_generation_id, score, reasons)
values ('40000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000402', '30000000-0000-4000-8000-000000000401', '30000000-0000-4000-8000-000000000402', 0.90, '["title_company"]');

select throws_like(
  $$insert into public.catalog_duplicate_candidates(left_canonical_job_id, right_canonical_job_id, left_source_posting_id, right_source_posting_id, left_generation_id, right_generation_id, score, reasons) values ('10000000-0000-4000-8000-000000000402', '10000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000402', '20000000-0000-4000-8000-000000000401', '30000000-0000-4000-8000-000000000402', '30000000-0000-4000-8000-000000000401', 0.9, '["title_company"]')$$,
  '%catalog_duplicate_candidates_pair_order_check%',
  'reversed candidate identity is rejected'
);
select throws_like(
  $$insert into public.catalog_duplicate_candidates(left_canonical_job_id, right_canonical_job_id, left_source_posting_id, right_source_posting_id, left_generation_id, right_generation_id, score, reasons) values ('10000000-0000-4000-8000-000000000401', '10000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000401', '20000000-0000-4000-8000-000000000401', '30000000-0000-4000-8000-000000000401', '30000000-0000-4000-8000-000000000401', 0.9, '["title_company"]')$$,
  '%catalog_duplicate_candidates_distinct_jobs_check%',
  'self candidate is rejected'
);
select throws_like(
  $$update public.catalog_duplicate_candidates set reasons = '{}'::jsonb where id = '40000000-0000-4000-8000-000000000401'$$,
  '%invalid duplicate candidate reasons%',
  'object-shaped reasons fail safely without calling an array function on an object'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);
select is(
  (public.set_catalog_duplicate_decision('40000000-0000-4000-8000-000000000401', 'merge', '50000000-0000-4000-8000-000000000401', 0, '{}'::jsonb)->>'status'),
  'merged',
  'owner can confirm a candidate through the hardened RPC'
);
select is(
  (public.set_catalog_duplicate_decision('40000000-0000-4000-8000-000000000401', 'merge', '50000000-0000-4000-8000-000000000401', 0, '{}'::jsonb)->>'replayed'),
  'true',
  'the same operation id is replay-safe'
);
select throws_like(
  $$select public.set_catalog_duplicate_decision('40000000-0000-4000-8000-000000000401', 'separate', '50000000-0000-4000-8000-000000000401', 1, '{}'::jsonb)$$,
  '%operation id%',
  'an operation id cannot be reused with a different immutable payload'
);
reset role;

insert into public.collection_runs(id, provider_code, schedule_bucket, run_kind, status, lease_until, started_at)
values (
  '30000000-0000-4000-8000-000000000403', 'dup-one', '2026-08-10T00:00:00Z',
  'reconciliation', 'running', clock_timestamp() + interval '1 hour', clock_timestamp()
);
set local role service_role;
select lives_ok(
  $ingest$select public.ingest_source_postings(
    'dup-one',
    '30000000-0000-4000-8000-000000000403',
    $payload$[{
      "externalId":"left-1",
      "originalUrl":"https://one.example.com/jobs/left-1",
      "sourceStatus":"active",
      "fetchedAt":"2026-08-10T00:00:00Z",
      "contentFingerprint":"left-refresh",
      "sourceValues":{"title":"Duplicate right"},
      "normalized":{"title":"Duplicate right","companyName":"Shared company","deadlineKind":"unknown"},
      "fieldProvenance":{}
    }]$payload$::jsonb,
    true,
    true
  )$ingest$,
  'complete reconciliation finalizes and refreshes duplicate evidence atomically'
);
reset role;
select is(
  (select evidence_revision from public.catalog_duplicate_candidates where id = '40000000-0000-4000-8000-000000000401'),
  2,
  'complete refresh supersedes only the changed candidate evidence revision'
);
select is(
  (select left_generation_id from public.catalog_duplicate_candidates where id = '40000000-0000-4000-8000-000000000401'),
  '30000000-0000-4000-8000-000000000403'::uuid,
  'refreshed evidence records the endpoint current complete reconciliation generation'
);
select is(
  (select count(*)::integer from public.catalog_duplicate_candidates),
  1,
  'complete refresh updates the ordered candidate pair instead of creating a retry duplicate'
);

select has_function('public', 'get_catalog_duplicate_detail', 'the safe duplicate-detail companion RPC is available');
select ok(
  has_function_privilege('authenticated', 'public.get_catalog_duplicate_detail(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_catalog_duplicate_detail(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.get_catalog_duplicate_detail(uuid)', 'EXECUTE'),
  'only authenticated users can execute the duplicate-detail companion RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000401', true);
select is(
  public.get_catalog_duplicate_detail('10000000-0000-4000-8000-000000000401')#>>'{candidates,0,sources,0,originalUrl}',
  'https://one.example.com/jobs/left-1',
  'duplicate detail returns the verified endpoint source link'
);
select is(
  public.get_catalog_duplicate_detail('10000000-0000-4000-8000-000000000401')#>>'{candidates,0,currentUser,decision}',
  'merged',
  'duplicate detail exposes only the caller decision'
);
reset role;

select * from finish();
rollback;
