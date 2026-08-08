begin;

create function public.is_source_provider_enabled(target_provider_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(
    (select provider.enabled from public.source_providers as provider where provider.code = target_provider_code),
    false
  );
$$;

revoke all on function public.is_source_provider_enabled(text) from public, anon;
grant execute on function public.is_source_provider_enabled(text) to authenticated;

create policy canonical_jobs_consented_select
  on public.canonical_jobs
  for select
  to authenticated
  using (
    lifecycle_status in ('active', 'stale')
    and exists (
      select 1
      from public.account_consents as consent
      where consent.user_id = auth.uid()
    )
    and exists (
      select 1
      from public.source_postings as posting
      where posting.canonical_job_id = canonical_jobs.id
        and public.is_source_provider_enabled(posting.provider_code)
        and posting.source_status in ('active', 'missing_once')
    )
  );

create policy source_postings_consented_select
  on public.source_postings
  for select
  to authenticated
  using (
    source_status in ('active', 'missing_once')
    and exists (
      select 1
      from public.account_consents as consent
      where consent.user_id = auth.uid()
    )
    and public.is_source_provider_enabled(source_postings.provider_code)
  );

grant select on table public.canonical_jobs to authenticated;
grant select on table public.source_postings to authenticated;

create function public.claim_collection_run(
  target_provider_code text,
  target_schedule_bucket timestamptz,
  target_run_kind text default 'incremental',
  target_lease_seconds integer default 300
)
returns setof public.collection_runs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_record public.source_providers%rowtype;
begin
  if target_lease_seconds < 30 or target_lease_seconds > 1800 then
    raise exception 'invalid lease duration' using errcode = '22023';
  end if;

  select provider.* into provider_record
  from public.source_providers as provider
  where provider.code = target_provider_code
  for update;

  if not found
     or not provider_record.enabled
     or (
       provider_record.last_success_at is not null
       and provider_record.last_success_at
         + make_interval(mins => provider_record.refresh_interval_minutes) > clock_timestamp()
     ) then
    return;
  end if;

  if exists (
    select 1
    from public.collection_runs as active_run
    where active_run.provider_code = target_provider_code
      and active_run.status = 'running'
      and active_run.lease_until > clock_timestamp()
  ) then
    return;
  end if;

  update public.collection_runs as expired_run
  set status = 'failed',
      lease_until = null,
      finished_at = clock_timestamp(),
      error_code = 'LEASE_EXPIRED',
      error_summary = 'provider lease expired before completion'
  where expired_run.provider_code = target_provider_code
    and expired_run.status = 'running'
    and (expired_run.lease_until is null or expired_run.lease_until <= clock_timestamp());

  return query
  insert into public.collection_runs as run (
    provider_code,
    schedule_bucket,
    run_kind,
    status,
    lease_until,
    attempt_count,
    started_at
  ) values (
    provider_record.code,
    target_schedule_bucket,
    target_run_kind,
    'running',
    clock_timestamp() + make_interval(secs => target_lease_seconds),
    1,
    clock_timestamp()
  )
  on conflict (provider_code, schedule_bucket, run_kind) do update
    set status = 'running',
        lease_until = clock_timestamp() + make_interval(secs => target_lease_seconds),
        attempt_count = run.attempt_count + 1,
        started_at = clock_timestamp(),
        finished_at = null,
        error_code = null,
        error_summary = null
    where run.status in ('pending', 'partial', 'failed')
      and (run.lease_until is null or run.lease_until <= clock_timestamp())
  returning run.*;
end;
$$;
create function public.consume_provider_quota(
  target_provider_code text,
  target_bucket text default 'scheduled',
  target_amount integer default 1,
  target_usage_date date default ((clock_timestamp() at time zone 'utc')::date)
)
returns table (
  allowed boolean,
  scheduled_calls integer,
  reserve_calls integer,
  hard_limit integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_limit integer;
  scheduled_limit integer;
  existing_scheduled integer;
  existing_reserve integer;
begin
  if target_bucket not in ('scheduled', 'reserve') or target_amount <= 0 then
    raise exception 'invalid quota request' using errcode = '22023';
  end if;

  select
    provider.daily_limit,
    coalesce((provider.capabilities->>'scheduled_daily_limit')::integer, provider.daily_limit)
  into provider_limit, scheduled_limit
  from public.source_providers as provider
  where provider.code = target_provider_code
    and provider.enabled
  for update;

  if provider_limit is null then
    return query select false, 0, 0, coalesce(provider_limit, 0);
    return;
  end if;

  if scheduled_limit < 0 or scheduled_limit > provider_limit then
    raise exception 'invalid provider quota configuration' using errcode = '22023';
  end if;

  insert into public.provider_daily_usage(provider_code, usage_date)
  values (target_provider_code, target_usage_date)
  on conflict (provider_code, usage_date) do nothing;

  select usage.scheduled_calls, usage.reserve_calls
  into existing_scheduled, existing_reserve
  from public.provider_daily_usage as usage
  where usage.provider_code = target_provider_code
    and usage.usage_date = target_usage_date
  for update;

  allowed := existing_scheduled + existing_reserve + target_amount <= provider_limit
    and (target_bucket <> 'scheduled' or existing_scheduled + target_amount <= scheduled_limit);

  if allowed then
    update public.provider_daily_usage as usage
    set scheduled_calls = usage.scheduled_calls + case when target_bucket = 'scheduled' then target_amount else 0 end,
        reserve_calls = usage.reserve_calls + case when target_bucket = 'reserve' then target_amount else 0 end
    where usage.provider_code = target_provider_code
      and usage.usage_date = target_usage_date
    returning usage.scheduled_calls, usage.reserve_calls
    into existing_scheduled, existing_reserve;
  end if;

  return query select allowed, existing_scheduled, existing_reserve, provider_limit;
end;
$$;

create function public.ingest_source_postings(
  target_provider_code text,
  target_run_id uuid,
  target_postings jsonb,
  target_finalize boolean default false,
  target_snapshot_complete boolean default false
)
returns table (
  upserted_count integer,
  closed_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_record public.source_providers%rowtype;
  run_record public.collection_runs%rowtype;
  item jsonb;
  normalized jsonb;
  safe_values jsonb;
  safe_provenance jsonb;
  observed_at timestamptz;
  canonical_id uuid;
  affected integer := 0;
  newly_closed integer := 0;
  item_status text;
  item_external_id text;
  item_original_url text;
  item_normalized_url text;
  item_fingerprint text;
begin
  if jsonb_typeof(target_postings) <> 'array' then
    raise exception 'postings must be an array' using errcode = '22023';
  end if;

  select provider.* into provider_record
  from public.source_providers as provider
  where provider.code = target_provider_code
  for update;

  if not found or not provider_record.enabled then
    raise exception 'provider is not enabled' using errcode = '55000';
  end if;

  if jsonb_typeof(provider_record.retention_policy->'allowedSourceFields') <> 'array' then
    raise exception 'invalid provider retention policy' using errcode = '22023';
  end if;

  select run.* into run_record
  from public.collection_runs as run
  where run.id = target_run_id
    and run.provider_code = target_provider_code
    and run.status = 'running'
    and run.lease_until > clock_timestamp()
  for update;

  if not found then
    raise exception 'collection run is not claimable' using errcode = '55000';
  end if;

  if target_snapshot_complete and (not target_finalize or run_record.run_kind <> 'reconciliation') then
    raise exception 'complete snapshot requires final reconciliation' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(target_postings)
  loop
    normalized := item->'normalized';
    item_external_id := nullif(btrim(item->>'externalId'), '');
    item_original_url := nullif(item->>'originalUrl', '');
    item_status := coalesce(item->>'sourceStatus', 'active');
    observed_at := coalesce(nullif(item->>'fetchedAt', '')::timestamptz, clock_timestamp());

    if item_external_id is null
       or item_original_url !~ '^https://[^[:space:]]+$'
       or jsonb_typeof(normalized) <> 'object'
       or nullif(btrim(normalized->>'title'), '') is null
       or nullif(btrim(normalized->>'companyName'), '') is null
       or item_status not in ('active', 'closed', 'withdrawn') then
      raise exception 'invalid normalized posting' using errcode = '22023';
    end if;

    item_normalized_url := coalesce(nullif(item->>'normalizedUrl', ''), regexp_replace(item_original_url, '\?.*$', ''));

    if jsonb_typeof(coalesce(item->'sourceValues', '{}'::jsonb)) <> 'object' then
      raise exception 'source values must be an object' using errcode = '22023';
    end if;

    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into safe_values
    from jsonb_each(coalesce(item->'sourceValues', '{}'::jsonb)) as entry
    where entry.key in (
      select jsonb_array_elements_text(provider_record.retention_policy->'allowedSourceFields')
    )
      and entry.key !~* '^(access[-_]?key|api[-_]?key|authorization|credential|password|private[-_]?key|secret|token)$';

    if safe_values::text ~* '"(access[-_]?key|api[-_]?key|authorization|credential|password|private[-_]?key|secret|token)"[[:space:]]*:'
    then
      raise exception 'sensitive source value is forbidden' using errcode = '22023';
    end if;

    select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
    into safe_provenance
    from jsonb_each(coalesce(item->'fieldProvenance', '{}'::jsonb)) as entry
    where entry.key in (
      'title', 'companyName', 'roleName', 'locations', 'employmentTypes',
      'careerMinYears', 'careerMaxYears', 'experienceText', 'educationText',
      'industry', 'jobCategories', 'salaryText', 'postedAt', 'deadlineKind', 'deadlineAt'
    )
      and entry.value #>> '{sourcePosting,providerCode}' = target_provider_code
      and entry.value #>> '{sourcePosting,externalId}' = item_external_id;

    item_fingerprint := coalesce(
      nullif(item->>'contentFingerprint', ''),
      encode(extensions.digest(safe_values::text, 'sha256'), 'hex')
    );

    select posting.canonical_job_id into canonical_id
    from public.source_postings as posting
    where posting.provider_code = target_provider_code
      and posting.external_id = item_external_id
    for update;

    if canonical_id is null then
      insert into public.canonical_jobs (
        title,
        company_name,
        role_name,
        locations,
        employment_types,
        career_min_years,
        career_max_years,
        experience_text,
        education_text,
        industry,
        job_categories,
        salary_text,
        posted_at,
        deadline_kind,
        deadline_at,
        lifecycle_status,
        last_observed_at,
        field_provenance
      ) values (
        normalized->>'title',
        normalized->>'companyName',
        normalized->>'roleName',
        array(select coalesce(value->>'label', value#>>'{}') from jsonb_array_elements(coalesce(normalized->'locations', '[]'::jsonb))),
        array(select value#>>'{}' from jsonb_array_elements(coalesce(normalized->'employmentTypes', '[]'::jsonb))),
        nullif(normalized->>'careerMinYears', '')::integer,
        nullif(normalized->>'careerMaxYears', '')::integer,
        normalized->>'experienceText',
        normalized->>'educationText',
        normalized->>'industry',
        array(select coalesce(value->>'label', value#>>'{}') from jsonb_array_elements(coalesce(normalized->'jobCategories', '[]'::jsonb))),
        normalized->>'salaryText',
        nullif(normalized->>'postedAt', '')::timestamptz,
        coalesce(normalized->>'deadlineKind', 'unknown'),
        nullif(coalesce(normalized->>'expiresAt', normalized->>'deadlineAt'), '')::timestamptz,
        case when item_status = 'active' then 'active' else item_status end,
        observed_at,
        safe_provenance
      ) returning id into canonical_id;

      insert into public.source_postings (
        provider_code,
        canonical_job_id,
        external_id,
        original_url,
        normalized_url,
        source_values,
        source_status,
        first_observed_at,
        last_observed_at,
        missing_complete_runs,
        last_collection_run_id,
        content_fingerprint
      ) values (
        target_provider_code,
        canonical_id,
        item_external_id,
        item_original_url,
        item_normalized_url,
        safe_values,
        item_status,
        observed_at,
        observed_at,
        0,
        target_run_id,
        item_fingerprint
      );
    else
      update public.canonical_jobs as job
      set title = normalized->>'title',
          company_name = normalized->>'companyName',
          role_name = normalized->>'roleName',
          locations = array(select coalesce(value->>'label', value#>>'{}') from jsonb_array_elements(coalesce(normalized->'locations', '[]'::jsonb))),
          employment_types = array(select value#>>'{}' from jsonb_array_elements(coalesce(normalized->'employmentTypes', '[]'::jsonb))),
          career_min_years = nullif(normalized->>'careerMinYears', '')::integer,
          career_max_years = nullif(normalized->>'careerMaxYears', '')::integer,
          experience_text = normalized->>'experienceText',
          education_text = normalized->>'educationText',
          industry = normalized->>'industry',
          job_categories = array(select coalesce(value->>'label', value#>>'{}') from jsonb_array_elements(coalesce(normalized->'jobCategories', '[]'::jsonb))),
          salary_text = normalized->>'salaryText',
          posted_at = nullif(normalized->>'postedAt', '')::timestamptz,
          deadline_kind = coalesce(normalized->>'deadlineKind', 'unknown'),
          deadline_at = nullif(coalesce(normalized->>'expiresAt', normalized->>'deadlineAt'), '')::timestamptz,
          lifecycle_status = case when item_status = 'active' then 'active' else item_status end,
          last_observed_at = greatest(job.last_observed_at, observed_at),
          field_provenance = safe_provenance
      where job.id = canonical_id;

      update public.source_postings as posting
      set original_url = item_original_url,
          normalized_url = item_normalized_url,
          source_values = safe_values,
          source_status = item_status,
          last_observed_at = greatest(posting.last_observed_at, observed_at),
          missing_complete_runs = 0,
          last_collection_run_id = target_run_id,
          content_fingerprint = item_fingerprint
      where posting.provider_code = target_provider_code
        and posting.external_id = item_external_id;
    end if;

    affected := affected + 1;
  end loop;

  if target_finalize and target_snapshot_complete then
    with changed as (
      update public.source_postings as posting
      set missing_complete_runs = posting.missing_complete_runs + 1,
          source_status = case when posting.missing_complete_runs + 1 >= 2 then 'closed' else 'missing_once' end
      where posting.provider_code = target_provider_code
        and posting.source_status in ('active', 'missing_once')
        and posting.last_collection_run_id is distinct from target_run_id
      returning source_status
    )
    select count(*) filter (where source_status = 'closed')::integer
    into newly_closed
    from changed;

    update public.canonical_jobs as job
    set lifecycle_status = case
      when exists (
        select 1 from public.source_postings as posting
        where posting.canonical_job_id = job.id and posting.source_status = 'active'
      ) then 'active'
      when exists (
        select 1 from public.source_postings as posting
        where posting.canonical_job_id = job.id and posting.source_status = 'missing_once'
      ) then 'stale'
      else 'closed'
    end
    where exists (
      select 1 from public.source_postings as posting
      where posting.canonical_job_id = job.id and posting.provider_code = target_provider_code
    );
  end if;

  update public.collection_runs as run
  set status = case when target_finalize then 'succeeded' else 'running' end,
      snapshot_complete = target_finalize and target_snapshot_complete,
      fetched_count = run.fetched_count + jsonb_array_length(target_postings),
      upserted_count = run.upserted_count + affected,
      closed_count = run.closed_count + newly_closed,
      finished_at = case when target_finalize then clock_timestamp() else null end,
      lease_until = case when target_finalize then null else run.lease_until end
  where run.id = target_run_id;

  if target_finalize then
    update public.source_providers
    set last_success_at = clock_timestamp(), last_error_code = null
    where code = target_provider_code;
  end if;

  return query select affected, newly_closed;
end;
$$;

create function public.disable_source_provider(
  target_provider_code text,
  target_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  changed boolean;
begin
  if target_reason !~ '^[A-Z0-9_:-]{1,80}$' then
    raise exception 'invalid disable reason' using errcode = '22023';
  end if;

  update public.source_providers
  set enabled = false,
      disabled_reason = target_reason,
      last_error_code = target_reason
  where code = target_provider_code
  returning true into changed;

  return coalesce(changed, false);
end;
$$;

create function public.purge_source_provider_data(
  target_provider_code text,
  target_reason text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  purged integer;
begin
  if target_reason !~ '^[A-Z0-9_:-]{1,80}$' then
    raise exception 'invalid purge reason' using errcode = '22023';
  end if;

  perform 1 from public.source_providers where code = target_provider_code for update;
  if not found then
    raise exception 'unknown provider' using errcode = '22023';
  end if;

  update public.source_postings as posting
  set source_values = '{}'::jsonb,
      source_status = 'withdrawn',
      missing_complete_runs = 0,
      content_fingerprint = encode(extensions.digest('{}', 'sha256'), 'hex')
  where posting.provider_code = target_provider_code;
  get diagnostics purged = row_count;

  with affected_jobs as (
    select distinct posting.canonical_job_id
    from public.source_postings as posting
    where posting.provider_code = target_provider_code
  ),
  remaining_sources as (
    select distinct on (posting.canonical_job_id)
      posting.canonical_job_id,
      posting.provider_code,
      posting.external_id,
      posting.source_values,
      posting.source_status,
      posting.last_observed_at
    from public.source_postings as posting
    join public.source_providers as provider on provider.code = posting.provider_code
    join affected_jobs on affected_jobs.canonical_job_id = posting.canonical_job_id
    where posting.provider_code <> target_provider_code
      and provider.enabled
      and posting.source_status in ('active', 'missing_once')
    order by posting.canonical_job_id, posting.last_observed_at desc, posting.id
  )
  update public.canonical_jobs as job
  set title = case
        when coalesce(job.field_provenance #>> '{title,sourcePosting,providerCode}', target_provider_code) = target_provider_code
          then coalesce(nullif(remaining.source_values->>'title', ''), '삭제된 공고')
        else job.title
      end,
      company_name = case
        when coalesce(job.field_provenance #>> '{companyName,sourcePosting,providerCode}', target_provider_code) = target_provider_code
          then coalesce(nullif(remaining.source_values->>'companyName', ''), '비공개 출처')
        else job.company_name
      end,
      role_name = case
        when coalesce(job.field_provenance #>> '{roleName,sourcePosting,providerCode}', target_provider_code) = target_provider_code
          then nullif(remaining.source_values->>'roleName', '')
        else job.role_name
      end,
      locations = case
        when coalesce(job.field_provenance #>> '{locations,sourcePosting,providerCode}', target_provider_code) <> target_provider_code
          then job.locations
        when jsonb_typeof(remaining.source_values->'locations') = 'array'
          then array(
            select coalesce(value->>'label', value#>>'{}')
            from jsonb_array_elements(remaining.source_values->'locations') as value
          )
        else '{}'
      end,
      employment_types = case
        when coalesce(job.field_provenance #>> '{employmentTypes,sourcePosting,providerCode}', target_provider_code) <> target_provider_code
          then job.employment_types
        when jsonb_typeof(remaining.source_values->'employmentTypes') = 'array'
          then array(
            select value#>>'{}'
            from jsonb_array_elements(remaining.source_values->'employmentTypes') as value
          )
        else '{}'
      end,
      career_min_years = case
        when coalesce(job.field_provenance #>> '{careerMinYears,sourcePosting,providerCode}', target_provider_code) <> target_provider_code
          then job.career_min_years
        else null
      end,
      career_max_years = case
        when coalesce(job.field_provenance #>> '{careerMaxYears,sourcePosting,providerCode}', target_provider_code) <> target_provider_code
          then job.career_max_years
        else null
      end,
      experience_text = case
        when coalesce(job.field_provenance #>> '{experienceText,sourcePosting,providerCode}', target_provider_code) = target_provider_code
          then nullif(remaining.source_values->>'experienceText', '')
        else job.experience_text
      end,
      education_text = case
        when coalesce(job.field_provenance #>> '{educationText,sourcePosting,providerCode}', target_provider_code) = target_provider_code
          then nullif(remaining.source_values->>'educationText', '')
        else job.education_text
      end,
      industry = case
        when coalesce(job.field_provenance #>> '{industry,sourcePosting,providerCode}', target_provider_code) = target_provider_code
          then nullif(remaining.source_values->>'industry', '')
        else job.industry
      end,
      job_categories = case
        when coalesce(job.field_provenance #>> '{jobCategories,sourcePosting,providerCode}', target_provider_code) <> target_provider_code
          then job.job_categories
        when jsonb_typeof(remaining.source_values->'jobCategories') = 'array'
          then array(
            select coalesce(value->>'label', value#>>'{}')
            from jsonb_array_elements(remaining.source_values->'jobCategories') as value
          )
        else '{}'
      end,
      salary_text = case
        when coalesce(job.field_provenance #>> '{salaryText,sourcePosting,providerCode}', target_provider_code) = target_provider_code
          then nullif(remaining.source_values->>'salaryText', '')
        else job.salary_text
      end,
      posted_at = case
        when coalesce(job.field_provenance #>> '{postedAt,sourcePosting,providerCode}', target_provider_code) = target_provider_code
          then null
        else job.posted_at
      end,
      deadline_kind = case
        when coalesce(job.field_provenance #>> '{deadlineKind,sourcePosting,providerCode}', target_provider_code) <> target_provider_code
          then job.deadline_kind
        else 'unknown'
      end,
      deadline_at = case
        when coalesce(job.field_provenance #>> '{deadlineAt,sourcePosting,providerCode}', target_provider_code) = target_provider_code
          then null
        else job.deadline_at
      end,
      lifecycle_status = case
        when remaining.canonical_job_id is null then 'withdrawn'
        when remaining.source_status = 'active' then 'active'
        else 'stale'
      end,
      field_provenance = (
        select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
        from jsonb_each(job.field_provenance) as entry
        where entry.value #>> '{sourcePosting,providerCode}' is distinct from target_provider_code
      ) || coalesce((
        select jsonb_object_agg(
          source_key,
          jsonb_build_object(
            'sourcePosting', jsonb_build_object(
              'providerCode', remaining.provider_code,
              'externalId', remaining.external_id
            ),
            'origin', 'source',
            'observedAt', to_jsonb(remaining.last_observed_at)
          )
        )
        from jsonb_object_keys(coalesce(remaining.source_values, '{}'::jsonb)) as source_key
        where source_key in (
          'title', 'companyName', 'roleName', 'locations', 'employmentTypes',
          'experienceText', 'educationText', 'industry', 'jobCategories', 'salaryText'
        )
          and coalesce(
            job.field_provenance #>> array[source_key, 'sourcePosting', 'providerCode'],
            target_provider_code
          ) = target_provider_code
      ), '{}'::jsonb)
  from affected_jobs
  left join remaining_sources as remaining
    on remaining.canonical_job_id = affected_jobs.canonical_job_id
  where job.id = affected_jobs.canonical_job_id;
  insert into public.collection_runs (
    provider_code,
    schedule_bucket,
    run_kind,
    status,
    snapshot_complete,
    fetched_count,
    upserted_count,
    closed_count,
    started_at,
    finished_at,
    error_summary
  ) values (
    target_provider_code,
    clock_timestamp(),
    'reconciliation',
    'succeeded',
    false,
    purged,
    purged,
    purged,
    clock_timestamp(),
    clock_timestamp(),
    'purge:' || target_reason
  );

  return purged;
end;
$$;

revoke all on function public.claim_collection_run(text, timestamptz, text, integer)
  from public, anon, authenticated;
revoke all on function public.consume_provider_quota(text, text, integer, date)
  from public, anon, authenticated;
revoke all on function public.ingest_source_postings(text, uuid, jsonb, boolean, boolean)
  from public, anon, authenticated;
revoke all on function public.disable_source_provider(text, text)
  from public, anon, authenticated;
revoke all on function public.purge_source_provider_data(text, text)
  from public, anon, authenticated;

grant execute on function public.claim_collection_run(text, timestamptz, text, integer)
  to service_role;
grant execute on function public.consume_provider_quota(text, text, integer, date)
  to service_role;
grant execute on function public.ingest_source_postings(text, uuid, jsonb, boolean, boolean)
  to service_role;
grant execute on function public.disable_source_provider(text, text)
  to service_role;
grant execute on function public.purge_source_provider_data(text, text)
  to service_role;

commit;
