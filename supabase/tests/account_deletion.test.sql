begin;
select plan(18);

insert into auth.users(id, aud, role, email)
values
  ('00000000-0000-4000-8000-00000000000a', 'authenticated', 'authenticated', 'delete-a@example.com'),
  ('00000000-0000-4000-8000-00000000000b', 'authenticated', 'authenticated', 'delete-b@example.com');

insert into public.duplicate_groups(id, user_id)
values
  ('20000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a'),
  ('20000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b');

insert into public.jobs(id, user_id, title, company_name, deadline_kind, duplicate_group_id, field_provenance)
values
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a', 'A first', 'A company', 'unknown', '20000000-0000-4000-8000-00000000000a', '{}'),
  ('10000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a', 'A second', 'A company', 'unknown', '20000000-0000-4000-8000-00000000000a', '{}'),
  ('10000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-00000000000b', 'B first', 'B company', 'unknown', '20000000-0000-4000-8000-00000000000b', '{}'),
  ('10000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000b', 'B second', 'B company', 'unknown', '20000000-0000-4000-8000-00000000000b', '{}');

insert into public.job_sources(id, user_id, job_id, provider, connector_mode, original_url, normalized_url)
values
  ('30000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000000a1', 'other', 'manual', 'https://example.com/a', 'https://example.com/a'),
  ('30000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-0000000000b1', 'other', 'manual', 'https://example.com/b', 'https://example.com/b');

insert into public.source_checks(id, user_id, source_id, result_status)
values
  ('40000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-00000000000a', 'active'),
  ('40000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-00000000000b', 'active');

insert into public.duplicate_pairs(id, user_id, left_job_id, right_job_id, score, reasons)
values
  ('50000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000a2', 0.9, '{}'),
  ('50000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-0000000000b1', '10000000-0000-4000-8000-0000000000b2', 0.9, '{}');

insert into public.job_revisions(id, user_id, job_id, snapshot, device_id, change_kind)
values
  ('60000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', '10000000-0000-4000-8000-0000000000a1', '{}', '70000000-0000-4000-8000-00000000000a', 'update'),
  ('60000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', '10000000-0000-4000-8000-0000000000b1', '{}', '70000000-0000-4000-8000-00000000000b', 'update');

insert into public.account_consents(id, user_id, terms_version, privacy_version)
values
  ('80000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000a', '2026-08-07', '2026-08-07'),
  ('80000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-00000000000b', '2026-08-07', '2026-08-07');

insert into public.request_usage(user_id, action, bucket_start, request_count)
values
  ('00000000-0000-4000-8000-00000000000a', 'account_delete', date_trunc('hour', now()), 1),
  ('00000000-0000-4000-8000-00000000000b', 'account_delete', date_trunc('hour', now()), 1);

delete from auth.users where id = '00000000-0000-4000-8000-00000000000a';

select is((select count(*)::integer from auth.users where id = '00000000-0000-4000-8000-00000000000a'), 0, 'auth user A is deleted');
select is((select count(*)::integer from public.duplicate_groups where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'A duplicate groups cascade');
select is((select count(*)::integer from public.jobs where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'A jobs cascade');
select is((select count(*)::integer from public.job_sources where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'A job sources cascade');
select is((select count(*)::integer from public.source_checks where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'A source checks cascade');
select is((select count(*)::integer from public.duplicate_pairs where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'A duplicate pairs cascade');
select is((select count(*)::integer from public.job_revisions where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'A job revisions cascade');
select is((select count(*)::integer from public.account_consents where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'A account consents cascade');
select is((select count(*)::integer from public.request_usage where user_id = '00000000-0000-4000-8000-00000000000a'), 0, 'A request usage cascades');

select is((select count(*)::integer from auth.users where id = '00000000-0000-4000-8000-00000000000b'), 1, 'auth user B is preserved');
select is((select count(*)::integer from public.duplicate_groups where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'B duplicate group is preserved');
select is((select count(*)::integer from public.jobs where user_id = '00000000-0000-4000-8000-00000000000b'), 2, 'B jobs are preserved');
select is((select count(*)::integer from public.job_sources where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'B job source is preserved');
select is((select count(*)::integer from public.source_checks where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'B source check is preserved');
select is((select count(*)::integer from public.duplicate_pairs where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'B duplicate pair is preserved');
select is((select count(*)::integer from public.job_revisions where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'B job revision is preserved');
select is((select count(*)::integer from public.account_consents where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'B account consent is preserved');
select is((select count(*)::integer from public.request_usage where user_id = '00000000-0000-4000-8000-00000000000b'), 1, 'B request usage is preserved');

select * from finish();
rollback;
