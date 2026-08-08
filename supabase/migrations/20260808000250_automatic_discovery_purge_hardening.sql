begin;

do $migration$
begin
  if to_regprocedure('public.purge_source_provider_data_unchecked(text,text)') is null then
    alter function public.purge_source_provider_data(text, text)
      rename to purge_source_provider_data_unchecked;
  end if;
end;
$migration$;

revoke all on function public.purge_source_provider_data_unchecked(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.purge_source_provider_data(
  target_provider_code text,
  target_reason text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  provider_record public.source_providers%rowtype;
  affected_ids uuid[] := '{}'::uuid[];
  empty_fingerprint text := encode(extensions.digest('{}', 'sha256'), 'hex');
  retention_days integer;
  source_changed integer := 0;
  canonical_changed integer := 0;
  audit_at timestamptz;
begin
  if target_reason !~ '^[A-Z0-9_:-]{1,80}$' then
    raise exception 'invalid purge reason' using errcode = '22023';
  end if;

  select provider.* into provider_record
  from public.source_providers as provider
  where provider.code = target_provider_code
  for update;

  if not found then
    raise exception 'unknown provider' using errcode = '22023';
  end if;

  select coalesce(array_agg(candidate.id order by candidate.id), '{}'::uuid[])
  into affected_ids
  from (
    select posting.canonical_job_id as id
    from public.source_postings as posting
    where posting.provider_code = target_provider_code
    union
    select job.id
    from public.canonical_jobs as job
    where exists (
      select 1
      from jsonb_each(job.field_provenance) as entry
      where entry.value #>> '{sourcePosting,providerCode}' = target_provider_code
    )
  ) as candidate;

  perform posting.id
  from public.source_postings as posting
  where posting.provider_code = target_provider_code
     or posting.canonical_job_id = any(affected_ids)
  order by posting.id
  for update;

  perform job.id
  from public.canonical_jobs as job
  where job.id = any(affected_ids)
  order by job.id
  for update;

  if provider_record.enabled and exists (
    select 1
    from public.source_postings as posting
    where posting.provider_code = target_provider_code
      and (
        posting.source_status is distinct from 'withdrawn'
        or posting.source_values is distinct from '{}'::jsonb
        or posting.missing_complete_runs is distinct from 0
        or posting.content_fingerprint is distinct from empty_fingerprint
      )
  ) then
    if jsonb_typeof(provider_record.retention_policy->'retentionDays') is distinct from 'number'
       or (provider_record.retention_policy->>'retentionDays') !~ '^[1-9][0-9]*$' then
      raise exception 'provider retention is not expired' using errcode = '55000';
    end if;

    retention_days := (provider_record.retention_policy->>'retentionDays')::integer;
    if exists (
      select 1
      from public.source_postings as posting
      where posting.provider_code = target_provider_code
        and (
          posting.source_status is distinct from 'withdrawn'
          or posting.source_values is distinct from '{}'::jsonb
          or posting.missing_complete_runs is distinct from 0
          or posting.content_fingerprint is distinct from empty_fingerprint
        )
        and posting.last_observed_at + make_interval(days => retention_days) > clock_timestamp()
    ) then
      raise exception 'provider retention is not expired' using errcode = '55000';
    end if;
  end if;

  update public.source_postings as posting
  set source_values = '{}'::jsonb,
      source_status = 'withdrawn',
      missing_complete_runs = 0,
      content_fingerprint = empty_fingerprint
  where posting.provider_code = target_provider_code
    and (
      posting.source_status is distinct from 'withdrawn'
      or posting.source_values is distinct from '{}'::jsonb
      or posting.missing_complete_runs is distinct from 0
      or posting.content_fingerprint is distinct from empty_fingerprint
    );
  get diagnostics source_changed = row_count;

  with survivor_fields as (
    select distinct on (posting.canonical_job_id, field.key)
      posting.canonical_job_id,
      field.key,
      field.value,
      jsonb_build_object(
        'sourcePosting', jsonb_build_object(
          'providerCode', posting.provider_code,
          'externalId', posting.external_id
        ),
        'origin', 'source',
        'observedAt', to_jsonb(posting.last_observed_at)
      ) as provenance
    from public.source_postings as posting
    join public.source_providers as provider on provider.code = posting.provider_code
    cross join lateral jsonb_each(posting.source_values) as field
    where posting.canonical_job_id = any(affected_ids)
      and posting.provider_code <> target_provider_code
      and provider.enabled
      and posting.source_status in ('active', 'missing_once')
      and field.key in (
        'title', 'companyName', 'roleName', 'locations', 'employmentTypes',
        'experienceText', 'educationText', 'industry', 'jobCategories', 'salaryText', 'postedAt'
      )
      and (
        field.key in ('locations', 'jobCategories')
          and jsonb_typeof(field.value) = 'array'
          and jsonb_array_length(
            case
              when jsonb_typeof(field.value) = 'array' then field.value
              else '[]'::jsonb
            end
          ) > 0
          and not exists (
            select 1
            from jsonb_array_elements(
              case
                when jsonb_typeof(field.value) = 'array' then field.value
                else '[]'::jsonb
              end
            ) as item
            where not (
              jsonb_typeof(item) = 'string'
                and nullif(btrim(item#>>'{}'), '') is not null
              or jsonb_typeof(item) = 'object'
                and jsonb_typeof(item->'label') = 'string'
                and nullif(btrim(item->>'label'), '') is not null
            )
          )
        or field.key = 'employmentTypes'
          and jsonb_typeof(field.value) = 'array'
          and jsonb_array_length(
            case
              when jsonb_typeof(field.value) = 'array' then field.value
              else '[]'::jsonb
            end
          ) > 0
          and not exists (
            select 1
            from jsonb_array_elements(
              case
                when jsonb_typeof(field.value) = 'array' then field.value
                else '[]'::jsonb
              end
            ) as item
            where jsonb_typeof(item) <> 'string'
               or nullif(btrim(item#>>'{}'), '') is null
          )
        or field.key = 'postedAt'
          and jsonb_typeof(field.value) = 'string'
          and pg_catalog.pg_input_is_valid(field.value#>>'{}', 'timestamp with time zone')
        or field.key not in ('locations', 'employmentTypes', 'jobCategories', 'postedAt')
          and jsonb_typeof(field.value) = 'string'
          and nullif(btrim(field.value#>>'{}'), '') is not null
      )
    order by posting.canonical_job_id,
      field.key,
      case posting.source_status when 'active' then 0 else 1 end,
      posting.last_observed_at desc,
      posting.id
  ),
  remaining_sources as (
    select
      survivor.canonical_job_id,
      jsonb_object_agg(survivor.key, survivor.value) as source_values,
      jsonb_object_agg(survivor.key, survivor.provenance) as field_provenance
    from survivor_fields as survivor
    group by survivor.canonical_job_id
  ),
  candidates as (
    select
      job.*,
      remaining.source_values as remaining_source_values,
      remaining.field_provenance as remaining_field_provenance,
      coalesce(job.field_provenance #>> '{title,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_title,
      coalesce(job.field_provenance #>> '{companyName,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_company,
      coalesce(job.field_provenance #>> '{roleName,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_role,
      coalesce(job.field_provenance #>> '{locations,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_locations,
      coalesce(job.field_provenance #>> '{employmentTypes,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_employment,
      coalesce(job.field_provenance #>> '{experienceText,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_experience,
      coalesce(job.field_provenance #>> '{educationText,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_education,
      coalesce(job.field_provenance #>> '{industry,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_industry,
      coalesce(job.field_provenance #>> '{jobCategories,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_categories,
      coalesce(job.field_provenance #>> '{salaryText,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_salary,
      coalesce(job.field_provenance #>> '{postedAt,sourcePosting,providerCode}', target_provider_code) = target_provider_code as replace_posted,
      (
        coalesce(job.field_provenance #>> '{careerMinYears,sourcePosting,providerCode}', target_provider_code) = target_provider_code
        or coalesce(job.field_provenance #>> '{careerMaxYears,sourcePosting,providerCode}', target_provider_code) = target_provider_code
      ) as replace_career,
      (
        coalesce(job.field_provenance #>> '{deadlineKind,sourcePosting,providerCode}', target_provider_code) = target_provider_code
        or coalesce(job.field_provenance #>> '{deadlineAt,sourcePosting,providerCode}', target_provider_code) = target_provider_code
      ) as replace_deadline
    from public.canonical_jobs as job
    left join remaining_sources as remaining on remaining.canonical_job_id = job.id
    where job.id = any(affected_ids)
  ),
  desired as (
    select
      candidate.id,
      case when candidate.replace_title
        then coalesce(nullif(btrim(candidate.remaining_source_values->>'title'), ''), '삭제된 공고')
        else candidate.title end as title,
      case when candidate.replace_company
        then coalesce(nullif(btrim(candidate.remaining_source_values->>'companyName'), ''), '비공개 출처')
        else candidate.company_name end as company_name,
      case when candidate.replace_role
        then nullif(btrim(candidate.remaining_source_values->>'roleName'), '')
        else candidate.role_name end as role_name,
      case
        when not candidate.replace_locations then candidate.locations
        when jsonb_typeof(candidate.remaining_source_values->'locations') = 'array' then array(
          select btrim(coalesce(value->>'label', value#>>'{}'))
          from jsonb_array_elements(
            case
              when jsonb_typeof(candidate.remaining_source_values->'locations') = 'array'
                then candidate.remaining_source_values->'locations'
              else '[]'::jsonb
            end
          ) as value
        )
        else '{}'::text[]
      end as locations,
      case
        when not candidate.replace_employment then candidate.employment_types
        when jsonb_typeof(candidate.remaining_source_values->'employmentTypes') = 'array' then array(
          select btrim(value#>>'{}')
          from jsonb_array_elements(
            case
              when jsonb_typeof(candidate.remaining_source_values->'employmentTypes') = 'array'
                then candidate.remaining_source_values->'employmentTypes'
              else '[]'::jsonb
            end
          ) as value
        )
        else '{}'::text[]
      end as employment_types,
      case when candidate.replace_career then null else candidate.career_min_years end as career_min_years,
      case when candidate.replace_career then null else candidate.career_max_years end as career_max_years,
      case when candidate.replace_experience
        then nullif(btrim(candidate.remaining_source_values->>'experienceText'), '')
        else candidate.experience_text end as experience_text,
      case when candidate.replace_education
        then nullif(btrim(candidate.remaining_source_values->>'educationText'), '')
        else candidate.education_text end as education_text,
      case when candidate.replace_industry
        then nullif(btrim(candidate.remaining_source_values->>'industry'), '')
        else candidate.industry end as industry,
      case
        when not candidate.replace_categories then candidate.job_categories
        when jsonb_typeof(candidate.remaining_source_values->'jobCategories') = 'array' then array(
          select btrim(coalesce(value->>'label', value#>>'{}'))
          from jsonb_array_elements(
            case
              when jsonb_typeof(candidate.remaining_source_values->'jobCategories') = 'array'
                then candidate.remaining_source_values->'jobCategories'
              else '[]'::jsonb
            end
          ) as value
        )
        else '{}'::text[]
      end as job_categories,
      case when candidate.replace_salary
        then nullif(btrim(candidate.remaining_source_values->>'salaryText'), '')
        else candidate.salary_text end as salary_text,
      case when candidate.replace_posted
        then nullif(btrim(candidate.remaining_source_values->>'postedAt'), '')::timestamptz
        else candidate.posted_at end as posted_at,
      case when candidate.replace_deadline then 'unknown' else candidate.deadline_kind end as deadline_kind,
      case when candidate.replace_deadline then null else candidate.deadline_at end as deadline_at,
      case
        when exists (
          select 1
          from public.source_postings as posting
          join public.source_providers as provider on provider.code = posting.provider_code
          where posting.canonical_job_id = candidate.id
            and posting.provider_code <> target_provider_code
            and provider.enabled
            and posting.source_status = 'active'
        ) then 'active'
        when exists (
          select 1
          from public.source_postings as posting
          join public.source_providers as provider on provider.code = posting.provider_code
          where posting.canonical_job_id = candidate.id
            and posting.provider_code <> target_provider_code
            and provider.enabled
            and posting.source_status = 'missing_once'
        ) then 'stale'
        else 'withdrawn'
      end as lifecycle_status,
      (
        select coalesce(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
        from jsonb_each(candidate.field_provenance) as entry
        where entry.value #>> '{sourcePosting,providerCode}' is distinct from target_provider_code
          and (not candidate.replace_career or entry.key not in ('careerMinYears', 'careerMaxYears'))
          and (not candidate.replace_deadline or entry.key not in ('deadlineKind', 'deadlineAt'))
      ) || coalesce((
        select jsonb_object_agg(entry.key, entry.value)
        from jsonb_each(coalesce(candidate.remaining_field_provenance, '{}'::jsonb)) as entry
        where (
          entry.key = 'title' and candidate.replace_title
          or entry.key = 'companyName' and candidate.replace_company
          or entry.key = 'roleName' and candidate.replace_role
          or entry.key = 'locations' and candidate.replace_locations
          or entry.key = 'employmentTypes' and candidate.replace_employment
          or entry.key = 'experienceText' and candidate.replace_experience
          or entry.key = 'educationText' and candidate.replace_education
          or entry.key = 'industry' and candidate.replace_industry
          or entry.key = 'jobCategories' and candidate.replace_categories
          or entry.key = 'salaryText' and candidate.replace_salary
          or entry.key = 'postedAt' and candidate.replace_posted
        )
      ), '{}'::jsonb) as field_provenance
    from candidates as candidate
  ),
  changed as (
    update public.canonical_jobs as job
    set title = desired.title,
        company_name = desired.company_name,
        role_name = desired.role_name,
        locations = desired.locations,
        employment_types = desired.employment_types,
        career_min_years = desired.career_min_years,
        career_max_years = desired.career_max_years,
        experience_text = desired.experience_text,
        education_text = desired.education_text,
        industry = desired.industry,
        job_categories = desired.job_categories,
        salary_text = desired.salary_text,
        posted_at = desired.posted_at,
        deadline_kind = desired.deadline_kind,
        deadline_at = desired.deadline_at,
        lifecycle_status = desired.lifecycle_status,
        field_provenance = desired.field_provenance
    from desired
    where job.id = desired.id
      and row(
        job.title, job.company_name, job.role_name, job.locations, job.employment_types,
        job.career_min_years, job.career_max_years, job.experience_text, job.education_text,
        job.industry, job.job_categories, job.salary_text, job.posted_at, job.deadline_kind,
        job.deadline_at, job.lifecycle_status, job.field_provenance
      ) is distinct from row(
        desired.title, desired.company_name, desired.role_name, desired.locations, desired.employment_types,
        desired.career_min_years, desired.career_max_years, desired.experience_text, desired.education_text,
        desired.industry, desired.job_categories, desired.salary_text, desired.posted_at, desired.deadline_kind,
        desired.deadline_at, desired.lifecycle_status, desired.field_provenance
      )
    returning job.id
  )
  select count(*)::integer into canonical_changed from changed;

  if source_changed > 0 or canonical_changed > 0 then
    audit_at := clock_timestamp();
    insert into public.collection_runs (
      provider_code,
      schedule_bucket,
      run_kind,
      status,
      cursor,
      snapshot_complete,
      fetched_count,
      upserted_count,
      closed_count,
      started_at,
      finished_at,
      error_summary
    ) values (
      target_provider_code,
      audit_at,
      'reconciliation',
      'succeeded',
      jsonb_build_object('canonicalRepaired', canonical_changed),
      false,
      source_changed,
      source_changed,
      source_changed,
      audit_at,
      audit_at,
      'purge:' || target_reason
    );
  end if;

  return source_changed;
end;
$$;

revoke all on function public.purge_source_provider_data(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.purge_source_provider_data(text, text)
  to service_role;

commit;
