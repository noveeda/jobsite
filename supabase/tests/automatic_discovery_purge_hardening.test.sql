begin;
select plan(47);

insert into auth.users(id, aud, role, email)
values (
  '00000000-0000-4000-8000-0000000002a1',
  'authenticated',
  'authenticated',
  'purge-personal-state@example.com'
);

insert into public.source_providers (
  code, display_name, enabled, access_mode, terms_url, attribution, retention_policy, capabilities
) values
  (
    'purge-disabled', 'Purge Disabled', false, 'approved_api',
    'https://purge-disabled.example.invalid/terms',
    '{"text":"Purge Disabled","href":"https://purge-disabled.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":30}', '{}'
  ),
  (
    'purge-expired', 'Purge Expired', true, 'approved_api',
    'https://purge-expired.example.invalid/terms',
    '{"text":"Purge Expired","href":"https://purge-expired.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":1}', '{}'
  ),
  (
    'purge-neighbor', 'Purge Neighbor', true, 'approved_api',
    'https://purge-neighbor.example.invalid/terms',
    '{"text":"Purge Neighbor","href":"https://purge-neighbor.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":30}', '{}'
  ),
  (
    'purge-mixed', 'Purge Mixed', false, 'approved_api',
    'https://purge-mixed.example.invalid/terms',
    '{"text":"Purge Mixed","href":"https://purge-mixed.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":30}', '{}'
  ),
  (
    'purge-canonical-only', 'Purge Canonical Only', false, 'approved_api',
    'https://purge-canonical-only.example.invalid/terms',
    '{"text":"Purge Canonical Only","href":"https://purge-canonical-only.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":30}', '{}'
  ),
  (
    'purge-complete', 'Purge Complete', false, 'approved_api',
    'https://purge-complete.example.invalid/terms',
    '{"text":"Purge Complete","href":"https://purge-complete.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":30}', '{}'
  ),
  (
    'purge-survivor-target', 'Purge Survivor Target', false, 'approved_api',
    'https://purge-survivor-target.example.invalid/terms',
    '{"text":"Purge Survivor Target","href":"https://purge-survivor-target.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":30}', '{}'
  ),
  (
    'purge-dangling', 'Purge Dangling', false, 'approved_api',
    'https://purge-dangling.example.invalid/terms',
    '{"text":"Purge Dangling","href":"https://purge-dangling.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":30}', '{}'
  ),
  (
    'purge-atomic', 'Purge Atomic', false, 'approved_api',
    'https://purge-atomic.example.invalid/terms',
    '{"text":"Purge Atomic","href":"https://purge-atomic.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":30}', '{}'
  ),
  (
    'purge-enabled-canonical', 'Purge Enabled Canonical', true, 'approved_api',
    'https://purge-enabled-canonical.example.invalid/terms',
    '{"text":"Purge Enabled Canonical","href":"https://purge-enabled-canonical.example.invalid"}',
    '{"allowedSourceFields":["title"],"retentionDays":30}', '{}'
  );

insert into public.canonical_jobs (
  id, title, company_name, lifecycle_status, last_observed_at, field_provenance
) values
  (
    '00000000-0000-4000-8000-000000000251', 'Disabled Job', 'Fixture Company', 'active', now(),
    '{"title":{"sourcePosting":{"providerCode":"purge-disabled","externalId":"disabled-1"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000252', 'Expired Job', 'Fixture Company', 'active', now() - interval '2 days',
    '{"title":{"sourcePosting":{"providerCode":"purge-expired","externalId":"expired-1"},"origin":"source","observedAt":"2026-08-06T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000253', 'Neighbor Job', 'Fixture Company', 'active', now(),
    '{"title":{"sourcePosting":{"providerCode":"purge-neighbor","externalId":"neighbor-1"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000254', 'Mixed Status Job', 'Fixture Company', 'active', now(),
    '{"title":{"sourcePosting":{"providerCode":"purge-mixed","externalId":"mixed-status"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000255', 'Mixed Values Job', 'Fixture Company', 'active', now(),
    '{"title":{"sourcePosting":{"providerCode":"purge-mixed","externalId":"mixed-values"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000256', 'Mixed Canonical Job', 'Fixture Company', 'active', now(),
    '{"title":{"sourcePosting":{"providerCode":"purge-mixed","externalId":"mixed-complete"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000257', 'Canonical Only Job', 'Fixture Company', 'active', now(),
    '{"title":{"sourcePosting":{"providerCode":"purge-canonical-only","externalId":"canonical-only"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000258', '삭제된 공고', '비공개 출처', 'withdrawn', now(), '{}'
  ),
  (
    '00000000-0000-4000-8000-000000000259', 'Target Survivor Job', 'Target Company', 'stale', now(),
    '{"title":{"sourcePosting":{"providerCode":"purge-survivor-target","externalId":"survivor-target"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"},"postedAt":{"sourcePosting":{"providerCode":"purge-survivor-target","externalId":"survivor-target"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"},"locations":{"sourcePosting":{"providerCode":"purge-survivor-target","externalId":"survivor-target"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"},"employmentTypes":{"sourcePosting":{"providerCode":"purge-survivor-target","externalId":"survivor-target"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"},"jobCategories":{"sourcePosting":{"providerCode":"purge-survivor-target","externalId":"survivor-target"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000260', 'Dangling Job', 'Dangling Company', 'active', now(),
    '{"title":{"sourcePosting":{"providerCode":"purge-dangling","externalId":"missing-posting"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000261', 'Atomic Job', 'Atomic Company', 'active', now(),
    '{"careerMinYears":{"sourcePosting":{"providerCode":"purge-atomic","externalId":"atomic"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"},"careerMaxYears":{"sourcePosting":{"providerCode":"purge-atomic","externalId":"atomic"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"},"deadlineKind":{"sourcePosting":{"providerCode":"purge-atomic","externalId":"atomic"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"},"deadlineAt":{"sourcePosting":{"providerCode":"purge-atomic","externalId":"atomic"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  ),
  (
    '00000000-0000-4000-8000-000000000262', '삭제된 공고', '비공개 출처', 'withdrawn', now(), '{}'
  ),
  (
    '00000000-0000-4000-8000-000000000263', 'Enabled Canonical Job', 'Enabled Company', 'active', now(),
    '{"title":{"sourcePosting":{"providerCode":"purge-enabled-canonical","externalId":"enabled-canonical"},"origin":"source","observedAt":"2026-08-08T00:00:00Z"}}'
  );

update public.canonical_jobs
set career_min_years = 3,
    career_max_years = 5,
    deadline_kind = 'fixed',
    deadline_at = now() + interval '7 days'
where id = '00000000-0000-4000-8000-000000000261';

update public.canonical_jobs
set posted_at = '2026-08-01T00:00:00Z',
    locations = array['기존 지역'],
    employment_types = array['기존 고용'],
    job_categories = array['기존 직무']
where id = '00000000-0000-4000-8000-000000000259';

insert into public.source_postings (
  provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint, updated_at
) values
  (
    'purge-disabled', '00000000-0000-4000-8000-000000000251', 'disabled-1',
    'https://purge-disabled.example.invalid/jobs/1', 'https://purge-disabled.example.invalid/jobs/1',
    '{"title":"Disabled Job","nested":{"token":"secret","deep":{"apiKey":"secret"}}}',
    'active', now(), now(), 'purge-disabled-fingerprint', now()
  ),
  (
    'purge-expired', '00000000-0000-4000-8000-000000000252', 'expired-1',
    'https://purge-expired.example.invalid/jobs/1', 'https://purge-expired.example.invalid/jobs/1',
    '{"title":"Expired Job"}', 'active', now() - interval '2 days', now() - interval '2 days',
    'purge-expired-fingerprint', now() - interval '2 days'
  ),
  (
    'purge-neighbor', '00000000-0000-4000-8000-000000000253', 'neighbor-1',
    'https://purge-neighbor.example.invalid/jobs/1', 'https://purge-neighbor.example.invalid/jobs/1',
    '{"title":"Neighbor Job"}', 'active', now(), now(), 'purge-neighbor-fingerprint', now()
  ),
  (
    'purge-mixed', '00000000-0000-4000-8000-000000000254', 'mixed-status',
    'https://purge-mixed.example.invalid/jobs/status', 'https://purge-mixed.example.invalid/jobs/status',
    '{}', 'active', now(), now(), 'purge-mixed-status-fingerprint', '2026-08-01T00:00:00Z'
  ),
  (
    'purge-mixed', '00000000-0000-4000-8000-000000000255', 'mixed-values',
    'https://purge-mixed.example.invalid/jobs/values', 'https://purge-mixed.example.invalid/jobs/values',
    '{"title":"Mixed Values Job"}', 'withdrawn', now(), now(), 'purge-mixed-values-fingerprint', '2026-08-01T00:00:00Z'
  ),
  (
    'purge-mixed', '00000000-0000-4000-8000-000000000256', 'mixed-complete',
    'https://purge-mixed.example.invalid/jobs/complete', 'https://purge-mixed.example.invalid/jobs/complete',
    '{}', 'withdrawn', now(), now(), encode(extensions.digest('{}', 'sha256'), 'hex'), '2026-08-01T00:00:00Z'
  ),
  (
    'purge-mixed', '00000000-0000-4000-8000-000000000262', 'mixed-technical',
    'https://purge-mixed.example.invalid/jobs/technical', 'https://purge-mixed.example.invalid/jobs/technical',
    '{}', 'withdrawn', now(), now(), 'wrong-technical-fingerprint', '2026-08-01T00:00:00Z'
  ),
  (
    'purge-canonical-only', '00000000-0000-4000-8000-000000000257', 'canonical-only',
    'https://purge-canonical-only.example.invalid/jobs/1', 'https://purge-canonical-only.example.invalid/jobs/1',
    '{}', 'withdrawn', now(), now(), encode(extensions.digest('{}', 'sha256'), 'hex'), '2026-08-01T00:00:00Z'
  ),
  (
    'purge-complete', '00000000-0000-4000-8000-000000000258', 'complete',
    'https://purge-complete.example.invalid/jobs/1', 'https://purge-complete.example.invalid/jobs/1',
    '{}', 'withdrawn', now(), now(), encode(extensions.digest('{}', 'sha256'), 'hex'), '2026-08-01T00:00:00Z'
  ),
  (
    'purge-survivor-target', '00000000-0000-4000-8000-000000000259', 'survivor-target',
    'https://purge-survivor-target.example.invalid/jobs/1', 'https://purge-survivor-target.example.invalid/jobs/1',
    '{"title":"Target Survivor Job"}', 'active', now() - interval '3 hours', now() - interval '3 hours',
    'purge-survivor-target-fingerprint', '2026-08-01T00:00:00Z'
  ),
  (
    'purge-neighbor', '00000000-0000-4000-8000-000000000259', 'survivor-active',
    'https://purge-neighbor.example.invalid/jobs/survivor-active', 'https://purge-neighbor.example.invalid/jobs/survivor-active',
    '{"title":"","companyName":"Active Survivor","postedAt":"not-a-date","locations":"서울","employmentTypes":{"label":"정규직"},"jobCategories":{"label":"개발"}}', 'active', now() - interval '2 hours', now() - interval '2 hours',
    'purge-survivor-active-fingerprint', now()
  ),
  (
    'purge-neighbor', '00000000-0000-4000-8000-000000000259', 'survivor-missing',
    'https://purge-neighbor.example.invalid/jobs/survivor-missing', 'https://purge-neighbor.example.invalid/jobs/survivor-missing',
    '{"title":"Missing Survivor Title","companyName":"Missing Survivor","postedAt":"2026-07-15T09:00:00Z","locations":[{"label":"서울"},"경기"],"employmentTypes":["정규직","계약직"],"jobCategories":[{"label":"개발"},"백엔드"]}', 'missing_once', now() - interval '1 hour', now() - interval '1 hour',
    'purge-survivor-missing-fingerprint', now()
  ),
  (
    'purge-atomic', '00000000-0000-4000-8000-000000000261', 'atomic',
    'https://purge-atomic.example.invalid/jobs/1', 'https://purge-atomic.example.invalid/jobs/1',
    '{}', 'withdrawn', now(), now(), encode(extensions.digest('{}', 'sha256'), 'hex'), '2026-08-01T00:00:00Z'
  ),
  (
    'purge-enabled-canonical', '00000000-0000-4000-8000-000000000263', 'enabled-canonical',
    'https://purge-enabled-canonical.example.invalid/jobs/1', 'https://purge-enabled-canonical.example.invalid/jobs/1',
    '{}', 'withdrawn', now(), now(), encode(extensions.digest('{}', 'sha256'), 'hex'), '2026-08-01T00:00:00Z'
  );

update public.source_postings
set missing_complete_runs = 2
where provider_code = 'purge-mixed' and external_id = 'mixed-technical';

insert into public.personal_job_states(
  user_id,
  canonical_job_id,
  saved,
  application_status,
  memo
)
values (
  '00000000-0000-4000-8000-0000000002a1',
  '00000000-0000-4000-8000-000000000259',
  true,
  'applied',
  'Purge must preserve this memo'
);

select ok((
  select procedure.prosecdef
    and procedure.proconfig @> array['search_path=pg_catalog, public']::text[]
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'purge_source_provider_data'
), 'purge wrapper is SECURITY DEFINER with the approved search_path');
select ok(
  has_function_privilege('service_role', 'public.purge_source_provider_data(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.purge_source_provider_data(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.purge_source_provider_data(text,text)', 'EXECUTE'),
  'only service_role can execute the purge wrapper'
);
select ok(
  not has_function_privilege('service_role', 'public.purge_source_provider_data_unchecked(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.purge_source_provider_data_unchecked(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.purge_source_provider_data_unchecked(text,text)', 'EXECUTE'),
  'the unchecked purge function is not executable by API roles'
);

set local role service_role;
select throws_ok(
  $$select public.purge_source_provider_data('purge-neighbor', 'RETENTION_EXPIRED')$$,
  '55000',
  'provider retention is not expired',
  'enabled provider with unexpired retained data is rejected'
);
reset role;

select is(
  (select source_values->>'title' from public.source_postings where provider_code = 'purge-neighbor' and external_id = 'neighbor-1'),
  'Neighbor Job',
  'failed unexpired purge leaves the target fixture unchanged'
);

set local role service_role;
select is(
  public.purge_source_provider_data('purge-disabled', 'TERMS_WITHDRAWN'),
  1,
  'disabled provider is purged immediately'
);
reset role;

select is(
  (select source_status from public.source_postings where provider_code = 'purge-disabled' and external_id = 'disabled-1'),
  'withdrawn',
  'disabled provider posting is withdrawn'
);
select is(
  (select source_values from public.source_postings where provider_code = 'purge-disabled' and external_id = 'disabled-1'),
  '{}'::jsonb,
  'nested sensitive values are completely scrubbed'
);

set local role service_role;
select is(
  public.purge_source_provider_data('purge-disabled', 'TERMS_WITHDRAWN'),
  0,
  'second purge of an already scrubbed provider is a no-op'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.collection_runs
    where provider_code = 'purge-disabled' and error_summary = 'purge:TERMS_WITHDRAWN'
  ),
  1,
  'second no-op purge does not create another audit run'
);

set local role service_role;
select is(
  public.purge_source_provider_data('purge-expired', 'RETENTION_EXPIRED'),
  1,
  'enabled provider is purgeable after every retained row expires'
);
reset role;
select is(
  (select source_values from public.source_postings where provider_code = 'purge-expired' and external_id = 'expired-1'),
  '{}'::jsonb,
  'expired provider data is scrubbed'
);
select is(
  (select source_values->>'title' from public.source_postings where provider_code = 'purge-neighbor' and external_id = 'neighbor-1'),
  'Neighbor Job',
  'purge remains scoped to the requested provider fixture'
);

set local role service_role;
select is(
  public.purge_source_provider_data('purge-mixed', 'TERMS_WITHDRAWN'),
  3,
  'mixed purge returns the exact number of incomplete source rows'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.source_postings
    where provider_code = 'purge-mixed'
      and source_status = 'withdrawn'
      and source_values = '{}'::jsonb
  ),
  4,
  'mixed purge completes every source postcondition'
);
select is(
  (
    select count(*)::integer
    from public.source_postings
    where provider_code = 'purge-mixed'
      and external_id in ('mixed-status', 'mixed-values', 'mixed-technical')
      and updated_at > '2026-08-01T00:00:00Z'::timestamptz
  ),
  3,
  'only incomplete mixed source rows are updated'
);
select is(
  (
    select missing_complete_runs::text || '|' || content_fingerprint
    from public.source_postings
    where provider_code = 'purge-mixed' and external_id = 'mixed-technical'
  ),
  '0|' || encode(extensions.digest('{}', 'sha256'), 'hex'),
  'technical-only partial scrub is repaired and counted'
);
select is(
  (
    select updated_at
    from public.source_postings
    where provider_code = 'purge-mixed' and external_id = 'mixed-complete'
  ),
  '2026-08-01T00:00:00Z'::timestamptz,
  'an already scrubbed source row is not rewritten'
);
select is(
  (
    select count(*)::integer
    from public.canonical_jobs
    where id between '00000000-0000-4000-8000-000000000254' and '00000000-0000-4000-8000-000000000256'
      and lifecycle_status = 'withdrawn'
      and field_provenance = '{}'::jsonb
  ),
  3,
  'mixed purge repairs canonical postconditions including the already scrubbed source row'
);
select is(
  (
    select closed_count
    from public.collection_runs
    where provider_code = 'purge-mixed' and error_summary = 'purge:TERMS_WITHDRAWN'
  ),
  3,
  'mixed purge audit closed_count equals changed source rows'
);

set local role service_role;
select is(
  public.purge_source_provider_data('purge-canonical-only', 'TERMS_WITHDRAWN'),
  0,
  'canonical-only repair does not count an already scrubbed source row'
);
reset role;
select is(
  (
    select updated_at
    from public.source_postings
    where provider_code = 'purge-canonical-only'
  ),
  '2026-08-01T00:00:00Z'::timestamptz,
  'canonical-only repair leaves the scrubbed source row untouched'
);
select is(
  (
    select lifecycle_status::text || '|' || field_provenance::text
    from public.canonical_jobs
    where id = '00000000-0000-4000-8000-000000000257'
  ),
  'withdrawn|{}',
  'canonical-only invocation repairs lifecycle and field provenance'
);
select is(
  (
    select closed_count
    from public.collection_runs
    where provider_code = 'purge-canonical-only' and error_summary = 'purge:TERMS_WITHDRAWN'
  ),
  0,
  'canonical-only repair audit records zero changed source rows'
);
select is(
  (
    select cursor->>'canonicalRepaired'
    from public.collection_runs
    where provider_code = 'purge-canonical-only' and error_summary = 'purge:TERMS_WITHDRAWN'
  ),
  '1',
  'canonical-only audit exposes the safe canonical repair count'
);

set local role service_role;
select is(
  public.purge_source_provider_data('purge-complete', 'TERMS_WITHDRAWN'),
  0,
  'fully completed purge returns zero'
);
reset role;
select is(
  (
    select count(*)::integer
    from public.collection_runs
    where provider_code = 'purge-complete' and error_summary = 'purge:TERMS_WITHDRAWN'
  ),
  0,
  'fully completed source and canonical postconditions create no audit'
);

set local role service_role;
select is(
  public.purge_source_provider_data('purge-enabled-canonical', 'TERMS_WITHDRAWN'),
  0,
  'enabled unexpired provider canonical-only repair returns zero source changes'
);
reset role;
select is(
  (
    select lifecycle_status::text || '|' || field_provenance::text
    from public.canonical_jobs
    where id = '00000000-0000-4000-8000-000000000263'
  ),
  'withdrawn|{}',
  'enabled unexpired provider still repairs stale target-derived canonical state'
);
select is(
  (
    select count(*)::integer
    from public.collection_runs
    where provider_code = 'purge-enabled-canonical'
      and error_summary = 'purge:TERMS_WITHDRAWN'
      and closed_count = 0
  ),
  1,
  'enabled unexpired canonical-only repair creates one zero-source audit'
);

set local role service_role;
select lives_ok(
  $$select public.purge_source_provider_data('purge-survivor-target', 'TERMS_WITHDRAWN')$$,
  'scalar and object array candidates do not abort survivor selection'
);
reset role;
select is(
  (
    select closed_count
    from public.collection_runs
    where provider_code = 'purge-survivor-target'
      and error_summary = 'purge:TERMS_WITHDRAWN'
  ),
  1,
  'survivor fixture audit counts only the changed target source row'
);
select is(
  (select lifecycle_status from public.canonical_jobs where id = '00000000-0000-4000-8000-000000000259'),
  'active',
  'any active survivor keeps the canonical lifecycle active'
);
select is(
  (
    select title || '|' || company_name
    from public.canonical_jobs
    where id = '00000000-0000-4000-8000-000000000259'
  ),
  'Missing Survivor Title|Active Survivor',
  'survivor values are selected independently from usable source fields'
);
select is(
  (
    select (field_provenance #>> '{title,sourcePosting,providerCode}') || ':'
      || (field_provenance #>> '{title,sourcePosting,externalId}') || '|'
      || (field_provenance #>> '{companyName,sourcePosting,providerCode}') || ':'
      || (field_provenance #>> '{companyName,sourcePosting,externalId}')
    from public.canonical_jobs
    where id = '00000000-0000-4000-8000-000000000259'
  ),
  'purge-neighbor:survivor-missing|purge-neighbor:survivor-active',
  'survivor provenance records the field-specific provider and external identity'
);
select is(
  (select posted_at from public.canonical_jobs where id = '00000000-0000-4000-8000-000000000259'),
  '2026-07-15T09:00:00Z'::timestamptz,
  'postedAt skips the invalid active value and uses the lower-priority valid ISO value'
);
select is(
  (select locations from public.canonical_jobs where id = '00000000-0000-4000-8000-000000000259'),
  array['서울', '경기']::text[],
  'locations contain only compatible label and string projections'
);
select is(
  (select employment_types from public.canonical_jobs where id = '00000000-0000-4000-8000-000000000259'),
  array['정규직', '계약직']::text[],
  'employment types reject provider objects and contain only nonblank strings'
);
select is(
  (select job_categories from public.canonical_jobs where id = '00000000-0000-4000-8000-000000000259'),
  array['개발', '백엔드']::text[],
  'job categories contain only compatible label and string projections'
);
select is(
  (
    select jsonb_build_object(
      'postedAt', field_provenance #> '{postedAt,sourcePosting}',
      'locations', field_provenance #> '{locations,sourcePosting}',
      'employmentTypes', field_provenance #> '{employmentTypes,sourcePosting}',
      'jobCategories', field_provenance #> '{jobCategories,sourcePosting}'
    )
    from public.canonical_jobs
    where id = '00000000-0000-4000-8000-000000000259'
  ),
  '{"postedAt":{"providerCode":"purge-neighbor","externalId":"survivor-missing"},"locations":{"providerCode":"purge-neighbor","externalId":"survivor-missing"},"employmentTypes":{"providerCode":"purge-neighbor","externalId":"survivor-missing"},"jobCategories":{"providerCode":"purge-neighbor","externalId":"survivor-missing"}}'::jsonb,
  'projected fields record the actually selected lower-priority survivor identity'
);

set local role service_role;
select is(
  public.purge_source_provider_data('purge-dangling', 'TERMS_WITHDRAWN'),
  0,
  'dangling target provenance repair changes no source rows'
);
reset role;
select is(
  (
    select lifecycle_status::text || '|' || field_provenance::text
    from public.canonical_jobs
    where id = '00000000-0000-4000-8000-000000000260'
  ),
  'withdrawn|{}',
  'purge repairs a canonical row referenced only by dangling target provenance'
);

set local role service_role;
select is(
  public.purge_source_provider_data('purge-atomic', 'TERMS_WITHDRAWN'),
  0,
  'atomic canonical repair changes no already scrubbed source row'
);
reset role;
select is(
  (
    select concat_ws('|', career_min_years, career_max_years, deadline_kind, deadline_at)
    from public.canonical_jobs
    where id = '00000000-0000-4000-8000-000000000261'
  ),
  'unknown',
  'career range and deadline fields are repaired together to a valid tuple'
);

set local role anon;
select throws_ok(
  $$select public.purge_source_provider_data('purge-neighbor', 'TERMS_WITHDRAWN')$$,
  '42501',
  'permission denied for function purge_source_provider_data',
  'anonymous users cannot execute purge'
);
reset role;

set local role authenticated;
select throws_ok(
  $$select public.purge_source_provider_data('purge-neighbor', 'TERMS_WITHDRAWN')$$,
  '42501',
  'permission denied for function purge_source_provider_data',
  'authenticated users cannot execute purge'
);
reset role;

select is(
  (
    select saved::text || '|' || application_status || '|' || memo
    from public.personal_job_states
    where user_id = '00000000-0000-4000-8000-0000000002a1'
      and canonical_job_id = '00000000-0000-4000-8000-000000000259'
  ),
  'true|applied|Purge must preserve this memo',
  'purge preserves the personal state row, application status, and memo'
);

select * from finish();
rollback;
