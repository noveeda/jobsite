create type public.rate_limit_action as enum (
  'source_preview',
  'source_refresh',
  'import_validate',
  'import_commit',
  'consent_write',
  'account_delete',
  'mutation_write'
);

create table public.account_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  constraint account_consents_terms_version_check
    check (terms_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  constraint account_consents_privacy_version_check
    check (privacy_version ~ '^[A-Za-z0-9._-]{1,40}$'),
  constraint account_consents_user_versions_key
    unique (user_id, terms_version, privacy_version)
);

create index account_consents_user_accepted_idx
  on public.account_consents(user_id, accepted_at desc);

alter table public.account_consents enable row level security;
alter table public.account_consents force row level security;

create policy account_consents_owner_select
  on public.account_consents
  for select
  using (auth.uid() is not null and auth.uid() = user_id);

revoke all on table public.account_consents from public, anon, authenticated;
grant select on table public.account_consents to authenticated;

create table public.request_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  action public.rate_limit_action not null,
  bucket_start timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, action, bucket_start),
  constraint request_usage_positive_count_check check (request_count > 0),
  constraint request_usage_action_maximum_check check (
    request_count <= case action
      when 'source_preview' then 10
      when 'source_refresh' then 30
      when 'import_validate' then 10
      when 'import_commit' then 3
      when 'consent_write' then 10
      when 'account_delete' then 3
      when 'mutation_write' then 60
    end
  )
);

alter table public.request_usage enable row level security;
alter table public.request_usage force row level security;

revoke all on table public.request_usage from public, anon, authenticated;
revoke all on type public.rate_limit_action from public, anon, authenticated;
grant usage on type public.rate_limit_action to authenticated;

create or replace function public.consume_rate_limit(
  target_action public.rate_limit_action
)
returns table (
  allowed boolean,
  limit_value integer,
  remaining integer,
  reset_at timestamptz,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  observed_at timestamptz := clock_timestamp();
  window_seconds integer;
  maximum_requests integer;
  current_bucket timestamptz;
  next_reset timestamptz;
  resulting_count integer := null;
  incremented boolean := false;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select policy.window_seconds, policy.maximum_requests
    into window_seconds, maximum_requests
  from (
    values
      ('source_preview'::public.rate_limit_action, 60, 10),
      ('source_refresh'::public.rate_limit_action, 1800, 30),
      ('import_validate'::public.rate_limit_action, 3600, 10),
      ('import_commit'::public.rate_limit_action, 3600, 3),
      ('consent_write'::public.rate_limit_action, 3600, 10),
      ('account_delete'::public.rate_limit_action, 3600, 3),
      ('mutation_write'::public.rate_limit_action, 60, 60)
  ) as policy(action, window_seconds, maximum_requests)
  where policy.action = target_action;

  if window_seconds is null or maximum_requests is null then
    raise exception 'unsupported rate limit action' using errcode = '22023';
  end if;

  current_bucket := to_timestamp(
    floor(extract(epoch from observed_at) / window_seconds) * window_seconds
  );
  next_reset := current_bucket + make_interval(secs => window_seconds);

  insert into public.request_usage as usage (
    user_id,
    action,
    bucket_start,
    request_count,
    updated_at
  ) values (
    caller_id,
    target_action,
    current_bucket,
    1,
    observed_at
  )
  on conflict (user_id, action, bucket_start) do update
    set request_count = usage.request_count + 1,
        updated_at = excluded.updated_at
    where usage.request_count < maximum_requests
  returning request_count into resulting_count;

  incremented := resulting_count is not null;
  if not incremented then
    select usage.request_count
      into resulting_count
    from public.request_usage as usage
    where usage.user_id = caller_id
      and usage.action = target_action
      and usage.bucket_start = current_bucket;
  end if;

  return query select
    incremented,
    maximum_requests,
    case when incremented then greatest(maximum_requests - resulting_count, 0) else 0 end,
    next_reset,
    case
      when incremented then 0
      else greatest(1, ceil(extract(epoch from next_reset - observed_at))::integer)
    end;
end;
$$;

revoke all on function public.consume_rate_limit(public.rate_limit_action)
  from public, anon, authenticated;
grant execute on function public.consume_rate_limit(public.rate_limit_action)
  to authenticated;

alter function public.preview_backup_restore(jsonb)
  rename to preview_backup_restore_unchecked;

revoke all on function public.preview_backup_restore_unchecked(jsonb)
  from public, anon, authenticated;

create function public.preview_backup_restore(target_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if octet_length(target_payload::text) > 10485760 then
    raise exception 'backup payload exceeds 10 MiB' using errcode = '22023';
  end if;

  if jsonb_typeof(target_payload->'jobs') = 'array'
     and jsonb_array_length(target_payload->'jobs') > 10000 then
    raise exception 'backup jobs limit exceeded' using errcode = '22023';
  end if;
  if jsonb_typeof(target_payload->'sources') = 'array'
     and jsonb_array_length(target_payload->'sources') > 20000 then
    raise exception 'backup sources limit exceeded' using errcode = '22023';
  end if;
  if jsonb_typeof(target_payload->'duplicatePairs') = 'array'
     and jsonb_array_length(target_payload->'duplicatePairs') > 20000 then
    raise exception 'backup duplicate pairs limit exceeded' using errcode = '22023';
  end if;
  if jsonb_typeof(target_payload->'revisions') = 'array'
     and jsonb_array_length(target_payload->'revisions') > 100000 then
    raise exception 'backup revisions limit exceeded' using errcode = '22023';
  end if;

  return public.preview_backup_restore_unchecked(target_payload);
end;
$$;

revoke all on function public.preview_backup_restore(jsonb)
  from public, anon, authenticated;
grant execute on function public.preview_backup_restore(jsonb)
  to authenticated;

revoke all on function public.commit_backup_restore(jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.commit_backup_restore(jsonb, uuid)
  to authenticated;



-- Account deletion cascades must not create a new revision for a user that is
-- already being removed. Direct job deletion still records a recoverable snapshot.
create or replace function public.record_job_revision()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_kind text := coalesce(nullif(current_setting('app.change_kind', true), ''), case when tg_op = 'DELETE' then 'delete' else 'update' end);
  requested_device uuid;
begin
  if tg_op = 'DELETE' and not exists(select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  begin
    requested_device := nullif(current_setting('app.device_id', true), '')::uuid;
  exception when others then
    requested_device := gen_random_uuid();
  end;
  insert into public.job_revisions(user_id, job_id, snapshot, device_id, change_kind)
  values (old.user_id, old.id, to_jsonb(old) - 'search_document', coalesce(requested_device, gen_random_uuid()), requested_kind);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
