begin;
select plan(62);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000f001', 'authenticated', 'authenticated', 'feed-a@example.com'),
  ('00000000-0000-4000-8000-00000000f002', 'authenticated', 'authenticated', 'feed-no-consent@example.com'),
  ('00000000-0000-4000-8000-00000000f003', 'authenticated', 'authenticated', 'feed-b@example.com'),
  ('00000000-0000-4000-8000-00000000f004', 'authenticated', 'authenticated', 'feed-stale-consent@example.com');

insert into public.account_consents(user_id, terms_version, privacy_version, accepted_at)
values
  ('00000000-0000-4000-8000-00000000f001', '2026-08-07', '2026-08-07', statement_timestamp()),
  ('00000000-0000-4000-8000-00000000f003', '2026-08-07', '2026-08-07', statement_timestamp()),
  ('00000000-0000-4000-8000-00000000f004', '2026-08-07', '2026-08-07', statement_timestamp() - interval '1 day'),
  ('00000000-0000-4000-8000-00000000f004', '2026-07-01', '2026-07-01', statement_timestamp());

insert into public.source_providers(
  code, display_name, enabled, access_mode, terms_url, approval_reference,
  daily_limit, attribution, retention_policy, capabilities,
  last_success_at, last_error_code, disabled_reason
) values
  (
    'feed-alpha', 'Feed Alpha', true, 'approved_api', 'https://alpha.example.invalid/terms', 'private-approval-alpha',
    500, '{"text":"Alpha","href":"https://alpha.example.invalid"}',
    '{"allowedSourceFields":["title","companyName"]}', '{}',
    '2026-08-08T12:00:00Z', 'SOURCE_TIMEOUT', null
  ),
  (
    'feed-beta', 'Feed Beta', true, 'public_feed', 'https://beta.example.invalid/terms', null,
    100, '{"text":"Beta","href":"https://beta.example.invalid"}',
    '{"allowedSourceFields":["title","companyName"]}', '{}',
    '2026-08-08T11:00:00Z', null, null
  ),
  (
    'feed-disabled', 'Feed Disabled', false, 'approved_api', 'https://disabled.example.invalid/terms', 'approval-secret-should-not-return',
    999, '{"text":"Disabled","href":"https://disabled.example.invalid"}',
    '{"allowedSourceFields":["title","companyName"]}', '{}',
    null, 'SUPABASE_SERVICE_ROLE_SECRET_ABC123', 'private-disable-reason'
  );

insert into public.canonical_jobs(
  id, title, company_name, role_name, locations, employment_types,
  career_min_years, career_max_years, posted_at, deadline_kind, deadline_at,
  lifecycle_status, last_observed_at
) values
  ('00000000-0000-4000-8000-00000000f101', '핀테크 백엔드 개발자', '알파 금융', '백엔드', array['서울'], array['정규직'], 3, 5, '2026-08-07T09:00:00Z', 'fixed', statement_timestamp() + interval '3 days', 'active', '2026-08-08T09:00:00Z'),
  ('00000000-0000-4000-8000-00000000f102', '플랫폼 백엔드 개발자', '알파 플랫폼', '백엔드', array['서울'], array['정규직'], 7, 10, '2026-08-07T09:00:00Z', 'fixed', statement_timestamp() + interval '30 days', 'active', '2026-08-08T09:00:00Z'),
  ('00000000-0000-4000-8000-00000000f103', '데이터 백엔드 엔지니어', '알파 데이터', '백엔드', array['서울'], array['계약직'], 1, 2, '2026-08-07T09:00:00Z', 'rolling', null, 'active', '2026-08-08T10:00:00Z'),
  ('00000000-0000-4000-8000-00000000f104', '보안 엔지니어', '알파 보안', '보안', array['부산'], array['정규직'], 4, 8, null, 'until_hired', null, 'active', '2026-08-08T11:00:00Z'),
  ('00000000-0000-4000-8000-00000000f105', '정보 미확인 공고', '알파 미확인', null, '{}', '{}', null, null, null, 'unknown', null, 'active', '2026-08-08T12:00:00Z'),
  ('00000000-0000-4000-8000-00000000f106', '프론트엔드 개발자', '베타 커머스', '프론트엔드', array['부산'], array['정규직'], 0, 0, '2026-08-06T09:00:00Z', 'fixed', statement_timestamp() + interval '10 days', 'active', '2026-08-08T08:00:00Z'),
  ('00000000-0000-4000-8000-00000000f107', '종료된 공고', '알파 종료', '백엔드', array['서울'], array['정규직'], 3, 5, '2026-08-08T09:00:00Z', 'fixed', statement_timestamp() + interval '1 day', 'closed', statement_timestamp()),
  ('00000000-0000-4000-8000-00000000f108', '최근 stale 공고', '알파 캐시', '프론트엔드', array['부산'], array['계약직'], 2, 4, '2026-08-05T09:00:00Z', 'rolling', null, 'stale', statement_timestamp() - interval '1 hour'),
  ('00000000-0000-4000-8000-00000000f109', '오래된 stale 공고', '알파 오래된 캐시', '프론트엔드', array['부산'], array['계약직'], 2, 4, '2026-08-04T09:00:00Z', 'rolling', null, 'stale', statement_timestamp() - interval '25 hours'),
  ('00000000-0000-4000-8000-00000000f110', '비활성 출처 공고', '비활성 회사', '프론트엔드', array['대구'], array['정규직'], 1, 3, '2026-08-08T08:00:00Z', 'rolling', null, 'active', statement_timestamp());

insert into public.source_postings(
  provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint
)
select
  case
    when job.id = '00000000-0000-4000-8000-00000000f106' then 'feed-beta'
    when job.id = '00000000-0000-4000-8000-00000000f110' then 'feed-disabled'
    else 'feed-alpha'
  end,
  job.id,
  'feed-' || right(job.id::text, 4),
  'https://jobs.example.invalid/' || right(job.id::text, 4),
  'https://jobs.example.invalid/' || right(job.id::text, 4),
  jsonb_build_object('title', job.title, 'companyName', job.company_name),
  case when job.lifecycle_status = 'closed' then 'closed' else 'active' end,
  job.last_observed_at,
  job.last_observed_at,
  'fingerprint-' || right(job.id::text, 4)
from public.canonical_jobs as job
where job.id between '00000000-0000-4000-8000-00000000f101' and '00000000-0000-4000-8000-00000000f110';

create function pg_temp.call_catalog_feed(target_filters jsonb, target_take integer)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  execute 'select public.get_catalog_feed(target_filters => $1, target_take => $2)'
    into result
    using target_filters, target_take;
  return result;
exception
  when undefined_function then
    return '{"items":[],"total":-1,"missingCounts":{},"hasMore":false,"missingRpc":true}'::jsonb;
end;
$$;

create function pg_temp.call_catalog_detail(target_id uuid)
returns jsonb
language plpgsql
as $$
declare
  result jsonb;
begin
  execute 'select public.get_catalog_job_detail(target_id => $1)'
    into result
    using target_id;
  return result;
exception
  when undefined_function then
    return '{"missingRpc":true}'::jsonb;
end;
$$;

select has_function('public', 'get_catalog_feed', array['jsonb', 'integer'], 'catalog feed RPC accepts validated filters and take');
select ok((
  select procedure.prosecdef
    and procedure.provolatile = 's'
    and procedure.proconfig @> array['search_path=""']::text[]
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'get_catalog_feed'
), 'catalog feed is STABLE SECURITY DEFINER with an empty search_path');
select ok(
  has_function_privilege('authenticated', 'public.get_catalog_feed(jsonb,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_catalog_feed(jsonb,integer)', 'EXECUTE')
  and not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    cross join lateral aclexplode(procedure.proacl) as privilege
    where namespace.nspname = 'public'
      and procedure.proname = 'get_catalog_feed'
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'only authenticated callers receive the external execute grant'
);

select has_function('public', 'get_catalog_job_detail', array['uuid'], 'catalog detail RPC accepts one canonical job id');
select ok((
  select procedure.prosecdef
    and procedure.provolatile = 's'
    and procedure.proconfig @> array['search_path=""']::text[]
  from pg_proc as procedure
  join pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public' and procedure.proname = 'get_catalog_job_detail'
), 'catalog detail is STABLE SECURITY DEFINER with an empty search_path');
select ok(
  has_function_privilege('authenticated', 'public.get_catalog_job_detail(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.get_catalog_job_detail(uuid)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.get_catalog_job_detail(uuid)', 'EXECUTE')
  and not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    cross join lateral aclexplode(procedure.proacl) as privilege
    where namespace.nspname = 'public'
      and procedure.proname = 'get_catalog_job_detail'
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'only authenticated callers receive the catalog detail execute grant'
);

set local role anon;
select throws_like($$select public.get_catalog_feed('{}'::jsonb, 30)$$, '%permission denied%', 'anonymous users cannot execute the catalog feed RPC');
select throws_like($$select public.get_catalog_job_detail('00000000-0000-4000-8000-00000000f101')$$, '%permission denied%', 'anonymous users cannot execute the catalog detail RPC');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select is((pg_temp.call_catalog_feed('{}'::jsonb, 30)->>'total')::integer, 0, 'authenticated role without a subject receives no rows');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f002', true);
select is((pg_temp.call_catalog_feed('{}'::jsonb, 30)->>'total')::integer, 0, 'authenticated user without consent receives no rows');
select is(pg_temp.call_catalog_detail('00000000-0000-4000-8000-00000000f101'), null::jsonb, 'authenticated user without consent receives no catalog detail');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f004', true);
select is((pg_temp.call_catalog_feed('{}'::jsonb, 30)->>'total')::integer, 0, 'a stale latest consent version receives no rows');
select is(pg_temp.call_catalog_detail('00000000-0000-4000-8000-00000000f101'), null::jsonb, 'a stale latest consent version receives no catalog detail');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f001', true);
select is((pg_temp.call_catalog_feed('{}'::jsonb, 30)->>'total')::integer, 7, 'current consent receives active jobs plus only recent stale jobs');
select is(
  (select jsonb_agg(key order by key) from jsonb_object_keys(pg_temp.call_catalog_detail('00000000-0000-4000-8000-00000000f101')) as key),
  '["careerMaxYears","careerMinYears","companyName","deadlineAt","deadlineKind","educationText","employmentTypes","experienceText","id","industry","jobCategories","lastObservedAt","lifecycleStatus","locations","personalState","postedAt","roleName","salaryText","sources","title"]'::jsonb,
  'catalog detail exposes only normalized display keys and the caller personal overlay'
);
select is(
  (select jsonb_agg(key order by key) from jsonb_object_keys(pg_temp.call_catalog_detail('00000000-0000-4000-8000-00000000f101')#>'{sources,0}') as key),
  '["attribution","lastObservedAt","originalUrl","provider","providerName"]'::jsonb,
  'catalog detail source exposes only safe attribution keys'
);
select is((pg_temp.call_catalog_feed('{"q":"최근 stale"}'::jsonb, 30)->>'total')::integer, 1, 'recent stale jobs remain available as cached feed rows');
select is((pg_temp.call_catalog_feed('{"q":"오래된 stale"}'::jsonb, 30)->>'total')::integer, 0, 'stale jobs older than 24 hours are hidden');
select is(pg_temp.call_catalog_detail('00000000-0000-4000-8000-00000000f108')->>'id', '00000000-0000-4000-8000-00000000f108', 'recent stale catalog detail remains available');
select is(pg_temp.call_catalog_detail('00000000-0000-4000-8000-00000000f109'), null::jsonb, 'catalog detail hides stale jobs older than 24 hours');
select is((pg_temp.call_catalog_feed('{"q":"비활성 출처"}'::jsonb, 30)->>'total')::integer, 0, 'jobs backed only by a disabled provider are hidden');

reset role;
insert into public.canonical_jobs(
  id, title, company_name, role_name, locations, employment_types,
  posted_at, deadline_kind, lifecycle_status, last_observed_at
) values (
  '00000000-0000-4000-8000-00000000f111', '출처 시각 불일치 stale', '불일치 회사', '테스트',
  array['서울'], array['정규직'], statement_timestamp(), 'rolling', 'stale', statement_timestamp() - interval '1 hour'
);
insert into public.source_postings(
  provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint
) values (
  'feed-alpha', '00000000-0000-4000-8000-00000000f111', 'stale-divergent',
  'https://jobs.example.invalid/stale-divergent', 'https://jobs.example.invalid/stale-divergent',
  '{"title":"출처 시각 불일치 stale"}', 'missing_once',
  statement_timestamp() - interval '25 hours', statement_timestamp() - interval '25 hours', 'stale-divergent-fingerprint'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f001', true);
select is((pg_temp.call_catalog_feed('{"q":"출처 시각 불일치"}'::jsonb, 30)->>'total')::integer, 0, 'stale eligibility requires a fresh enabled source even when the canonical timestamp is recent');
select is(pg_temp.call_catalog_detail('00000000-0000-4000-8000-00000000f111'), null::jsonb, 'catalog detail requires a fresh enabled source when canonical and source timestamps diverge');
reset role;
delete from public.source_postings where canonical_job_id = '00000000-0000-4000-8000-00000000f111';
delete from public.canonical_jobs where id = '00000000-0000-4000-8000-00000000f111';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f001', true);

select is((pg_temp.call_catalog_feed('{"q":"핀테크"}'::jsonb, 30)->>'total')::integer, 1, 'q filters title, company, and role in the database');
select is((pg_temp.call_catalog_feed('{"region":"서울"}'::jsonb, 30)->>'total')::integer, 3, 'region filters confirmed location values');
select is((pg_temp.call_catalog_feed('{"role":"백엔드"}'::jsonb, 30)->>'total')::integer, 3, 'role filters confirmed role values');
select is((pg_temp.call_catalog_feed('{"career":"3-5"}'::jsonb, 30)->>'total')::integer, 1, 'career range requires a confirmed posting range that contains the requested range');
select is((pg_temp.call_catalog_feed('{"q":"보안","career":"3-5"}'::jsonb, 30)->>'total')::integer, 0, 'a posting range that only partially overlaps the requested career range is excluded');
select is((pg_temp.call_catalog_feed('{"employment":"정규직"}'::jsonb, 30)->>'total')::integer, 4, 'employment filters confirmed values');
select is((pg_temp.call_catalog_feed('{"deadline":"closingSoon"}'::jsonb, 30)->>'total')::integer, 1, 'closingSoon includes fixed deadlines within seven days');
select is((pg_temp.call_catalog_feed('{"source":"feed-beta"}'::jsonb, 30)->>'total')::integer, 1, 'source filters enabled eligible postings');
select is((pg_temp.call_catalog_feed('{"q":"핀테크","region":"서울","role":"백엔드","career":"3-5","employment":"정규직","deadline":"closingSoon","source":"feed-alpha"}'::jsonb, 30)->>'total')::integer, 1, 'database filters compose');
select is((pg_temp.call_catalog_feed('{"region":"서울"}'::jsonb, 30)#>>'{missingCounts,region}')::integer, 1, 'missing region values are counted while the region dimension is excluded');
select is((pg_temp.call_catalog_feed('{"q":"정보","region":"서울"}'::jsonb, 30)#>>'{missingCounts,region}')::integer, 1, 'missing counts retain the current combination of other filters');
select is((pg_temp.call_catalog_feed('{}'::jsonb, 30)#>>'{missingCounts,source}')::integer, 0, 'source missing count is calculated from eligible source rows');
select is(
  (select jsonb_agg(item->>'id') from jsonb_array_elements(pg_temp.call_catalog_feed('{}'::jsonb, 30)->'items') as item),
  '["00000000-0000-4000-8000-00000000f103","00000000-0000-4000-8000-00000000f101","00000000-0000-4000-8000-00000000f102","00000000-0000-4000-8000-00000000f106","00000000-0000-4000-8000-00000000f108","00000000-0000-4000-8000-00000000f105","00000000-0000-4000-8000-00000000f104"]'::jsonb,
  'postedAt, lastObservedAt, and id produce deterministic common order'
);

create temporary table feed_user_a_order(result jsonb) on commit drop;
insert into feed_user_a_order select pg_temp.call_catalog_feed('{}'::jsonb, 30)->'items';
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f003', true);
select is(pg_temp.call_catalog_feed('{}'::jsonb, 30)->'items', (select result from feed_user_a_order), 'common ordering is independent of the user');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f001', true);

select is(jsonb_array_length(pg_temp.call_catalog_feed('{}'::jsonb, 2)->'items'), 7, 'invalid take below 30 resets to 30');
select is((pg_temp.call_catalog_feed('{}'::jsonb, 31)->>'total')::integer, 7, 'invalid non-multiple take preserves the pre-limit total');
select is((pg_temp.call_catalog_feed('{}'::jsonb, 31)->>'hasMore')::boolean, false, 'invalid non-multiple take cannot reduce the page below 30');
select is((pg_temp.call_catalog_feed('{"includeExcluded":true}'::jsonb, 30)->>'total')::integer, 7, 'includeExcluded remains the common feed when the caller has no excluded state');
select is((pg_temp.call_catalog_feed('{"saved":true}'::jsonb, 30)->>'total')::integer, 0, 'saved-only fails closed before personal state exists');
select is((pg_temp.call_catalog_feed('[]'::jsonb, 30)->>'total')::integer, 0, 'malformed root filters fail closed');
select is((pg_temp.call_catalog_feed('{"saved":"true"}'::jsonb, 30)->>'total')::integer, 0, 'malformed personal boolean fails closed');
select is((pg_temp.call_catalog_feed('{"region":[]}'::jsonb, 30)->>'total')::integer, 7, 'malformed ordinary filter normalizes to the safe default');

reset role;
insert into public.source_postings(
  provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint
) values (
  'feed-beta', '00000000-0000-4000-8000-00000000f108', 'stale-old-secondary',
  'https://jobs.example.invalid/stale-old-secondary', 'https://jobs.example.invalid/stale-old-secondary',
  '{"title":"최근 stale 공고"}', 'missing_once',
  statement_timestamp() - interval '25 hours', statement_timestamp() - interval '25 hours', 'stale-old-secondary-fingerprint'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f001', true);
select is(
  (select jsonb_agg(source->>'provider') from jsonb_array_elements(pg_temp.call_catalog_feed('{"q":"최근 stale"}'::jsonb, 30)#>'{items,0,sources}') as source),
  '["feed-alpha"]'::jsonb,
  'stale payload omits enabled sources older than 24 hours'
);
select is((select jsonb_agg(source->>'provider') from jsonb_array_elements(pg_temp.call_catalog_detail('00000000-0000-4000-8000-00000000f108')->'sources') as source), '["feed-alpha"]'::jsonb, 'catalog detail omits enabled stale sources older than 24 hours');

create temporary table feed_payload(result jsonb) on commit drop;
insert into feed_payload select pg_temp.call_catalog_feed('{}'::jsonb, 30);
select is((select jsonb_agg(key order by key) from jsonb_object_keys((select result from feed_payload)) as key), '["enabledProviderCount","hasMore","items","missingCounts","providerHealth","total"]'::jsonb, 'top-level payload has only allowed keys');
select is((select jsonb_agg(key order by key) from jsonb_object_keys((select result->'items'->0 from feed_payload)) as key), '["careerMaxYears","careerMinYears","companyName","deadlineAt","deadlineKind","educationText","employmentTypes","experienceText","id","industry","jobCategories","lastObservedAt","lifecycleStatus","locations","personalState","postedAt","roleName","salaryText","sources","title"]'::jsonb, 'feed item has only normalized display keys and the caller personal overlay');
select is((select jsonb_agg(key order by key) from jsonb_object_keys((select result->'items'->0->'sources'->0 from feed_payload)) as key), '["attribution","lastObservedAt","originalUrl","provider","providerName"]'::jsonb, 'source payload has only safe attribution keys');
select is((select jsonb_agg(key order by key) from jsonb_object_keys((select result->'items'->0->'sources'->0->'attribution' from feed_payload)) as key), '["href","text"]'::jsonb, 'attribution exposes only text and href');
select is((select jsonb_agg(key order by key) from jsonb_object_keys((select result->'providerHealth'->0 from feed_payload)) as key), '["code","displayName","enabled","errorCode","lastSuccessAt"]'::jsonb, 'provider health has only its safe allowlist');
select is(((select result from feed_payload)->>'enabledProviderCount')::integer, 2, 'enabled provider count supports threshold calculation');
select is((select item->>'errorCode' from jsonb_array_elements((select result->'providerHealth' from feed_payload)) as item where item->>'code' = 'feed-alpha'), 'SOURCE_TIMEOUT', 'stable provider error code is returned');
select is((select item->>'errorCode' from jsonb_array_elements((select result->'providerHealth' from feed_payload)) as item where item->>'code' = 'feed-disabled'), null::text, 'uppercase token-like provider error text is suppressed');
select ok((select result::text from feed_payload) !~ 'approval-secret|private-disable|SERVICE_ROLE_SECRET|daily_limit|approval_reference|disabled_reason', 'feed payload excludes approval, limit, reason, and secret data');

reset role;
insert into public.canonical_jobs(id, title, company_name, role_name, locations, employment_types, posted_at, deadline_kind, deadline_at, lifecycle_status, last_observed_at)
values
  ('00000000-0000-4000-8000-00000000f120', '마감 동률 A', '동률 회사', '테스트', array['서울'], array['정규직'], '2026-08-03T09:00:00Z', 'fixed', statement_timestamp() + interval '1 day', 'active', '2026-08-08T01:00:00Z'),
  ('00000000-0000-4000-8000-00000000f121', '마감 동률 B', '동률 회사', '테스트', array['서울'], array['정규직'], '2026-08-03T09:00:00Z', 'fixed', statement_timestamp() + interval '1 day', 'active', '2026-08-08T01:00:00Z');
insert into public.source_postings(provider_code, canonical_job_id, external_id, original_url, normalized_url, source_values, source_status, first_observed_at, last_observed_at, content_fingerprint)
select 'feed-alpha', job.id, 'tie-' || right(job.id::text, 4), 'https://jobs.example.invalid/tie-' || right(job.id::text, 4), 'https://jobs.example.invalid/tie-' || right(job.id::text, 4), jsonb_build_object('title', job.title), 'active', job.last_observed_at, job.last_observed_at, 'tie-fingerprint-' || right(job.id::text, 4)
from public.canonical_jobs as job where job.id in ('00000000-0000-4000-8000-00000000f120', '00000000-0000-4000-8000-00000000f121');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f001', true);
select is((select jsonb_agg(item->>'id') from jsonb_array_elements(pg_temp.call_catalog_feed('{"q":"마감 동률","sort":"deadline"}'::jsonb, 30)->'items') as item), '["00000000-0000-4000-8000-00000000f120","00000000-0000-4000-8000-00000000f121"]'::jsonb, 'deadline ties fall back to postedAt, lastObservedAt, then id');

reset role;
insert into public.canonical_jobs(id, title, company_name, role_name, locations, employment_types, posted_at, deadline_kind, lifecycle_status, last_observed_at)
select ('00000000-0000-4000-8000-' || lpad((200 + value)::text, 12, '0'))::uuid, '페이지 테스트 ' || value, '페이지 회사', '테스트', array['서울'], array['정규직'], statement_timestamp() - value * interval '1 minute', 'rolling', 'active', statement_timestamp()
from generate_series(1, 31) as value;
insert into public.source_postings(provider_code, canonical_job_id, external_id, original_url, normalized_url, source_values, source_status, first_observed_at, last_observed_at, content_fingerprint)
select 'feed-alpha', job.id, 'page-' || right(job.id::text, 12), 'https://jobs.example.invalid/page-' || right(job.id::text, 12), 'https://jobs.example.invalid/page-' || right(job.id::text, 12), jsonb_build_object('title', job.title), 'active', job.last_observed_at, job.last_observed_at, 'page-fingerprint-' || right(job.id::text, 12)
from public.canonical_jobs as job where job.title like '페이지 테스트 %';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000f001', true);
select is(jsonb_array_length(pg_temp.call_catalog_feed('{"q":"페이지 테스트"}'::jsonb, 30)->'items'), 30, 'valid take returns at most 30 items');
select is((pg_temp.call_catalog_feed('{"q":"페이지 테스트"}'::jsonb, 30)->>'total')::integer, 31, 'total is computed before the take limit');
select is((pg_temp.call_catalog_feed('{"q":"페이지 테스트"}'::jsonb, 30)->>'hasMore')::boolean, true, 'take plus one detects more matching rows');
select is(jsonb_array_length(pg_temp.call_catalog_feed('{"q":"페이지 테스트"}'::jsonb, 60)->'items'), 31, 'the next valid 30-row multiple returns the remaining rows');
select is((pg_temp.call_catalog_feed('{"q":"페이지 테스트"}'::jsonb, 60)->>'hasMore')::boolean, false, 'hasMore is false when total does not exceed take');

reset role;
select * from finish();
rollback;
