begin;
select plan(21);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000e001', 'authenticated', 'authenticated', 'overlay-a@example.com'),
  ('00000000-0000-4000-8000-00000000e002', 'authenticated', 'authenticated', 'overlay-b@example.com');

insert into public.account_consents(user_id, terms_version, privacy_version)
values
  ('00000000-0000-4000-8000-00000000e001', '2026-08-07', '2026-08-07'),
  ('00000000-0000-4000-8000-00000000e002', '2026-08-07', '2026-08-07');

insert into public.source_providers(code, display_name, enabled, access_mode, terms_url, attribution, retention_policy)
values (
  'personal-feed', 'Personal Feed', true, 'public_feed', 'https://personal-feed.example.invalid/terms',
  '{"text":"Personal Feed","href":"https://personal-feed.example.invalid"}',
  '{"allowedSourceFields":["title","companyName"]}'
);

insert into public.canonical_jobs(
  id, title, company_name, career_min_years, career_max_years,
  posted_at, deadline_kind, lifecycle_status, last_observed_at
) values
  ('00000000-0000-4000-8000-00000000e101', '저장 활성 공고', '개인 피드 회사', 3, 5, '2026-08-08T09:00:00Z', 'rolling', 'active', statement_timestamp()),
  ('00000000-0000-4000-8000-00000000e102', '제외 활성 공고', '개인 피드 회사', 0, 1, '2026-08-07T09:00:00Z', 'unknown', 'active', statement_timestamp()),
  ('00000000-0000-4000-8000-00000000e103', '일반 활성 공고', '개인 피드 회사', null, null, '2026-08-06T09:00:00Z', 'rolling', 'active', statement_timestamp()),
  ('00000000-0000-4000-8000-00000000e104', '저장 종료 공고', '개인 피드 회사', 3, 5, '2026-08-05T09:00:00Z', 'rolling', 'closed', statement_timestamp());

insert into public.source_postings(
  provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint
)
select
  'personal-feed', job.id, 'personal-' || right(job.id::text, 4),
  'https://personal-feed.example.invalid/jobs/' || right(job.id::text, 4),
  'https://personal-feed.example.invalid/jobs/' || right(job.id::text, 4),
  jsonb_build_object('title', job.title, 'companyName', job.company_name),
  case when job.lifecycle_status = 'closed' then 'closed' else 'active' end,
  job.last_observed_at, job.last_observed_at, 'personal-fingerprint-' || right(job.id::text, 4)
from public.canonical_jobs as job
where job.id between '00000000-0000-4000-8000-00000000e101' and '00000000-0000-4000-8000-00000000e104';

insert into public.personal_job_states(
  user_id, canonical_job_id, saved, excluded, application_status, memo, next_action_at
) values
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e101', true, false, 'planned', '저장 메모', '2026-08-20T00:00:00Z'),
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e102', false, true, 'unreviewed', '제외 메모', null),
  ('00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000e104', true, false, 'applied', '종료 후 보존 메모', null),
  ('00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000e101', false, false, 'rejected', '다른 사용자 메모', null);

-- More than the former 1,020-row common-RPC ceiling precede the visible rows.
-- They are all excluded for user A, so exclusion must run before pagination.
insert into public.canonical_jobs(
  id, title, company_name, posted_at, deadline_kind, lifecycle_status, last_observed_at
)
select
  ('10000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '대량 제외 공고 ' || value,
  '개인 피드 회사',
  '2026-08-09T12:00:00Z'::timestamptz + value * interval '1 second',
  'rolling',
  'active',
  statement_timestamp()
from generate_series(1, 1021) as value;

insert into public.source_postings(
  provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint
)
select
  'personal-feed', job.id, 'bulk-' || right(job.id::text, 12),
  'https://personal-feed.example.invalid/jobs/' || right(job.id::text, 12),
  'https://personal-feed.example.invalid/jobs/' || right(job.id::text, 12),
  jsonb_build_object('title', job.title, 'companyName', job.company_name),
  'active', job.last_observed_at, job.last_observed_at, 'bulk-fingerprint-' || right(job.id::text, 12)
from public.canonical_jobs as job
where job.id::text like '10000000-0000-4000-8000-%';

insert into public.personal_job_states(user_id, canonical_job_id, excluded)
select '00000000-0000-4000-8000-00000000e001', job.id, true
from public.canonical_jobs as job
where job.id::text like '10000000-0000-4000-8000-%';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e001', true);

select is((public.get_catalog_feed('{}', 30)->>'total')::integer, 2, 'default feed hides the current user excluded active job');
select is(
  (select jsonb_agg(item->>'id') from jsonb_array_elements(public.get_catalog_feed('{}', 30)->'items') as item),
  '["00000000-0000-4000-8000-00000000e101","00000000-0000-4000-8000-00000000e103"]'::jsonb,
  'personal state never changes the common deterministic order'
);
select is(public.get_catalog_feed('{}', 30)#>>'{items,0,personalState,applicationStatus}', 'planned', 'feed overlays the current user application status');
select is((public.get_catalog_feed('{}', 30)#>>'{items,0,personalState,saved}')::boolean, true, 'feed overlays the current user saved flag');
select ok(not (public.get_catalog_feed('{}', 30)#>'{items,0,personalState}' ? 'memo'), 'list payload does not expose private memo text');
select is(
  public.get_catalog_feed('{}', 30)->'missingCounts',
  '{"region":2,"role":2,"career":1,"employment":2,"deadline":0,"source":0}'::jsonb,
  'default missing counts reflect the exclusion policy before pagination'
);
select is((public.get_catalog_feed('{"saved":true}', 30)->>'total')::integer, 2, 'saved-only includes active and closed saved jobs');
select is(public.get_catalog_feed('{"saved":true}', 30)#>>'{items,1,lifecycleStatus}', 'closed', 'saved-only labels a closed job without losing it');
select is(
  public.get_catalog_feed('{"saved":true}', 30)->'missingCounts',
  '{"region":2,"role":2,"career":0,"employment":2,"deadline":0,"source":0}'::jsonb,
  'saved-only missing counts include retained saved jobs and no other candidates'
);
select is((public.get_catalog_feed('{"includeExcluded":true}', 1020)->>'total')::integer, 1024, 'includeExcluded total is computed before the 1,020-row page limit');
select is(jsonb_array_length(public.get_catalog_feed('{"includeExcluded":true}', 1020)->'items'), 1020, 'includeExcluded returns exactly the requested page size');
select ok((public.get_catalog_feed('{"includeExcluded":true}', 1020)->>'hasMore')::boolean, 'includeExcluded reports rows beyond the requested page');
select is((public.get_catalog_feed('{"includeExcluded":true}', 30)#>>'{items,1,personalState,excluded}')::boolean, true, 'excluded overlay is visible only when requested');
select is(
  public.get_catalog_feed('{"includeExcluded":true}', 30)->'missingCounts',
  '{"region":1024,"role":1024,"career":1022,"employment":1024,"deadline":1,"source":0}'::jsonb,
  'includeExcluded missing counts cover all six dimensions after personal policy'
);
select is((public.get_catalog_feed('{"career":"9-2"}', 30)->>'total')::integer, 2, 'descending career range is ignored for common candidates');
select is((public.get_catalog_feed('{"saved":true,"career":"9-2"}', 30)->>'total')::integer, 2, 'descending career range is ignored for retained saved candidates');
select is(public.get_catalog_job_detail('00000000-0000-4000-8000-00000000e101')#>>'{personalState,memo}', '저장 메모', 'detail returns the current user private memo');
select is(public.get_catalog_job_detail('00000000-0000-4000-8000-00000000e104')#>>'{personalState,memo}', '종료 후 보존 메모', 'saved closed detail remains available with personal state');
select is(public.get_catalog_job_detail('00000000-0000-4000-8000-00000000e104')#>>'{sources,0,originalUrl}', 'https://personal-feed.example.invalid/jobs/e104', 'closed detail retains the minimal original source link');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000e002', true);
select is((public.get_catalog_feed('{}', 30)->>'total')::integer, 1024, 'one user exclusion never hides shared jobs from another user');
select is(public.get_catalog_job_detail('00000000-0000-4000-8000-00000000e101')#>>'{personalState,memo}', '다른 사용자 메모', 'detail never leaks another user memo');

reset role;
select * from finish();
rollback;
