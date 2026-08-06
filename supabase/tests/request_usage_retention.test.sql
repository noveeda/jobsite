begin;
select plan(18);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'retention-a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'retention-b@example.com');

insert into public.account_consents(user_id, terms_version, privacy_version)
values
  ('00000000-0000-4000-8000-00000000000a', '2026-08-07', '2026-08-07'),
  ('00000000-0000-4000-8000-00000000000b', '2026-08-07', '2026-08-07');

insert into public.request_usage(user_id, action, bucket_start, request_count)
select
  '00000000-0000-4000-8000-00000000000a'::uuid,
  'source_refresh'::public.rate_limit_action,
  date_trunc('second', now() - interval '31 days') - sequence * interval '1 second',
  1
from generate_series(1, 1005) as sequence;

insert into public.request_usage(user_id, action, bucket_start, request_count)
values
  ('00000000-0000-4000-8000-00000000000b', 'source_refresh', date_trunc('second', now() - interval '45 days'), 1),
  ('00000000-0000-4000-8000-00000000000a', 'source_preview', date_trunc('minute', now()), 1),
  ('00000000-0000-4000-8000-00000000000b', 'source_preview', date_trunc('minute', now()), 1);

select has_function(
  'public',
  'cleanup_request_usage',
  array[]::text[],
  'bounded request-usage cleanup function exists'
);
select is(
  has_function_privilege('authenticated', 'public.cleanup_request_usage()', 'EXECUTE'),
  false,
  'authenticated users cannot execute retention cleanup'
);
select is(
  has_function_privilege('anon', 'public.cleanup_request_usage()', 'EXECUTE'),
  false,
  'anonymous users cannot execute retention cleanup'
);
select is(
  has_function_privilege('service_role', 'public.cleanup_request_usage()', 'EXECUTE'),
  true,
  'service role can execute scheduled retention cleanup'
);

set local role authenticated;
select throws_like(
  $$select public.cleanup_request_usage()$$,
  '%permission denied%',
  'authenticated execution is denied by the database'
);
reset role;

select is(public.cleanup_request_usage(), 1000, 'one invocation deletes at most 1000 expired buckets');
select is((select count(*)::integer from public.request_usage), 8, 'bounded cleanup leaves six expired and two current buckets');
select is(
  (select count(*)::integer from public.request_usage where bucket_start < now() - interval '30 days'),
  6,
  'expired rows beyond the batch bound remain for the next invocation'
);
select is(
  (select count(*)::integer from public.request_usage where bucket_start >= now() - interval '30 days'),
  2,
  'current buckets are preserved'
);
select is((select count(*)::integer from public.account_consents), 2, 'usage cleanup does not remove consent data');

select is(public.cleanup_request_usage(), 6, 'the next invocation removes the bounded remainder');
select is(
  (select count(*)::integer from public.request_usage where bucket_start < now() - interval '30 days'),
  0,
  'all expired buckets are removed after repeated bounded calls'
);
select is(
  (select count(*)::integer from public.request_usage where bucket_start >= now() - interval '30 days'),
  2,
  'repeated cleanup still preserves current buckets'
);
select is(public.cleanup_request_usage(), 0, 'cleanup is idempotent when no expired rows remain');

delete from auth.users where id = '00000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::integer from public.request_usage where user_id = '00000000-0000-4000-8000-00000000000a'),
  0,
  'account deletion still cascades current request usage'
);
select is(
  (select count(*)::integer from public.account_consents where user_id = '00000000-0000-4000-8000-00000000000a'),
  0,
  'account deletion still cascades consent data'
);
select is(
  (select count(*)::integer from public.request_usage where user_id = '00000000-0000-4000-8000-00000000000b'),
  1,
  'deleting A preserves B current request usage'
);
select is(
  (select count(*)::integer from public.account_consents where user_id = '00000000-0000-4000-8000-00000000000b'),
  1,
  'deleting A preserves B consent data'
);

select * from finish();
rollback;
