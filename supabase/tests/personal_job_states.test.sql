begin;
select plan(26);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', 'personal-a@example.com'),
  ('00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', 'personal-b@example.com');

insert into public.source_providers(
  code,
  display_name,
  enabled,
  retention_policy
)
values
  ('personal-state-fixture', 'Personal state fixture', false, '{"retainDays":30}'::jsonb),
  ('personal-purge-fixture', 'Personal purge fixture', false, '{"retainDays":30}'::jsonb);

insert into public.canonical_jobs(
  id,
  title,
  company_name,
  lifecycle_status,
  last_observed_at,
  field_provenance
)
values
  (
    '10000000-0000-4000-8000-0000000000a1',
    'Lifecycle fixture',
    'Shared company',
    'active',
    '2026-08-08T00:00:00Z',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-0000000000a2',
    'Purge fixture',
    'Shared company',
    'active',
    '2026-08-08T00:00:00Z',
    '{}'
  ),
  (
    '10000000-0000-4000-8000-0000000000a3',
    'Owner write fixture',
    'Shared company',
    'active',
    '2026-08-08T00:00:00Z',
    '{}'
  );

insert into public.source_postings(
  id,
  provider_code,
  canonical_job_id,
  external_id,
  original_url,
  normalized_url,
  source_values,
  source_status,
  first_observed_at,
  last_observed_at,
  content_fingerprint
)
values
  (
    '20000000-0000-4000-8000-0000000000a1',
    'personal-state-fixture',
    '10000000-0000-4000-8000-0000000000a1',
    'lifecycle-1',
    'https://example.com/jobs/lifecycle-1',
    'https://example.com/jobs/lifecycle-1',
    '{"title":"Lifecycle fixture","companyName":"Shared company"}',
    'active',
    '2026-08-01T00:00:00Z',
    '2026-08-08T00:00:00Z',
    encode(digest('{"title":"Lifecycle fixture"}', 'sha256'), 'hex')
  ),
  (
    '20000000-0000-4000-8000-0000000000a2',
    'personal-purge-fixture',
    '10000000-0000-4000-8000-0000000000a2',
    'purge-1',
    'https://example.com/jobs/purge-1',
    'https://example.com/jobs/purge-1',
    '{"title":"Purge fixture","companyName":"Shared company"}',
    'active',
    '2026-08-01T00:00:00Z',
    '2026-08-08T00:00:00Z',
    encode(digest('{"title":"Purge fixture"}', 'sha256'), 'hex')
  ),
  (
    '20000000-0000-4000-8000-0000000000a3',
    'personal-state-fixture',
    '10000000-0000-4000-8000-0000000000a3',
    'write-1',
    'https://example.com/jobs/write-1',
    'https://example.com/jobs/write-1',
    '{"title":"Owner write fixture","companyName":"Shared company"}',
    'active',
    '2026-08-01T00:00:00Z',
    '2026-08-08T00:00:00Z',
    encode(digest('{"title":"Owner write fixture"}', 'sha256'), 'hex')
  );

insert into public.personal_job_states(
  user_id,
  canonical_job_id,
  saved,
  excluded,
  application_status,
  memo,
  next_action_at
)
values
  (
    '00000000-0000-4000-8000-0000000000a1',
    '10000000-0000-4000-8000-0000000000a1',
    true,
    false,
    'applied',
    'A lifecycle memo',
    '2026-08-20T09:00:00Z'
  ),
  (
    '00000000-0000-4000-8000-0000000000a1',
    '10000000-0000-4000-8000-0000000000a2',
    true,
    false,
    'interviewing',
    'A purge memo',
    null
  ),
  (
    '00000000-0000-4000-8000-0000000000b1',
    '10000000-0000-4000-8000-0000000000a1',
    false,
    true,
    'rejected',
    'B private memo',
    null
  );

select has_table('public', 'personal_job_states', 'personal state overlay table exists');
select is(
  (select relrowsecurity from pg_class where oid = 'public.personal_job_states'::regclass),
  true,
  'personal state table has RLS enabled'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.personal_job_states'::regclass),
  true,
  'personal state table forces RLS'
);
select ok(
  has_table_privilege('authenticated', 'public.personal_job_states', 'SELECT')
  and has_table_privilege('authenticated', 'public.personal_job_states', 'INSERT')
  and has_table_privilege('authenticated', 'public.personal_job_states', 'UPDATE')
  and has_table_privilege('authenticated', 'public.personal_job_states', 'DELETE'),
  'authenticated users receive CRUD grants constrained by owner RLS'
);

set local role anon;
select throws_like(
  $$select count(*) from public.personal_job_states$$,
  '%permission denied for table personal_job_states%',
  'anonymous users cannot read personal state'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

select is(
  (select count(*)::integer from public.personal_job_states),
  2,
  'an authenticated user reads only their own personal state rows'
);
select throws_like(
  $$
    insert into public.personal_job_states(user_id, canonical_job_id, saved)
    values (
      '00000000-0000-4000-8000-0000000000b1',
      '10000000-0000-4000-8000-0000000000a3',
      true
    )
  $$,
  '%row-level security%',
  'an authenticated user cannot insert another user personal state'
);
with changed as (
  update public.personal_job_states
  set memo = 'cross-user overwrite'
  where user_id = '00000000-0000-4000-8000-0000000000b1'
  returning 1
)
select is((select count(*)::integer from changed), 0, 'cross-user updates affect no rows');
with removed as (
  delete from public.personal_job_states
  where user_id = '00000000-0000-4000-8000-0000000000b1'
  returning 1
)
select is((select count(*)::integer from removed), 0, 'cross-user deletes affect no rows');
select lives_ok(
  $$
    insert into public.personal_job_states(
      user_id,
      canonical_job_id,
      saved,
      application_status,
      memo
    )
    values (
      '00000000-0000-4000-8000-0000000000a1',
      '10000000-0000-4000-8000-0000000000a3',
      true,
      'planned',
      'Owner-created state'
    )
  $$,
  'an owner can insert personal state for a shared canonical job'
);
with changed as (
  update public.personal_job_states
  set application_status = 'offered', memo = 'Owner-updated state'
  where canonical_job_id = '10000000-0000-4000-8000-0000000000a3'
  returning 1
)
select is((select count(*)::integer from changed), 1, 'an owner can update their personal state');
select is(
  (select memo from public.personal_job_states where canonical_job_id = '10000000-0000-4000-8000-0000000000a3'),
  'Owner-updated state',
  'the owner update persists'
);
select throws_like(
  $$
    update public.personal_job_states
    set application_status = 'accepted'
    where canonical_job_id = '10000000-0000-4000-8000-0000000000a3'
  $$,
  '%violates check constraint%',
  'unsupported application status values are rejected'
);
select throws_like(
  $$
    update public.personal_job_states
    set memo = repeat('x', 10001)
    where canonical_job_id = '10000000-0000-4000-8000-0000000000a3'
  $$,
  '%violates check constraint%',
  'personal memos longer than 10000 characters are rejected'
);
select throws_like(
  $$
    insert into public.personal_job_states(user_id, canonical_job_id, saved)
    values (
      '00000000-0000-4000-8000-0000000000a1',
      '10000000-0000-4000-8000-0000000000a1',
      true
    )
  $$,
  '%duplicate key value violates unique constraint%',
  'one sparse overlay row exists per user and canonical job'
);
reset role;

update public.source_postings
set source_status = 'closed', missing_complete_runs = 2
where id = '20000000-0000-4000-8000-0000000000a1';
update public.canonical_jobs
set lifecycle_status = 'closed'
where id = '10000000-0000-4000-8000-0000000000a1';

select is(
  (
    select concat_ws('|', saved, excluded, application_status, memo, next_action_at)
    from public.personal_job_states
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and canonical_job_id = '10000000-0000-4000-8000-0000000000a1'
  ),
  't|f|applied|A lifecycle memo|2026-08-20 09:00:00+00',
  'closing a source and canonical job preserves every personal state value'
);

update public.source_postings
set source_status = 'withdrawn'
where id = '20000000-0000-4000-8000-0000000000a1';
update public.canonical_jobs
set lifecycle_status = 'withdrawn'
where id = '10000000-0000-4000-8000-0000000000a1';

select is(
  (select memo from public.personal_job_states
   where user_id = '00000000-0000-4000-8000-0000000000a1'
     and canonical_job_id = '10000000-0000-4000-8000-0000000000a1'),
  'A lifecycle memo',
  'withdrawing a shared posting preserves the owner memo'
);

set local role service_role;
select is(
  public.purge_source_provider_data('personal-purge-fixture', 'TERMS_WITHDRAWN'),
  1,
  'provider purge changes the incomplete source row'
);
reset role;

select is(
  (
    select concat_ws('|', saved, excluded, application_status, memo)
    from public.personal_job_states
    where user_id = '00000000-0000-4000-8000-0000000000a1'
      and canonical_job_id = '10000000-0000-4000-8000-0000000000a2'
  ),
  't|f|interviewing|A purge memo',
  'provider purge preserves personal state independently of source retention'
);
select is(
  (select source_values from public.source_postings where id = '20000000-0000-4000-8000-0000000000a2'),
  '{}'::jsonb,
  'the purge fixture proves source data was actually scrubbed'
);

delete from auth.users where id = '00000000-0000-4000-8000-0000000000a1';

select is(
  (select count(*)::integer from public.personal_job_states
   where user_id = '00000000-0000-4000-8000-0000000000a1'),
  0,
  'account deletion cascades every personal state owned by the deleted user'
);
select is(
  (select count(*)::integer from public.personal_job_states
   where user_id = '00000000-0000-4000-8000-0000000000b1'),
  1,
  'account deletion preserves another user personal state'
);
select is(
  (select memo from public.personal_job_states
   where user_id = '00000000-0000-4000-8000-0000000000b1'),
  'B private memo',
  'another user private values remain unchanged'
);
select is(
  (select count(*)::integer from public.canonical_jobs
   where id in (
     '10000000-0000-4000-8000-0000000000a1',
     '10000000-0000-4000-8000-0000000000a2',
     '10000000-0000-4000-8000-0000000000a3'
   )),
  3,
  'account deletion never deletes shared canonical jobs'
);
select is(
  (select count(*)::integer from public.source_postings
   where id in (
     '20000000-0000-4000-8000-0000000000a1',
     '20000000-0000-4000-8000-0000000000a2',
     '20000000-0000-4000-8000-0000000000a3'
   )),
  3,
  'account deletion never deletes shared source postings'
);
select is(
  (select count(*)::integer from auth.users where id = '00000000-0000-4000-8000-0000000000a1'),
  0,
  'the account fixture itself was deleted'
);

select * from finish();
rollback;
