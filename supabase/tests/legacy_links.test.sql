begin;

select plan(29);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000701', 'authenticated', 'authenticated', 'legacy-links-a@example.com'),
  ('00000000-0000-4000-8000-000000000702', 'authenticated', 'authenticated', 'legacy-links-b@example.com');

insert into public.source_providers(code, display_name, enabled, retention_policy)
values ('legacy-links-fixture', 'Legacy links fixture', false, '{"retainDays":30}'::jsonb);

insert into public.jobs(id, user_id, title, company_name, application_status, memo)
values (
  '10000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000701',
  'Manual link fixture',
  'Owner A',
  'applied',
  'Keep this private memo'
);

insert into public.canonical_jobs(id, title, company_name, lifecycle_status, last_observed_at, field_provenance)
values (
  '20000000-0000-4000-8000-000000000701',
  'Catalog link fixture',
  'Shared catalog company',
  'active',
  '2026-08-09T00:00:00Z',
  '{}'
);

insert into public.source_postings(
  id, provider_code, canonical_job_id, external_id, original_url, normalized_url,
  source_values, source_status, first_observed_at, last_observed_at, content_fingerprint
)
values (
  '30000000-0000-4000-8000-000000000701',
  'legacy-links-fixture',
  '20000000-0000-4000-8000-000000000701',
  'exact-701',
  'https://example.com/jobs/exact-701',
  'https://example.com/jobs/exact-701',
  '{"title":"Catalog link fixture"}',
  'active',
  '2026-08-08T00:00:00Z',
  '2026-08-09T00:00:00Z',
  'legacy-links-fixture-701'
);

select has_table('public', 'manual_catalog_links', 'manual jobs have an owner-scoped exact catalog source link table');
select has_table('public', 'unresolved_source_overlays', 'unresolved source state has private owner-scoped storage');
select has_table('public', 'unresolved_duplicate_overlays', 'unresolved duplicate decisions have private owner-scoped storage');
select is((select relforcerowsecurity from pg_class where oid = 'public.manual_catalog_links'::regclass), true, 'manual catalog links force RLS');
select is((select relforcerowsecurity from pg_class where oid = 'public.unresolved_source_overlays'::regclass), true, 'unresolved source overlays force RLS');
select is((select relforcerowsecurity from pg_class where oid = 'public.unresolved_duplicate_overlays'::regclass), true, 'unresolved duplicate overlays force RLS');
select ok(
  not has_table_privilege('authenticated', 'public.manual_catalog_links', 'SELECT')
  and not has_table_privilege('authenticated', 'public.manual_catalog_links', 'INSERT')
  and not has_table_privilege('authenticated', 'public.manual_catalog_links', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.manual_catalog_links', 'DELETE')
  and not has_table_privilege('authenticated', 'public.unresolved_source_overlays', 'SELECT')
  and not has_table_privilege('authenticated', 'public.unresolved_source_overlays', 'INSERT')
  and not has_table_privilege('authenticated', 'public.unresolved_source_overlays', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.unresolved_source_overlays', 'DELETE')
  and not has_table_privilege('authenticated', 'public.unresolved_duplicate_overlays', 'SELECT')
  and not has_table_privilege('authenticated', 'public.unresolved_duplicate_overlays', 'INSERT')
  and not has_table_privilege('authenticated', 'public.unresolved_duplicate_overlays', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.unresolved_duplicate_overlays', 'DELETE'),
  'authenticated users have no direct private-link or overlay table grants'
);
select ok(
  has_function_privilege('authenticated', 'public.link_manual_job_to_catalog(uuid, text, text, text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.unlink_manual_catalog_link(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.get_manual_catalog_link(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.link_manual_job_to_catalog(uuid, text, text, text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.link_manual_job_to_catalog(uuid, text, text, text)', 'EXECUTE'),
  'only authenticated callers can use legacy link helpers'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'manual_catalog_links'
      and policyname = 'manual_catalog_links_owner_all'
  ) and exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'unresolved_source_overlays'
      and policyname = 'unresolved_source_overlays_owner_all'
  ) and exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'unresolved_duplicate_overlays'
      and policyname = 'unresolved_duplicate_overlays_owner_all'
  ),
  'all private U1 tables define owner policies'
);

set local role anon;
select throws_like(
  $$select count(*) from public.manual_catalog_links$$,
  '%permission denied for table manual_catalog_links%',
  'anonymous callers cannot read manual catalog links'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);
select is(
  public.link_manual_job_to_catalog(
    '10000000-0000-4000-8000-000000000701',
    'legacy-links-fixture',
    'exact-701',
    'https://example.com/jobs/exact-701'
  ) #>> '{canonicalJobId}',
  '20000000-0000-4000-8000-000000000701',
  'an owner links a manual job to the exact resolved catalog source identity'
);
select is(
  public.get_manual_catalog_link('10000000-0000-4000-8000-000000000701') #>> '{originalUrl}',
  'https://example.com/jobs/exact-701',
  'an owner can project their safe portable link reference'
);
select throws_like(
  $$insert into public.manual_catalog_links(user_id, manual_job_id, source_posting_id, provider_code, external_id, original_url) values ('00000000-0000-4000-8000-000000000701', '10000000-0000-4000-8000-000000000701', '30000000-0000-4000-8000-000000000701', 'legacy-links-fixture', 'exact-701', 'https://example.com/jobs/exact-701')$$,
  '%permission denied for table manual_catalog_links%',
  'owners cannot bypass the exact-identity helper with direct link DML'
);
select throws_like(
  $$select public.link_manual_job_to_catalog('10000000-0000-4000-8000-000000000701', 'legacy-links-fixture', 'exact-701', 'https://example.com/jobs/different')$$,
  '%catalog source identity unavailable%',
  'a mismatched original URL fails without relinking the manual job'
);
select is(
  (select concat_ws('|', application_status::text, memo) from public.jobs where id = '10000000-0000-4000-8000-000000000701'),
  'applied|Keep this private memo',
  'linking preserves the manual job status and memo'
);
reset role;
select is((select count(*)::integer from public.canonical_jobs), 1, 'linking does not create or alter canonical jobs');
select is((select count(*)::integer from public.source_postings), 1, 'linking does not create or alter source postings');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000701', true);
select is(
  public.unlink_manual_catalog_link('10000000-0000-4000-8000-000000000701') #>> '{unlinked}',
  'true',
  'an owner can unlink their manual job without changing shared catalog rows'
);
select is(
  public.get_manual_catalog_link('10000000-0000-4000-8000-000000000701'),
  null,
  'unlink removes only the owner private link'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000702', true);
select is(
  public.get_manual_catalog_link('10000000-0000-4000-8000-000000000701'),
  null,
  'a different owner cannot project another user manual link'
);
select throws_like(
  $$select public.link_manual_job_to_catalog('10000000-0000-4000-8000-000000000701', 'legacy-links-fixture', 'exact-701', 'https://example.com/jobs/exact-701')$$,
  '%manual job unavailable%',
  'a different owner cannot link another user manual job'
);
select throws_like(
  $$insert into public.unresolved_source_overlays(user_id, provider_code, external_id, original_url, state_payload, safe_display) values ('00000000-0000-4000-8000-000000000702', 'legacy-links-fixture', 'missing-702', 'https://example.com/jobs/missing-702', '{}', '{"title":"Private overlay"}')$$,
  '%permission denied for table unresolved_source_overlays%',
  'owners cannot directly insert unresolved source overlays'
);
select throws_like(
  $$insert into public.unresolved_duplicate_overlays(user_id, left_provider_code, left_external_id, left_original_url, right_provider_code, right_external_id, right_original_url, decision, left_safe_display, right_safe_display) values ('00000000-0000-4000-8000-000000000702', 'legacy-links-fixture', 'left-702', 'https://example.com/jobs/left-702', 'legacy-links-fixture', 'right-702', 'https://example.com/jobs/right-702', 'merge', '{"title":"Left"}', '{"title":"Right"}')$$,
  '%permission denied for table unresolved_duplicate_overlays%',
  'owners cannot directly insert unresolved duplicate overlays'
);
reset role;

insert into public.unresolved_source_overlays(user_id, provider_code, external_id, original_url, state_payload, safe_display)
values ('00000000-0000-4000-8000-000000000701', 'legacy-links-fixture', 'missing-701', 'https://example.com/jobs/missing-701', '{"saved":true}', '{"title":"Private overlay"}');
select throws_like(
  $$insert into public.unresolved_source_overlays(user_id, provider_code, external_id, original_url, state_payload, safe_display) values ('00000000-0000-4000-8000-000000000701', 'legacy-links-fixture', 'raw-701', 'https://example.com/jobs/raw-701', '{}', '{"rawSourceValues":{"secret":"no"}}')$$,
  '%unresolved_source_overlays_safe_display_check%',
  'unresolved source overlays reject raw provider-shaped display data'
);
select throws_like(
  $$insert into public.unresolved_source_overlays(user_id, provider_code, external_id, original_url, state_payload, safe_display) values ('00000000-0000-4000-8000-000000000701', 'legacy-links-fixture', 'invalid-state-701', 'https://example.com/jobs/invalid-state-701', '{"applicationStatus":"accepted"}', '{"title":"Invalid state"}')$$,
  '%unresolved_source_overlays_state_payload_check%',
  'unresolved source overlays reject the legacy-only accepted state'
);
select throws_like(
  $$insert into public.unresolved_duplicate_overlays(user_id, left_provider_code, left_external_id, left_original_url, right_provider_code, right_external_id, right_original_url, decision, left_safe_display, right_safe_display) values ('00000000-0000-4000-8000-000000000701', 'legacy-links-fixture', 'right-701', 'https://example.com/jobs/right-701', 'legacy-links-fixture', 'left-701', 'https://example.com/jobs/left-701', 'merge', '{"title":"Left"}', '{"title":"Right"}')$$,
  '%unresolved_duplicate_overlays_endpoint_order_check%',
  'unresolved duplicate overlays require one canonical endpoint order'
);
select is((select count(*)::integer from public.canonical_jobs), 1, 'private overlay storage never creates shared canonical jobs');
select is((select count(*)::integer from public.source_postings), 1, 'private overlay storage never creates shared source postings');
select is((select count(*)::integer from public.catalog_duplicate_candidates), 0, 'private overlay storage never creates shared duplicate candidates');

select * from finish();
rollback;
