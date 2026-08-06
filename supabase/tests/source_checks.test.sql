begin;
select plan(10);

insert into auth.users(id, aud, role, email)
values ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'a@example.com');
insert into public.jobs(id, user_id, title, company_name, deadline_kind, field_provenance, memo, application_status)
values (
  '10000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-00000000000a',
  '사용자 제목',
  '기존 회사',
  'unknown',
  '{"title":{"origin":"user"},"companyName":{"origin":"source"}}',
  '사용자 메모',
  'applied'
);
insert into public.job_sources(id, user_id, job_id, provider, connector_mode, external_id, original_url, normalized_url)
values (
  '20000000-0000-4000-8000-00000000000a',
  '00000000-0000-4000-8000-00000000000a',
  '10000000-0000-4000-8000-00000000000a',
  'saramin',
  'approved_api',
  '123',
  'https://www.saramin.co.kr/job/123',
  'https://www.saramin.co.kr/job/123'
);
insert into public.source_checks(user_id, source_id, result_status, checked_at)
select
  '00000000-0000-4000-8000-00000000000a',
  '20000000-0000-4000-8000-00000000000a',
  'unknown',
  now() - (n || ' minutes')::interval
from generate_series(1, 105) n;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

select lives_ok(
  $$select public.record_source_refresh(
    '20000000-0000-4000-8000-00000000000a',
    'active',
    array['companyName'],
    null,
    '{"companyName":"새 회사"}',
    '{"title":"출처 제목","companyName":"새 회사"}'
  )$$,
  'source success is recorded'
);
select is((select count(*)::integer from public.source_checks), 100, 'only the latest 100 checks remain');
select is((select result_status::text from public.source_checks order by checked_at desc limit 1), 'active', 'newest check is retained');
select is((select title from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), '사용자 제목', 'user-origin title is protected');
select is((select company_name from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), '새 회사', 'source-origin company is refreshed');
select ok((select last_success_at is not null from public.job_sources where id = '20000000-0000-4000-8000-00000000000a'), 'last success is recorded');
create temporary table prior_success as select last_success_at from public.job_sources where id = '20000000-0000-4000-8000-00000000000a';

select lives_ok(
  $$select public.record_source_refresh(
    '20000000-0000-4000-8000-00000000000a',
    'unreachable',
    '{}',
    'SOURCE_UNAVAILABLE',
    '{}',
    '{}'
  )$$,
  'source failure is recorded'
);
select is(
  (select last_success_at from public.job_sources where id = '20000000-0000-4000-8000-00000000000a'),
  (select last_success_at from prior_success),
  'failure preserves last success'
);
select is((select memo from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), '사용자 메모', 'refresh keeps user memo');
select is((select application_status::text from public.jobs where id = '10000000-0000-4000-8000-00000000000a'), 'applied', 'refresh keeps application status');

select * from finish();
rollback;