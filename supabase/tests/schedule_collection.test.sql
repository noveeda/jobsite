begin;
select plan(30);

create schema cron;
create table cron.job (
  jobid bigint generated always as identity primary key,
  schedule text not null,
  command text not null,
  jobname text not null unique
);
create function cron.schedule(target_jobname text, target_schedule text, target_command text)
returns bigint
language plpgsql
as $$
declare scheduled_job_id bigint;
begin
  insert into cron.job(jobname, schedule, command)
  values (target_jobname, target_schedule, target_command)
  returning jobid into scheduled_job_id;
  return scheduled_job_id;
end;
$$;
create function cron.unschedule(target_job_id bigint)
returns boolean
language sql
as $$
  delete from cron.job where jobid = target_job_id;
  select true;
$$;
grant usage on schema cron to service_role;
grant select on cron.job to service_role;

select has_function(
  'public',
  'enable_collection_schedule',
  array['text', 'uuid'],
  'the service operation for enabling the protected collection schedule exists'
);
select has_function(
  'public',
  'provision_collection_schedule_configuration',
  array['text', 'uuid', 'text', 'text', 'text'],
  'the immutable configuration provisioning operation exists'
);
select has_function(
  'public',
  'disable_collection_schedule',
  array['text', 'uuid'],
  'the service operation for disabling the protected collection schedule exists'
);
select has_function(
  'public',
  'invoke_collection_schedule',
  array[]::text[],
  'the cron command targets a secret-free helper'
);
select ok(
  has_function_privilege('service_role', 'public.enable_collection_schedule(text, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.enable_collection_schedule(text, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.enable_collection_schedule(text, uuid)', 'EXECUTE'),
  'only service role can enable collection scheduling'
);
select ok(
  has_function_privilege('service_role', 'public.disable_collection_schedule(text, uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.disable_collection_schedule(text, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.disable_collection_schedule(text, uuid)', 'EXECUTE'),
  'only service role can disable collection scheduling'
);
select ok(
  has_function_privilege('service_role', 'public.provision_collection_schedule_configuration(text, uuid, text, text, text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.provision_collection_schedule_configuration(text, uuid, text, text, text)', 'EXECUTE')
  and not has_table_privilege('service_role', 'public.collection_schedule_configurations', 'INSERT, UPDATE, DELETE, SELECT'),
  'service role can use the protected configuration operation but has no direct configuration table access'
);
select is((select count(*)::integer from cron.job), 0, 'the migration creates no schedule by default');

set local role service_role;
select is(
  public.enable_collection_schedule('local', null),
  false,
  'local enable is a no-op'
);
select is(
  public.enable_collection_schedule('staging', null),
  false,
  'staging enable is a no-op'
);
select is((select count(*)::integer from cron.job), 0, 'non-production enablement creates no job');
select throws_like(
  $$select public.provision_collection_schedule_configuration(
    'production',
    '10000000-0000-4000-8000-000000000009'::uuid,
    'https://user@jobs.example.com',
    'schedule_app_url',
    'schedule_cron_secret'
  )$$,
  '%invalid production collection schedule configuration%',
  'credentials in a configured origin are rejected'
);
select throws_like(
  $$select public.provision_collection_schedule_configuration(
    'production',
    '10000000-0000-4000-8000-000000000009'::uuid,
    'https://jobs.example.com/path',
    'schedule_app_url',
    'schedule_cron_secret'
  )$$,
  '%invalid production collection schedule configuration%',
  'an origin with a path is rejected'
);
select throws_like(
  $$select public.provision_collection_schedule_configuration(
    'production',
    '10000000-0000-4000-8000-000000000009'::uuid,
    'http://jobs.example.com',
    'schedule_app_url',
    'schedule_cron_secret'
  )$$,
  '%invalid production collection schedule configuration%',
  'a non-HTTPS origin is rejected'
);
select lives_ok(
  $$select public.provision_collection_schedule_configuration(
    'production',
    '10000000-0000-4000-8000-000000000009'::uuid,
    'https://jobs.example.com',
    'schedule_app_url',
    'schedule_cron_secret'
  )$$,
  'a production origin is provisioned once with its immutable marker'
);
reset role;
select throws_like(
  $$update public.collection_schedule_configurations
    set production_marker = '20000000-0000-4000-8000-000000000009'::uuid
    where environment = 'production'$$,
  '%collection schedule configuration is immutable%',
  'a provisioned production marker cannot be changed'
);
set local role service_role;
select is(
  public.enable_collection_schedule('production', '10000000-0000-4000-8000-000000000009'::uuid),
  false,
  'a missing Vault URL and secret leave no schedule'
);
select is((select count(*)::integer from cron.job), 0, 'missing Vault material leaves zero jobs');

reset role;
select vault.create_secret('https://jobs.example.com/path', 'schedule_app_url', 'fixture URL') as id \gset
select vault.create_secret('fixture cron secret', 'schedule_cron_secret', 'fixture secret');
set local role service_role;
select is(
  public.enable_collection_schedule('production', '10000000-0000-4000-8000-000000000009'::uuid),
  false,
  'a Vault URL with a path is rejected against the exact provisioned origin'
);
select is((select count(*)::integer from cron.job), 0, 'an unsafe Vault URL leaves zero jobs');
reset role;
select vault.update_secret(:'id'::uuid, 'https://jobs.example.com', 'schedule_app_url', 'fixture URL', null);
set local role service_role;
select is(
  public.enable_collection_schedule('production', '10000000-0000-4000-8000-000000000009'::uuid),
  true,
  'a valid production preflight creates the hourly schedule'
);
select is((select count(*)::integer from cron.job), 1, 'only one named hourly schedule exists');
select is(
  (select schedule || '|' || command from cron.job),
  '0 * * * *|select public.invoke_collection_schedule();',
  'the scheduled command contains only the secret-free helper call'
);
select ok(
  (select command from cron.job) not like '%fixture cron secret%'
  and (select command from cron.job) not like '%CRON_SECRET%',
  'the scheduled command has no Vault value or environment secret name'
);
select is(
  public.enable_collection_schedule('production', '10000000-0000-4000-8000-000000000009'::uuid),
  true,
  're-enabling replaces the named schedule idempotently'
);
select is((select count(*)::integer from cron.job), 1, 're-enabling still leaves one named job');
select is(
  public.disable_collection_schedule('production', '10000000-0000-4000-8000-000000000009'::uuid),
  true,
  'production disable removes the named schedule'
);
select is((select count(*)::integer from cron.job), 0, 'disable leaves zero scheduled jobs');
select is(
  public.disable_collection_schedule('production', '10000000-0000-4000-8000-000000000009'::uuid),
  true,
  'production disable is idempotent'
);
select is(
  (select t.typname
   from pg_proc as procedure
   join pg_namespace as namespace on namespace.oid = procedure.pronamespace
   join pg_type as t on t.oid = procedure.prorettype
   where namespace.nspname = 'public' and procedure.proname = 'invoke_collection_schedule'),
  'void',
  'the helper cannot return a Vault secret'
);

reset role;

select * from finish();
rollback;
