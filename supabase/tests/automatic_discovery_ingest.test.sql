begin;
select plan(30);

insert into auth.users(id, aud, role, email)
values ('00000000-0000-4000-8000-000000000181', 'authenticated', 'authenticated', 'ingest-personal@example.com');

insert into public.jobs(
  id, user_id, title, company_name, deadline_kind, application_status, memo, field_provenance
) values (
  '00000000-0000-4000-8000-000000000182',
  '00000000-0000-4000-8000-000000000181',
  '개인 수동 공고', '개인 회사', 'unknown', 'applied', '개인 메모',
  '{"title":{"origin":"user"}}'
);

insert into public.source_providers(
  code, display_name, enabled, access_mode, terms_url, daily_limit,
  attribution, retention_policy, capabilities
) values (
  'fixture-ingest', 'Fixture Ingest', true, 'approved_api',
  'https://fixture-ingest.example.invalid/terms', 500,
  '{"text":"Fixture Ingest","href":"https://fixture-ingest.example.invalid"}',
  '{"allowedSourceFields":["title","companyName","locations"]}',
  '{"scheduled_daily_limit":400}'
);

insert into public.collection_runs(
  id, provider_code, schedule_bucket, run_kind, status, lease_until, started_at
) values (
  '00000000-0000-4000-8000-0000000001a1', 'fixture-ingest',
  '2026-08-08T00:00:00Z', 'bootstrap', 'running', clock_timestamp() + interval '1 hour', clock_timestamp()
);

set local role service_role;
select is(
  (select upserted_count from public.ingest_source_postings(
    'fixture-ingest',
    '00000000-0000-4000-8000-0000000001a1',
    $$[{
      "externalId":"fixture-1",
      "originalUrl":"https://fixture-ingest.example.invalid/jobs/1?utm_source=first",
      "normalizedUrl":"https://fixture-ingest.example.invalid/jobs/1",
      "sourceStatus":"active",
      "fetchedAt":"2026-08-08T00:00:00Z",
      "contentFingerprint":"first-fingerprint",
      "sourceValues":{
        "title":"원천 제목",
        "companyName":"원천 회사",
        "locations":[{"code":"11","label":"서울"}],
        "rawPayload":{"credential":"must-not-persist"}
      },
      "normalized":{"title":"정규화 제목","companyName":"정규화 회사","locations":[{"code":"11","label":"서울"}],"deadlineKind":"unknown"},
      "fieldProvenance":{
        "title":{"sourcePosting":{"providerCode":"fixture-ingest","externalId":"fixture-1"},"origin":"normalized","observedAt":"2026-08-08T00:00:00Z"},
        "companyName":{"sourcePosting":{"providerCode":"fixture-ingest","externalId":"fixture-1"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"},
        "locations":{"sourcePosting":{"providerCode":"fixture-ingest","externalId":"fixture-1"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}
      }
    }]$$::jsonb,
    false,
    false
  )),
  1,
  'initial page ingests one normalized posting'
);
reset role;

select is(
  (select count(*)::integer from public.canonical_jobs where id = (select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1')),
  1,
  'initial ingest creates one canonical job'
);
select is(
  (select count(*)::integer from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  1,
  'initial ingest creates one provider identity'
);
select is(
  (select source_values from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  '{"title":"원천 제목","companyName":"원천 회사","locations":[{"code":"11","label":"서울"}]}'::jsonb,
  'ingest keeps only allowlisted source facts and removes raw payload fields'
);
select is(
  (select title from public.canonical_jobs where id = (select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1')),
  '정규화 제목',
  'canonical value remains distinct from the conflicting source fact'
);
select is(
  (select field_provenance #>> '{title,origin}' from public.canonical_jobs where id = (select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1')),
  'normalized',
  'canonical field keeps its normalization provenance'
);
select is(
  (select field_provenance #>> '{title,sourcePosting,externalId}' from public.canonical_jobs where id = (select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1')),
  'fixture-1',
  'canonical provenance keeps the source posting identity'
);

create temporary table expected_ingest_identity(id uuid) on commit drop;
insert into expected_ingest_identity
select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1';

set local role service_role;
select is(
  (select upserted_count from public.ingest_source_postings(
    'fixture-ingest',
    '00000000-0000-4000-8000-0000000001a1',
    $$[{
      "externalId":"fixture-1",
      "originalUrl":"https://fixture-ingest.example.invalid/jobs/1?utm_source=second",
      "normalizedUrl":"https://fixture-ingest.example.invalid/jobs/1",
      "sourceStatus":"active",
      "fetchedAt":"2026-08-08T00:30:00Z",
      "contentFingerprint":"second-fingerprint",
      "sourceValues":{"title":"원천 제목 2","companyName":"원천 회사 2","locations":[{"code":"26","label":"부산"}]},
      "normalized":{"title":"정규화 제목 2","companyName":"정규화 회사 2","locations":[{"code":"26","label":"부산"}],"deadlineKind":"unknown"},
      "fieldProvenance":{
        "title":{"sourcePosting":{"providerCode":"fixture-ingest","externalId":"fixture-1"},"origin":"normalized","observedAt":"2026-08-08T00:30:00Z"},
        "companyName":{"sourcePosting":{"providerCode":"fixture-ingest","externalId":"fixture-1"},"origin":"source","observedAt":"2026-08-08T00:30:00Z"},
        "locations":{"sourcePosting":{"providerCode":"fixture-ingest","externalId":"fixture-1"},"origin":"source","observedAt":"2026-08-08T00:30:00Z"}
      }
    }]$$::jsonb,
    false,
    false
  )),
  1,
  'reingest upserts the existing provider identity'
);
reset role;

select is(
  (select count(*)::integer from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  1,
  'reingest does not duplicate the source posting'
);
select is(
  (select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  (select id from expected_ingest_identity),
  'reingest preserves the canonical identity'
);
select is(
  (select source_values->>'title' from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  '원천 제목 2',
  'reingest updates the retained source fact'
);
select is(
  (select title from public.canonical_jobs where id = (select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1')),
  '정규화 제목 2',
  'reingest updates the normalized candidate independently'
);

set local role service_role;
select lives_ok(
  $$select public.ingest_source_postings(
    'fixture-ingest',
    '00000000-0000-4000-8000-0000000001a1',
    '[]'::jsonb,
    true,
    false
  )$$,
  'partial snapshot finalization succeeds without closure reconciliation'
);
reset role;

select is(
  (select missing_complete_runs::integer from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  0,
  'partial snapshot omission does not increment the missing counter'
);
select is(
  (select source_status from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  'active',
  'partial snapshot omission keeps the source posting active'
);
select is(
  (select lifecycle_status from public.canonical_jobs where id = (select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1')),
  'active',
  'partial snapshot omission keeps the canonical job active'
);

insert into public.collection_runs(
  id, provider_code, schedule_bucket, run_kind, status, lease_until, started_at
) values (
  '00000000-0000-4000-8000-0000000001a2', 'fixture-ingest',
  '2026-08-08T01:00:00Z', 'reconciliation', 'running', clock_timestamp() + interval '1 hour', clock_timestamp()
);
set local role service_role;
select lives_ok(
  $$select public.ingest_source_postings(
    'fixture-ingest',
    '00000000-0000-4000-8000-0000000001a2',
    '[]'::jsonb,
    true,
    true
  )$$,
  'first complete reconciliation succeeds'
);
reset role;

select is(
  (select missing_complete_runs::integer from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  1,
  'first complete omission increments the missing counter once'
);
select is(
  (select source_status from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  'missing_once',
  'first complete omission marks the source as missing once'
);
select is(
  (select lifecycle_status from public.canonical_jobs where id = (select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1')),
  'stale',
  'first complete omission marks the canonical job stale'
);

insert into public.collection_runs(
  id, provider_code, schedule_bucket, run_kind, status, lease_until, started_at
) values (
  '00000000-0000-4000-8000-0000000001a3', 'fixture-ingest',
  '2026-08-08T02:00:00Z', 'reconciliation', 'running', clock_timestamp() + interval '1 hour', clock_timestamp()
);
set local role service_role;
select lives_ok(
  $$select public.ingest_source_postings(
    'fixture-ingest',
    '00000000-0000-4000-8000-0000000001a3',
    '[]'::jsonb,
    true,
    true
  )$$,
  'second complete reconciliation succeeds'
);
reset role;

select is(
  (select missing_complete_runs::integer from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  2,
  'second complete omission increments the missing counter twice'
);
select is(
  (select source_status from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1'),
  'closed',
  'second complete omission closes the source posting'
);
select is(
  (select lifecycle_status from public.canonical_jobs where id = (select canonical_job_id from public.source_postings where provider_code = 'fixture-ingest' and external_id = 'fixture-1')),
  'closed',
  'second complete omission closes the canonical job'
);
select is(
  (select closed_count from public.collection_runs where id = '00000000-0000-4000-8000-0000000001a3'),
  1,
  'second reconciliation records one newly closed posting'
);

set local role service_role;
select is(
  public.disable_source_provider('fixture-ingest', 'TERMS_WITHDRAWN'),
  true,
  'permission withdrawal disables the provider before purge'
);
select is(
  public.purge_source_provider_data('fixture-ingest', 'TERMS_WITHDRAWN'),
  1,
  'permission-withdrawal purge processes the provider posting'
);
reset role;

select is(
  (
    select (source_values = '{}'::jsonb and source_status = 'withdrawn')
    from public.source_postings
    where provider_code = 'fixture-ingest' and external_id = 'fixture-1'
  ),
  true,
  'purge removes all retained source fields and withdraws the source posting'
);
select is(
  (
    select (
      title = '삭제된 공고'
      and company_name = '비공개 출처'
      and lifecycle_status = 'withdrawn'
      and field_provenance = '{}'::jsonb
    )
    from public.canonical_jobs
    where id = (select id from expected_ingest_identity)
  ),
  true,
  'purge removes provider-derived canonical values and provenance'
);
select is(
  (
    select memo || '|' || application_status::text
    from public.jobs
    where id = '00000000-0000-4000-8000-000000000182'
  ),
  '개인 메모|applied',
  'ingest, closure, and purge leave existing personal memo and application state unchanged'
);

select * from finish();
rollback;
