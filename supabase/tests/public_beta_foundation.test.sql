begin;
select plan(22);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'beta-a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'beta-b@example.com');

insert into public.account_consents(user_id, terms_version, privacy_version)
values
  ('00000000-0000-4000-8000-00000000000a', '2026-08-07', '2026-08-07'),
  ('00000000-0000-4000-8000-00000000000b', '2026-08-07', '2026-08-07');

select has_table('public', 'account_consents', 'account consent table exists');
select has_table('public', 'request_usage', 'request usage table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.account_consents'::regclass),
  true,
  'account consents have RLS enabled'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.account_consents'::regclass),
  true,
  'account consents force RLS'
);
select is(
  (select relrowsecurity from pg_class where oid = 'public.request_usage'::regclass),
  true,
  'request usage has RLS enabled'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.request_usage'::regclass),
  true,
  'request usage forces RLS'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000a', true);

select is(
  (select count(*)::integer from public.account_consents),
  1,
  'user A reads only user A consent'
);
select throws_like(
  $$insert into public.account_consents(user_id, terms_version, privacy_version)
    values ('00000000-0000-4000-8000-00000000000a', 'next', 'next')$$,
  '%permission denied%',
  'authenticated users cannot directly insert consent evidence'
);
select throws_like(
  $$select count(*) from public.request_usage$$,
  '%permission denied%',
  'authenticated users cannot read raw request counters'
);

select is(
  (select allowed from public.consume_rate_limit('source_preview')),
  true,
  'first preview request is accepted'
);
select is(
  (
    select count(*)::integer
    from generate_series(1, 9) as attempt
    cross join lateral public.consume_rate_limit(
      case when attempt > 0
        then 'source_preview'::public.rate_limit_action
        else 'source_refresh'::public.rate_limit_action
      end
    ) as decision
    where decision.allowed
  ),
  9,
  'the remaining nine preview requests are accepted'
);
select is(
  (select allowed from public.consume_rate_limit('source_preview')),
  false,
  'the eleventh preview request is denied'
);
select is(
  (select remaining from public.consume_rate_limit('source_preview')),
  0,
  'a denied preview request reports zero remaining'
);
select is(
  (select allowed from public.consume_rate_limit('import_commit')),
  true,
  'a different action has an independent bucket'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000000b', true);
select is(
  (select allowed from public.consume_rate_limit('source_preview')),
  true,
  'user B has an independent preview bucket'
);
select is(
  (select allowed from public.consume_rate_limit('mutation_write')),
  true,
  'the first ordinary mutation is accepted'
);
select is(
  (
    select count(*)::integer
    from generate_series(1, 59) as attempt
    cross join lateral public.consume_rate_limit(
      case when attempt > 0
        then 'mutation_write'::public.rate_limit_action
        else 'source_preview'::public.rate_limit_action
      end
    ) as decision
    where decision.allowed
  ),
  59,
  'the remaining ordinary mutation allowance is accepted atomically'
);
select is(
  (select allowed from public.consume_rate_limit('mutation_write')),
  false,
  'an ordinary mutation above the fixed per-minute limit is denied'
);

select throws_like(
  $$select public.preview_backup_restore(
      jsonb_build_object(
        'schemaVersion', 1,
        'jobs', '[]'::jsonb,
        'sources', '[]'::jsonb,
        'duplicatePairs', '[]'::jsonb,
        'revisions', '[]'::jsonb,
        'padding', repeat('x', 10485761)
      )
    )$$,
  '%backup payload exceeds 10 MiB%',
  'direct backup RPC rejects payloads over 10 MiB'
);
select throws_like(
  $$select public.preview_backup_restore(
      jsonb_build_object(
        'schemaVersion', 1,
        'jobs', (select jsonb_agg(jsonb_build_object()) from generate_series(1, 10001)),
        'sources', '[]'::jsonb,
        'duplicatePairs', '[]'::jsonb,
        'revisions', '[]'::jsonb
      )
    )$$,
  '%backup jobs limit exceeded%',
  'direct backup RPC rejects too many jobs'
);

reset role;
delete from auth.users where id = '00000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::integer from public.account_consents where user_id = '00000000-0000-4000-8000-00000000000a'),
  0,
  'deleting auth user A cascades account consents'
);
select is(
  (select count(*)::integer from public.request_usage where user_id = '00000000-0000-4000-8000-00000000000a'),
  0,
  'deleting auth user A cascades request usage'
);

select * from finish();
rollback;
