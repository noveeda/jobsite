begin;
select plan(12);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000d501', 'authenticated', 'authenticated', 'group-owner@example.com'),
  ('00000000-0000-4000-8000-00000000d502', 'authenticated', 'authenticated', 'group-other@example.com');

insert into public.account_consents(user_id, terms_version, privacy_version)
values
  ('00000000-0000-4000-8000-00000000d501', '2026-08-07', '2026-08-07'),
  ('00000000-0000-4000-8000-00000000d502', '2026-08-07', '2026-08-07');

insert into public.source_providers(code, display_name, enabled, access_mode, terms_url, attribution, retention_policy)
values
  ('group-one', 'Group One', true, 'approved_api', 'https://group-one.example.invalid/terms', '{"text":"Group One","href":"https://group-one.example.invalid"}', '{"allowedSourceFields":["title"]}'),
  ('group-two', 'Group Two', true, 'approved_api', 'https://group-two.example.invalid/terms', '{"text":"Group Two","href":"https://group-two.example.invalid"}', '{"allowedSourceFields":["title"]}');

insert into public.collection_runs(id, provider_code, schedule_bucket, run_kind, status, snapshot_complete, started_at, finished_at)
values
  ('00000000-0000-4000-8000-00000000d511', 'group-one', '2026-08-09T00:00:00Z', 'reconciliation', 'succeeded', true, '2026-08-09T00:00:00Z', '2026-08-09T00:01:00Z'),
  ('00000000-0000-4000-8000-00000000d512', 'group-two', '2026-08-09T00:00:00Z', 'reconciliation', 'succeeded', true, '2026-08-09T00:00:00Z', '2026-08-09T00:01:00Z');

insert into public.canonical_jobs(id, title, company_name, posted_at, deadline_kind, lifecycle_status, last_observed_at)
values
  ('00000000-0000-4000-8000-00000000d521', '묶음 A', '그룹 회사', '2026-08-09T10:00:00Z', 'rolling', 'active', '2026-08-09T10:00:00Z'),
  ('00000000-0000-4000-8000-00000000d522', '묶음 B', '그룹 회사', '2026-08-09T09:00:00Z', 'rolling', 'active', '2026-08-09T09:00:00Z'),
  ('00000000-0000-4000-8000-00000000d523', '일반 C', '그룹 회사', '2026-08-09T08:00:00Z', 'rolling', 'active', '2026-08-09T08:00:00Z');

insert into public.source_postings(id, provider_code, canonical_job_id, external_id, original_url, normalized_url, source_values, source_status, first_observed_at, last_observed_at, last_collection_run_id, content_fingerprint)
values
  ('00000000-0000-4000-8000-00000000d531', 'group-one', '00000000-0000-4000-8000-00000000d521', 'group-a', 'https://group-one.example.invalid/jobs/a', 'https://group-one.example.invalid/jobs/a', '{"title":"묶음 A"}', 'active', '2026-08-09T10:00:00Z', '2026-08-09T10:00:00Z', '00000000-0000-4000-8000-00000000d511', 'group-a'),
  ('00000000-0000-4000-8000-00000000d532', 'group-two', '00000000-0000-4000-8000-00000000d522', 'group-b', 'https://group-two.example.invalid/jobs/b', 'https://group-two.example.invalid/jobs/b', '{"title":"묶음 B"}', 'active', '2026-08-09T09:00:00Z', '2026-08-09T09:00:00Z', '00000000-0000-4000-8000-00000000d512', 'group-b'),
  ('00000000-0000-4000-8000-00000000d533', 'group-one', '00000000-0000-4000-8000-00000000d523', 'group-c', 'https://group-one.example.invalid/jobs/c', 'https://group-one.example.invalid/jobs/c', '{"title":"일반 C"}', 'active', '2026-08-09T08:00:00Z', '2026-08-09T08:00:00Z', '00000000-0000-4000-8000-00000000d511', 'group-c');

insert into public.catalog_duplicate_candidates(id, left_canonical_job_id, right_canonical_job_id, left_source_posting_id, right_source_posting_id, left_generation_id, right_generation_id, score, reasons)
values ('00000000-0000-4000-8000-00000000d541', '00000000-0000-4000-8000-00000000d521', '00000000-0000-4000-8000-00000000d522', '00000000-0000-4000-8000-00000000d531', '00000000-0000-4000-8000-00000000d532', '00000000-0000-4000-8000-00000000d511', '00000000-0000-4000-8000-00000000d512', 0.90, '["title_company"]');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d501', true);

select is((public.get_catalog_feed('{}', 30)->>'total')::integer, 3, 'normal feed remains ungrouped before an owner confirms a duplicate');
select is(
  public.set_catalog_duplicate_decision('00000000-0000-4000-8000-00000000d541', 'merge', '00000000-0000-4000-8000-00000000d551', 0, '{}'::jsonb)->>'status',
  'merged',
  'owner confirmation creates a personal duplicate group'
);
select is((public.get_catalog_feed('{}', 30)->>'total')::integer, 2, 'a confirmed group projects as one card before count and limit');
select is(
  public.get_catalog_feed('{}', 30)#>'{items,0,duplicateGroup,memberIds}',
  '["00000000-0000-4000-8000-00000000d521","00000000-0000-4000-8000-00000000d522"]'::jsonb,
  'the grouped card exposes deterministic member links'
);
select is(public.get_catalog_feed('{}', 30)#>>'{items,0,duplicateGroup,reasons,0}', 'title_company', 'the grouped card exposes its match reason');

insert into public.personal_job_states(user_id, canonical_job_id, excluded)
values ('00000000-0000-4000-8000-00000000d501', '00000000-0000-4000-8000-00000000d521', true);
select is((public.get_catalog_feed('{}', 30)->>'total')::integer, 2, 'a group stays visible when one member is excluded but another remains visible');

insert into public.personal_job_states(user_id, canonical_job_id, saved)
values ('00000000-0000-4000-8000-00000000d501', '00000000-0000-4000-8000-00000000d522', true);
select is((public.get_catalog_feed('{"saved":true}', 30)->>'total')::integer, 1, 'a saved-only member retains its confirmed group card');

update public.personal_job_states set excluded = true
where user_id = '00000000-0000-4000-8000-00000000d501'
  and canonical_job_id = '00000000-0000-4000-8000-00000000d522';
select is((public.get_catalog_feed('{}', 30)->>'total')::integer, 1, 'a group is hidden only when every member is excluded');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d502', true);
select is((public.get_catalog_feed('{}', 30)->>'total')::integer, 3, 'another user decision and overlay never change the common cards');
reset role;

update public.catalog_duplicate_candidates set status = 'superseded'
where id = '00000000-0000-4000-8000-00000000d541';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d501', true);
select is((public.get_catalog_feed('{"includeExcluded":true}', 30)->>'total')::integer, 3, 'inactive evidence no longer groups normal feed cards');
select is(public.get_catalog_duplicate_detail('00000000-0000-4000-8000-00000000d521')#>>'{candidates,0,active}', 'false', 'the owner can safely inspect inactive candidate history without a new suggestion');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000d502', true);
select is(public.get_catalog_duplicate_detail('00000000-0000-4000-8000-00000000d521'), '{"candidates":[]}'::jsonb, 'inactive candidate history stays private to its owner');

reset role;
select * from finish();
rollback;
