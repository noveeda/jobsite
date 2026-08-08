begin;
select plan(14);

insert into auth.users(id, aud, role, email)
values ('00000000-0000-4000-8000-0000000000a5', 'authenticated', 'authenticated', 'activation-operator@example.com');

insert into public.source_providers (
  code, display_name, enabled, access_mode, terms_url, approval_reference,
  activation_required, approval_status, approval_expires_at, staging_smoke_reference,
  enabled_at, enabled_by, attribution, retention_policy
) values (
  'saramin', 'Saramin', true, 'approved_api', 'https://oapi.saramin.co.kr/guide/job-search', 'SAR-APPROVAL-TEST',
  true, 'approved', '2026-12-31T00:00:00Z', 'staging-smoke-test',
  '2026-08-09T00:00:00Z', '00000000-0000-4000-8000-0000000000a5',
  '{"text":"Powered by 취업 사람인","href":"https://www.saramin.co.kr"}',
  '{"allowedSourceFields":["title"],"retentionDays":1}'
);

select has_column('public', 'source_providers', 'activation_required', 'provider activation is an explicit opt-in');
select has_column('public', 'source_providers', 'approval_status', 'provider approval status is recorded');
select has_column('public', 'source_providers', 'approval_expires_at', 'provider approval expiry is recorded');
select has_column('public', 'source_providers', 'staging_smoke_reference', 'staging smoke evidence is recorded');
select has_column('public', 'source_providers', 'enabled_at', 'operator enablement time is recorded');
select has_column('public', 'source_providers', 'enabled_by', 'operator enablement actor is recorded');

select throws_like(
  $$insert into public.source_providers(code, display_name, enabled, access_mode, terms_url, approval_reference, activation_required, approval_status, attribution, retention_policy, staging_smoke_reference)
    values ('unapproved-live', 'Unapproved', true, 'approved_api', 'https://example.invalid/terms', 'approval-reference', true, 'pending', '{"text":"Attribution","href":"https://example.invalid"}', '{"retentionDays":1}', 'staging-smoke')$$,
  '%source_providers_enabled_activation_check%',
  'an activation-required provider cannot enable while approval is pending'
);

select throws_like(
  $$insert into public.source_providers(code, display_name, enabled, access_mode, terms_url, activation_required, approval_status, attribution, retention_policy)
    values ('missing-evidence', 'Missing evidence', false, 'approved_api', 'https://example.invalid/terms', true, 'approved', '{"text":"Attribution","href":"https://example.invalid"}', '{}')$$,
  '%source_providers_activation_record_check%',
  'activation-required providers need retention and staging evidence even while disabled'
);

select is(
  (select approval_status from public.source_providers where code = 'saramin'),
  'approved',
  'the restricted record keeps approval state without any credential column'
);
select is(
  (select count(*)::integer from information_schema.columns where table_schema = 'public' and table_name = 'source_providers' and column_name ~* '(secret|token|api.*key|credential)'),
  0,
  'source approval records contain no credential-shaped column'
);

set local role anon;
select throws_like($$select approval_status from public.source_providers where code = 'saramin'$$, '%permission denied%', 'anonymous users cannot read approval records');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a5', true);
select throws_like($$select approval_status from public.source_providers where code = 'saramin'$$, '%permission denied%', 'authenticated users cannot read approval records');
select throws_like($$update public.source_providers set enabled = false where code = 'saramin'$$, '%permission denied%', 'authenticated users cannot toggle activation records');
reset role;

select is(
  (select count(*)::integer from information_schema.role_table_grants
   where table_schema = 'public' and table_name = 'source_providers'
     and grantee in ('PUBLIC', 'anon', 'authenticated')
     and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  0,
  'browser roles retain no source-provider approval grants'
);

select * from finish();
rollback;
