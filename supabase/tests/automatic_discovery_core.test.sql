begin;
select plan(34);

insert into auth.users(id, aud, role, email)
values ('00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'catalog@example.com');

insert into public.account_consents(user_id, terms_version, privacy_version)
values ('00000000-0000-4000-8000-0000000000c1', '2026-08-08', '2026-08-08');

insert into public.source_providers (
  code, display_name, enabled, access_mode, terms_url, daily_limit,
  attribution, retention_policy, capabilities
) values (
  'fixture-core', 'Fixture Core', true, 'approved_api', 'https://fixture.example.invalid/terms', 500,
  '{"text":"Fixture","href":"https://fixture.example.invalid"}',
  '{"allowedSourceFields":["title","companyName"]}',
  '{"scheduled_daily_limit":400}'
);

insert into public.canonical_jobs (
  id, title, company_name, lifecycle_status, last_observed_at, field_provenance
) values (
  '00000000-0000-4000-8000-0000000000d1', '테스트 개발자', '테스트 회사', 'active', now(),
  '{"title":{"sourcePosting":{"providerCode":"fixture-core","externalId":"core-1"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
);

insert into public.source_postings (
  provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint
) values (
  'fixture-core', '00000000-0000-4000-8000-0000000000d1', 'core-1',
  'https://fixture.example.invalid/jobs/1', 'https://fixture.example.invalid/jobs/1',
  '{"title":"테스트 개발자","companyName":"테스트 회사"}', 'active', now(), now(), 'fixture-core-1'
);

select has_table('public', 'source_providers', 'source provider table exists');
select has_table('public', 'canonical_jobs', 'canonical job table exists');
select has_table('public', 'source_postings', 'source posting table exists');
select has_table('public', 'collection_runs', 'collection run table exists');
select has_table('public', 'provider_daily_usage', 'provider quota table exists');

select col_is_pk('public', 'source_providers', 'code', 'provider code is the primary key');
select col_is_pk('public', 'canonical_jobs', 'id', 'canonical job id is the primary key');
select col_is_pk('public', 'source_postings', 'id', 'source posting id is the primary key');
select col_is_pk('public', 'collection_runs', 'id', 'collection run id is the primary key');

select is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'source_providers',
        'canonical_jobs',
        'source_postings',
        'collection_runs',
        'provider_daily_usage'
      )
      and relation.relrowsecurity
  ),
  5,
  'all shared catalog tables enable RLS'
);
select is(
  (
    select count(*)::integer
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'source_providers',
        'canonical_jobs',
        'source_postings',
        'collection_runs',
        'provider_daily_usage'
      )
      and relation.relforcerowsecurity
  ),
  5,
  'all shared catalog tables force RLS'
);

select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'source_providers',
        'canonical_jobs',
        'source_postings',
        'collection_runs',
        'provider_daily_usage'
      )
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')
  ),
  0,
  'browser roles have no shared catalog write grants'
);
select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('source_providers', 'collection_runs', 'provider_daily_usage')
      and grantee in ('PUBLIC', 'anon', 'authenticated')
      and privilege_type = 'SELECT'
  ),
  0,
  'operator tables have no browser read grants'
);

set local role anon;
select throws_like(
  $$select count(*) from public.canonical_jobs$$,
  '%permission denied%',
  'anonymous users cannot read canonical jobs'
);
select throws_like(
  $$select count(*) from public.source_postings$$,
  '%permission denied%',
  'anonymous users cannot read source postings'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);
select is(
  (select count(*)::integer from public.canonical_jobs),
  1,
  'consented users can read eligible canonical jobs without provider operations access'
);
select is(
  (select count(*)::integer from public.source_postings),
  1,
  'consented users can read eligible source facts through the boolean provider helper'
);
select throws_like(
  $$select count(*) from public.source_providers$$,
  '%permission denied%',
  'authenticated users cannot read provider operations data'
);
select throws_like(
  $$select count(*) from public.collection_runs$$,
  '%permission denied%',
  'authenticated users cannot read collection operations data'
);
select throws_like(
  $$select count(*) from public.provider_daily_usage$$,
  '%permission denied%',
  'authenticated users cannot read provider quota data'
);
reset role;

set local role service_role;
select is(
  (select count(*)::integer from public.claim_collection_run('fixture-core', '2026-08-08T00:00:00Z', 'incremental', 60)),
  1,
  'the first due provider claim acquires a lease'
);
select is(
  (select count(*)::integer from public.claim_collection_run('fixture-core', '2026-08-08T01:00:00Z', 'incremental', 60)),
  0,
  'a different schedule bucket cannot claim an active provider lease'
);
reset role;
update public.collection_runs
set lease_until = clock_timestamp() - interval '1 second'
where provider_code = 'fixture-core' and status = 'running';
set local role service_role;
select is(
  (select count(*)::integer from public.claim_collection_run('fixture-core', '2026-08-08T01:00:00Z', 'incremental', 60)),
  1,
  'an expired provider lease is failed and reclaimed safely'
);
reset role;
select is(
  (
    select upserted_count
    from public.ingest_source_postings(
      'fixture-core',
      (select id from public.collection_runs where provider_code = 'fixture-core' and status = 'running'),
      jsonb_build_array(jsonb_build_object(
        'externalId', 'core-2',
        'originalUrl', 'https://fixture.example.invalid/jobs/2?tracking=removed',
        'sourceStatus', 'active',
        'fetchedAt', '2026-08-08T01:00:00Z',
        'sourceValues', jsonb_build_object(
          'title', '수집 개발자',
          'companyName', '수집 회사',
          'rawPayload', 'must-not-persist'
        ),
        'normalized', jsonb_build_object(
          'title', '수집 개발자',
          'companyName', '수집 회사',
          'deadlineKind', 'unknown'
        ),
        'fieldProvenance', jsonb_build_object(
          'title', jsonb_build_object(
            'sourcePosting', jsonb_build_object('providerCode', 'fixture-core', 'externalId', 'core-2'),
            'origin', 'source',
            'observedAt', '2026-08-08T01:00:00Z'
          ),
          'companyName', jsonb_build_object(
            'sourcePosting', jsonb_build_object('providerCode', 'fixture-core', 'externalId', 'core-2'),
            'origin', 'source',
            'observedAt', '2026-08-08T01:00:00Z'
          )
        )
      )),
      true,
      false
    )
  ),
  1,
  'ingest stores one normalized posting through the service-only RPC'
);
reset role;
select is(
  (select source_values from public.source_postings where provider_code = 'fixture-core' and external_id = 'core-2'),
  '{"title":"수집 개발자","companyName":"수집 회사"}'::jsonb,
  'ingest projects source values to the provider retention allowlist'
);

insert into public.source_providers (
  code, display_name, enabled, access_mode, terms_url, attribution, retention_policy, capabilities
) values (
  'fixture-survivor', 'Fixture Survivor', true, 'approved_api', 'https://survivor.example.invalid/terms',
  '{"text":"Survivor","href":"https://survivor.example.invalid"}',
  '{"allowedSourceFields":["title","companyName","careerMinYears","careerMaxYears","deadlineKind"]}',
  '{}'
);
insert into public.source_postings (
  provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint
) values (
  'fixture-survivor',
  (select canonical_job_id from public.source_postings where provider_code = 'fixture-core' and external_id = 'core-2'),
  'survivor-1',
  'https://survivor.example.invalid/jobs/1',
  'https://survivor.example.invalid/jobs/1',
  '{"title":"생존 개발자","companyName":"생존 회사","careerMinYears":"9","careerMaxYears":"2","deadlineKind":"fixed"}',
  'active',
  now(),
  now(),
  'fixture-survivor-1'
);

update public.source_providers
set enabled = false
where code = 'fixture-core';

set local role service_role;
select is(
  (select public.purge_source_provider_data('fixture-core', 'TERMS_WITHDRAWN')),
  2,
  'provider purge processes every retained source posting'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.source_postings
    where provider_code = 'fixture-core'
      and source_values = '{}'::jsonb
      and source_status = 'withdrawn'
  ),
  2,
  'provider purge removes retained source values and withdraws source rows'
);
select is(
  (
    select count(*)::integer
    from public.canonical_jobs
    where title = '삭제된 공고'
      and company_name = '비공개 출처'
      and field_provenance = '{}'::jsonb
      and lifecycle_status = 'withdrawn'
  ),
  1,
  'provider purge redacts canonical fields that lack surviving provenance'
);
select is(
  (
    select count(*)::integer
    from public.canonical_jobs as job
    join public.source_postings as target_posting on target_posting.canonical_job_id = job.id
    where target_posting.provider_code = 'fixture-core'
      and target_posting.external_id = 'core-2'
      and job.title = '생존 개발자'
      and job.company_name = '생존 회사'
      and job.career_min_years is null
      and job.career_max_years is null
      and job.deadline_kind = 'unknown'
      and job.deadline_at is null
      and job.lifecycle_status = 'active'
      and job.field_provenance #>> '{title,sourcePosting,providerCode}' = 'fixture-survivor'
      and not job.field_provenance ? 'careerMinYears'
      and not job.field_provenance ? 'deadlineKind'
  ),
  1,
  'purge preserves safe surviving fields and drops invalid paired career and deadline values'
);

select is(
  (
    select count(*)::integer
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'claim_collection_run',
        'consume_provider_quota',
        'ingest_source_postings',
        'disable_source_provider',
        'purge_source_provider_data'
      )
  ),
  5,
  'all shared catalog security RPCs exist'
);
select is(
  (
    select count(*)::integer
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'claim_collection_run',
        'consume_provider_quota',
        'ingest_source_postings',
        'disable_source_provider',
        'purge_source_provider_data'
      )
      and not exists (
      select 1
      from aclexplode(coalesce(procedure.proacl, acldefault('f', procedure.proowner))) as privilege
      where privilege.grantee = 0
        and privilege.privilege_type = 'EXECUTE'
    )
  ),
  5,
  'public cannot execute shared catalog security RPCs'
);
select is(
  (
    select count(*)::integer
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'claim_collection_run',
        'consume_provider_quota',
        'ingest_source_postings',
        'disable_source_provider',
        'purge_source_provider_data'
      )
      and not has_function_privilege('anon', procedure.oid, 'EXECUTE')
  ),
  5,
  'anonymous users cannot execute shared catalog security RPCs'
);
select is(
  (
    select count(*)::integer
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'claim_collection_run',
        'consume_provider_quota',
        'ingest_source_postings',
        'disable_source_provider',
        'purge_source_provider_data'
      )
      and not has_function_privilege('authenticated', procedure.oid, 'EXECUTE')
  ),
  5,
  'authenticated users cannot execute shared catalog security RPCs'
);
select is(
  (
    select count(*)::integer
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'claim_collection_run',
        'consume_provider_quota',
        'ingest_source_postings',
        'disable_source_provider',
        'purge_source_provider_data'
      )
      and has_function_privilege('service_role', procedure.oid, 'EXECUTE')
  ),
  5,
  'service role can execute every shared catalog security RPC'
);

select * from finish();
rollback;
