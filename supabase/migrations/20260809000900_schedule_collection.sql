begin;

create table public.collection_schedule_configurations (
  environment text primary key check (environment in ('local', 'test', 'preview', 'staging', 'production')),
  production_marker uuid,
  allowed_origin text,
  app_base_url_secret_name text not null default 'collection_app_base_url'
    check (app_base_url_secret_name ~ '^[a-z][a-z0-9_]{2,63}$'),
  cron_secret_name text not null default 'collection_cron_secret'
    check (cron_secret_name ~ '^[a-z][a-z0-9_]{2,63}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (
    (environment = 'production'
      and production_marker is not null
      and allowed_origin is not null)
    or
    (environment <> 'production'
      and production_marker is null
      and allowed_origin is null)
  )
);

alter table public.collection_schedule_configurations enable row level security;
alter table public.collection_schedule_configurations force row level security;
revoke all on table public.collection_schedule_configurations from public, anon, authenticated, service_role;

create function public.collection_schedule_configuration_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'collection schedule configuration is immutable' using errcode = '55000';
end;
$$;

create trigger collection_schedule_configuration_immutable
before update or delete on public.collection_schedule_configurations
for each row execute function public.collection_schedule_configuration_immutable();

create function public.collection_schedule_is_safe_origin(target_origin text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $$
  select coalesce(target_origin, '') ~
    '^https://(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::(?:[1-9][0-9]{0,3}|[1-5][0-9]{4}|6[0-4][0-9]{3}|65[0-4][0-9]{2}|655[0-2][0-9]|6553[0-5]))?$';
$$;

create function public.provision_collection_schedule_configuration(
  target_environment text,
  target_production_marker uuid default null,
  target_allowed_origin text default null,
  target_app_base_url_secret_name text default 'collection_app_base_url',
  target_cron_secret_name text default 'collection_cron_secret'
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if target_environment not in ('local', 'test', 'preview', 'staging', 'production') then
    raise exception 'invalid collection schedule environment' using errcode = '22023';
  end if;

  if target_environment = 'production' then
    if target_production_marker is null
       or not public.collection_schedule_is_safe_origin(target_allowed_origin) then
      raise exception 'invalid production collection schedule configuration' using errcode = '22023';
    end if;
  elsif target_production_marker is not null or target_allowed_origin is not null then
    raise exception 'non-production schedule configuration must not have a marker or origin' using errcode = '22023';
  end if;

  insert into public.collection_schedule_configurations (
    environment,
    production_marker,
    allowed_origin,
    app_base_url_secret_name,
    cron_secret_name
  ) values (
    target_environment,
    target_production_marker,
    target_allowed_origin,
    target_app_base_url_secret_name,
    target_cron_secret_name
  ) on conflict (environment) do nothing;

  return found;
end;
$$;

create function public.collection_schedule_unschedule()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing_job_id bigint;
begin
  if to_regclass('cron.job') is null
     or to_regprocedure('cron.unschedule(bigint)') is null then
    return;
  end if;

  for existing_job_id in execute format(
    'select jobid from %I.%I where jobname = $1',
    'cron',
    'job'
  )
    using 'jobsite-collect-hourly'
  loop
    execute format('select %I.%I($1)', 'cron', 'unschedule') using existing_job_id;
  end loop;
end;
$$;

create function public.collection_schedule_preflight(target_marker uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  configured_origin text;
  configured_base_url_secret_name text;
  configured_cron_secret_name text;
  configured_marker uuid;
  vault_base_url text;
  vault_secret_count integer;
begin
  select
    configuration.production_marker,
    configuration.allowed_origin,
    configuration.app_base_url_secret_name,
    configuration.cron_secret_name
  into
    configured_marker,
    configured_origin,
    configured_base_url_secret_name,
    configured_cron_secret_name
  from public.collection_schedule_configurations as configuration
  where configuration.environment = 'production';

  if configured_marker is null
     or configured_marker is distinct from target_marker
     or not public.collection_schedule_is_safe_origin(configured_origin) then
    return null;
  end if;

  select count(*)::integer, max(secret.decrypted_secret)
    into vault_secret_count, vault_base_url
  from vault.decrypted_secrets as secret
  where secret.name = configured_base_url_secret_name;

  if vault_secret_count <> 1
     or vault_base_url is null
     or vault_base_url <> configured_origin then
    return null;
  end if;

  select count(*)::integer into vault_secret_count
  from vault.decrypted_secrets as secret
  where secret.name = configured_cron_secret_name
    and nullif(btrim(secret.decrypted_secret), '') is not null;

  if vault_secret_count <> 1 then
    return null;
  end if;

  return configured_origin || '/api/cron/collect';
end;
$$;

create function public.invoke_collection_schedule()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, vault, net
as $$
declare
  configured_origin text;
  configured_base_url_secret_name text;
  configured_cron_secret_name text;
  vault_base_url text;
  cron_secret text;
begin
  select
    configuration.allowed_origin,
    configuration.app_base_url_secret_name,
    configuration.cron_secret_name
  into
    configured_origin,
    configured_base_url_secret_name,
    configured_cron_secret_name
  from public.collection_schedule_configurations as configuration
  where configuration.environment = 'production';

  if not public.collection_schedule_is_safe_origin(configured_origin) then
    return;
  end if;

  select secret.decrypted_secret into vault_base_url
  from vault.decrypted_secrets as secret
  where secret.name = configured_base_url_secret_name
  limit 1;
  select secret.decrypted_secret into cron_secret
  from vault.decrypted_secrets as secret
  where secret.name = configured_cron_secret_name
  limit 1;

  if vault_base_url is null
     or vault_base_url <> configured_origin
     or cron_secret is null
     or btrim(cron_secret) = '' then
    return;
  end if;

  begin
    perform net.http_post(
      url := configured_origin || '/api/cron/collect',
      body := jsonb_build_object('reason', 'scheduled'),
      headers := jsonb_build_object(
        'authorization', 'Bearer ' || cron_secret,
        'content-type', 'application/json'
      ),
      timeout_milliseconds := 10000
    );
  exception when others then
    return;
  end;
end;
$$;

create function public.enable_collection_schedule(target_environment text, target_production_marker uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  endpoint text;
begin
  if target_environment in ('local', 'test', 'preview', 'staging') then
    return false;
  end if;
  if target_environment <> 'production' then
    raise exception 'invalid collection schedule environment' using errcode = '22023';
  end if;

  perform public.collection_schedule_unschedule();
  if to_regclass('cron.job') is null
     or to_regprocedure('cron.schedule(text,text,text)') is null
     or to_regprocedure('cron.unschedule(bigint)') is null then
    return false;
  end if;

  endpoint := public.collection_schedule_preflight(target_production_marker);
  if endpoint is null then
    return false;
  end if;

  begin
    execute format('select %I.%I($1, $2, $3)', 'cron', 'schedule')
      using 'jobsite-collect-hourly', '0 * * * *', 'select public.invoke_collection_schedule();';
  exception when others then
    perform public.collection_schedule_unschedule();
    return false;
  end;

  return true;
end;
$$;

create function public.disable_collection_schedule(target_environment text, target_production_marker uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  configured_marker uuid;
begin
  if target_environment in ('local', 'test', 'preview', 'staging') then
    return false;
  end if;
  if target_environment <> 'production' then
    raise exception 'invalid collection schedule environment' using errcode = '22023';
  end if;

  select configuration.production_marker into configured_marker
  from public.collection_schedule_configurations as configuration
  where configuration.environment = 'production';
  if configured_marker is null or configured_marker is distinct from target_production_marker then
    return false;
  end if;

  perform public.collection_schedule_unschedule();
  return true;
end;
$$;

revoke all on function public.collection_schedule_is_safe_origin(text) from public, anon, authenticated, service_role;
revoke all on function public.provision_collection_schedule_configuration(text, uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.collection_schedule_unschedule() from public, anon, authenticated, service_role;
revoke all on function public.collection_schedule_preflight(uuid) from public, anon, authenticated, service_role;
revoke all on function public.invoke_collection_schedule() from public, anon, authenticated, service_role;
revoke all on function public.enable_collection_schedule(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.disable_collection_schedule(text, uuid) from public, anon, authenticated, service_role;

grant execute on function public.provision_collection_schedule_configuration(text, uuid, text, text, text) to service_role;
grant execute on function public.enable_collection_schedule(text, uuid) to service_role;
grant execute on function public.disable_collection_schedule(text, uuid) to service_role;

commit;
