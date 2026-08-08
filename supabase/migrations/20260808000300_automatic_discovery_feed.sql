begin;

create function public.get_catalog_feed(
  target_filters jsonb default '{}'::jsonb,
  target_take integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  caller_id uuid := auth.uid();
  filters jsonb := coalesce(target_filters, '{}'::jsonb);
  safe_take integer := case
    when target_take between 30 and 1020 and target_take % 30 = 0 then target_take
    else 30
  end;
  q_filter text;
  region_filter text;
  role_filter text;
  career_filter text;
  employment_filter text;
  deadline_filter text;
  source_filter text;
  sort_filter text;
  career_min integer;
  career_max integer;
  result jsonb;
  empty_result constant jsonb := jsonb_build_object(
    'items', '[]'::jsonb,
    'total', 0,
    'missingCounts', jsonb_build_object(
      'region', 0,
      'role', 0,
      'career', 0,
      'employment', 0,
      'deadline', 0,
      'source', 0
    ),
    'hasMore', false,
    'providerHealth', '[]'::jsonb,
    'enabledProviderCount', 0
  );
begin
  if caller_id is null or jsonb_typeof(filters) <> 'object' then
    return empty_result;
  end if;

  -- The newest consent row is the account's effective agreement.  Re-check it
  -- here because SECURITY DEFINER must not rely on the caller's table policy.
  if not exists (
    select 1
    from (
      select consent.terms_version, consent.privacy_version
      from public.account_consents as consent
      where consent.user_id = caller_id
      order by consent.accepted_at desc, consent.id desc
      limit 1
    ) as latest_consent
    where latest_consent.terms_version = '2026-08-07'
      and latest_consent.privacy_version = '2026-08-07'
  ) then
    return empty_result;
  end if;

  -- Personal state is introduced by a later migration.  Until then, requests
  -- that require it are deliberately empty rather than leaking common rows.
  if filters @> '{"includeExcluded":true}'::jsonb
     or filters @> '{"saved":true}'::jsonb
     or (filters ? 'includeExcluded' and jsonb_typeof(filters->'includeExcluded') <> 'boolean')
     or (filters ? 'saved' and jsonb_typeof(filters->'saved') <> 'boolean') then
    return empty_result;
  end if;

  q_filter := case
    when jsonb_typeof(filters->'q') = 'string'
      and length(btrim(filters->>'q')) between 1 and 100
      then btrim(regexp_replace(filters->>'q', '\s+', ' ', 'g'))
  end;
  region_filter := case
    when jsonb_typeof(filters->'region') = 'string'
      and length(btrim(filters->>'region')) between 1 and 100
      then btrim(filters->>'region')
  end;
  role_filter := case
    when jsonb_typeof(filters->'role') = 'string'
      and length(btrim(filters->>'role')) between 1 and 100
      then btrim(filters->>'role')
  end;
  employment_filter := case
    when jsonb_typeof(filters->'employment') = 'string'
      and length(btrim(filters->>'employment')) between 1 and 100
      then btrim(filters->>'employment')
  end;
  source_filter := case
    when jsonb_typeof(filters->'source') = 'string'
      and (filters->>'source') ~ '^[a-z][a-z0-9_-]{1,39}$'
      then filters->>'source'
  end;
  deadline_filter := case
    when filters->>'deadline' in ('active', 'closingSoon', 'unknown')
      then filters->>'deadline'
  end;
  sort_filter := case when filters->>'sort' = 'deadline' then 'deadline' else 'posted' end;
  career_filter := case
    when jsonb_typeof(filters->'career') = 'string'
      and (filters->>'career') ~ '^(entry|experienced|any|[0-9]{1,2}(-[0-9]{1,2}|\+)?)$'
      then filters->>'career'
  end;

  if career_filter ~ '^[0-9]{1,2}-[0-9]{1,2}$' then
    career_min := split_part(career_filter, '-', 1)::integer;
    career_max := split_part(career_filter, '-', 2)::integer;
    if career_min > career_max then
      career_filter := null;
      career_min := null;
      career_max := null;
    end if;
  elsif career_filter ~ '^[0-9]{1,2}\+$' then
    career_min := left(career_filter, -1)::integer;
  end if;

  with eligible as materialized (
    select job.*
    from public.canonical_jobs as job
    where (
        job.lifecycle_status = 'active'
        or (
          job.lifecycle_status = 'stale'
          and job.last_observed_at >= statement_timestamp() - interval '24 hours'
        )
      )
      and exists (
        select 1
        from public.source_postings as posting
        join public.source_providers as provider
          on provider.code = posting.provider_code
        where posting.canonical_job_id = job.id
          and posting.source_status in ('active', 'missing_once')
          and (job.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
          and provider.enabled
      )
  ),
  evaluated as materialized (
    select
      job.*,
      (
        q_filter is null
        or position(lower(q_filter) in lower(job.title || ' ' || job.company_name || ' ' || coalesce(job.role_name, ''))) > 0
      ) as q_matches,
      (
        region_filter is null
        or exists (select 1 from unnest(job.locations) as value where lower(value) = lower(region_filter))
      ) as region_matches,
      (role_filter is null or (job.role_name is not null and lower(job.role_name) = lower(role_filter))) as role_matches,
      (
        employment_filter is null
        or exists (select 1 from unnest(job.employment_types) as value where lower(value) = lower(employment_filter))
      ) as employment_matches,
      (
        career_filter is null
        or (career_filter = 'entry' and job.career_min_years = 0)
        or (career_filter = 'experienced' and coalesce(job.career_max_years, job.career_min_years, 0) > 0)
        or (career_filter = 'any' and (job.career_min_years is not null or job.career_max_years is not null))
        or (
          career_max is not null
          and job.career_min_years is not null
          and job.career_max_years is not null
          and job.career_min_years <= career_min
          and job.career_max_years >= career_max
        )
        or (
          career_max is null
          and career_min is not null
          and coalesce(job.career_max_years, job.career_min_years) >= career_min
        )
      ) as career_matches,
      (
        deadline_filter is null
        or (
          deadline_filter = 'active'
          and (
            job.deadline_kind in ('rolling', 'until_hired')
            or (job.deadline_kind = 'fixed' and job.deadline_at >= statement_timestamp())
          )
        )
        or (
          deadline_filter = 'closingSoon'
          and job.deadline_kind = 'fixed'
          and job.deadline_at >= statement_timestamp()
          and job.deadline_at <= statement_timestamp() + interval '7 days'
        )
        or (deadline_filter = 'unknown' and job.deadline_kind = 'unknown')
      ) as deadline_matches,
      (
        source_filter is null
        or exists (
          select 1
          from public.source_postings as posting
          join public.source_providers as provider on provider.code = posting.provider_code
          where posting.canonical_job_id = job.id
            and posting.provider_code = source_filter
            and posting.source_status in ('active', 'missing_once')
            and (job.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
            and provider.enabled
        )
      ) as source_matches
    from eligible as job
  ),
  filtered as materialized (
    select evaluated.*
    from evaluated
    where q_matches
      and region_matches
      and role_matches
      and career_matches
      and employment_matches
      and deadline_matches
      and source_matches
  ),
  page as materialized (
    select job.*
    from filtered as job
    order by
      case when sort_filter = 'deadline' then job.deadline_at end asc nulls last,
      job.posted_at desc nulls last,
      job.last_observed_at desc,
      job.id asc
    limit safe_take + 1
  ),
  numbered as (
    select page.*, row_number() over (
      order by
        case when sort_filter = 'deadline' then page.deadline_at end asc nulls last,
        page.posted_at desc nulls last,
        page.last_observed_at desc,
        page.id asc
    ) as ordinal
    from page
  ),
  item_payload as (
    select
      numbered.ordinal,
      jsonb_build_object(
        'id', numbered.id,
        'title', numbered.title,
        'companyName', numbered.company_name,
        'roleName', numbered.role_name,
        'locations', to_jsonb(numbered.locations),
        'employmentTypes', to_jsonb(numbered.employment_types),
        'careerMinYears', numbered.career_min_years,
        'careerMaxYears', numbered.career_max_years,
        'experienceText', numbered.experience_text,
        'educationText', numbered.education_text,
        'industry', numbered.industry,
        'jobCategories', to_jsonb(numbered.job_categories),
        'salaryText', numbered.salary_text,
        'postedAt', numbered.posted_at,
        'deadlineKind', numbered.deadline_kind,
        'deadlineAt', numbered.deadline_at,
        'lifecycleStatus', numbered.lifecycle_status,
        'lastObservedAt', numbered.last_observed_at,
        'sources', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'provider', provider.code,
              'providerName', provider.display_name,
              'originalUrl', posting.original_url,
              'lastObservedAt', posting.last_observed_at,
              'attribution', jsonb_build_object(
                'text', provider.attribution->>'text',
                'href', provider.attribution->>'href'
              )
            ) order by provider.code, posting.id
          )
          from public.source_postings as posting
          join public.source_providers as provider on provider.code = posting.provider_code
          where posting.canonical_job_id = numbered.id
            and posting.source_status in ('active', 'missing_once')
            and (numbered.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
            and provider.enabled
        ), '[]'::jsonb)
      ) as item
    from numbered
    where numbered.ordinal <= safe_take
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(item order by ordinal) from item_payload), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'missingCounts', jsonb_build_object(
      'region', (
        select count(*) from evaluated
        where q_matches and role_matches and career_matches and employment_matches and deadline_matches and source_matches
          and cardinality(locations) = 0
      ),
      'role', (
        select count(*) from evaluated
        where q_matches and region_matches and career_matches and employment_matches and deadline_matches and source_matches
          and (role_name is null or btrim(role_name) = '')
      ),
      'career', (
        select count(*) from evaluated
        where q_matches and region_matches and role_matches and employment_matches and deadline_matches and source_matches
          and career_min_years is null and career_max_years is null
      ),
      'employment', (
        select count(*) from evaluated
        where q_matches and region_matches and role_matches and career_matches and deadline_matches and source_matches
          and cardinality(employment_types) = 0
      ),
      'deadline', (
        select count(*) from evaluated
        where q_matches and region_matches and role_matches and career_matches and employment_matches and source_matches
          and deadline_kind = 'unknown'
      ),
      'source', (
        select count(*)
        from evaluated as candidate
        where candidate.q_matches
          and candidate.region_matches
          and candidate.role_matches
          and candidate.career_matches
          and candidate.employment_matches
          and candidate.deadline_matches
          and not exists (
            select 1
            from public.source_postings as posting
            join public.source_providers as provider on provider.code = posting.provider_code
            where posting.canonical_job_id = candidate.id
              and posting.source_status in ('active', 'missing_once')
              and (candidate.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
              and provider.enabled
          )
      )
    ),
    'hasMore', (select count(*) > safe_take from page),
    'providerHealth', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', provider.code,
          'displayName', provider.display_name,
          'enabled', provider.enabled,
          'lastSuccessAt', provider.last_success_at,
          'errorCode', case
            when provider.last_error_code in (
              'CONNECTOR_DISABLED',
              'SOURCE_AUTH_INVALID',
              'SOURCE_REQUEST_INVALID',
              'SOURCE_RATE_LIMITED',
              'SOURCE_TIMEOUT',
              'SOURCE_UNAVAILABLE',
              'SOURCE_RESPONSE_INVALID',
              'SOURCE_TERMS_BLOCKED'
            ) then provider.last_error_code
            else null
          end
        ) order by provider.code
      )
      from public.source_providers as provider
    ), '[]'::jsonb),
    'enabledProviderCount', (select count(*) from public.source_providers as provider where provider.enabled)
  ) into result;

  return result;
end;
$$;


create function public.get_catalog_job_detail(target_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'id', job.id,
    'title', job.title,
    'companyName', job.company_name,
    'roleName', job.role_name,
    'locations', to_jsonb(job.locations),
    'employmentTypes', to_jsonb(job.employment_types),
    'careerMinYears', job.career_min_years,
    'careerMaxYears', job.career_max_years,
    'experienceText', job.experience_text,
    'educationText', job.education_text,
    'industry', job.industry,
    'jobCategories', to_jsonb(job.job_categories),
    'salaryText', job.salary_text,
    'postedAt', job.posted_at,
    'deadlineKind', job.deadline_kind,
    'deadlineAt', job.deadline_at,
    'lifecycleStatus', job.lifecycle_status,
    'lastObservedAt', job.last_observed_at,
    'sources', (
      select jsonb_agg(
        jsonb_build_object(
          'provider', provider.code,
          'providerName', provider.display_name,
          'originalUrl', posting.original_url,
          'lastObservedAt', posting.last_observed_at,
          'attribution', jsonb_build_object(
            'text', provider.attribution->>'text',
            'href', provider.attribution->>'href'
          )
        ) order by provider.code, posting.id
      )
      from public.source_postings as posting
      join public.source_providers as provider on provider.code = posting.provider_code
      where posting.canonical_job_id = job.id
        and posting.source_status in ('active', 'missing_once')
        and (job.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
        and provider.enabled
    )
  )
  from public.canonical_jobs as job
  where job.id = target_id
    and (
      job.lifecycle_status = 'active'
      or (
        job.lifecycle_status = 'stale'
        and job.last_observed_at >= statement_timestamp() - interval '24 hours'
      )
    )
    and exists (
      select 1
      from public.source_postings as posting
      join public.source_providers as provider on provider.code = posting.provider_code
      where posting.canonical_job_id = job.id
        and posting.source_status in ('active', 'missing_once')
        and (job.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
        and provider.enabled
    )
    and exists (
      select 1
      from (
        select consent.terms_version, consent.privacy_version
        from public.account_consents as consent
        where consent.user_id = auth.uid()
        order by consent.accepted_at desc, consent.id desc
        limit 1
      ) as latest_consent
      where latest_consent.terms_version = '2026-08-07'
        and latest_consent.privacy_version = '2026-08-07'
    );
$$;
revoke all on function public.get_catalog_feed(jsonb, integer)
  from public, anon, authenticated;

revoke all on function public.get_catalog_job_detail(uuid)
  from public, anon, authenticated;
grant execute on function public.get_catalog_job_detail(uuid)
  to authenticated;
grant execute on function public.get_catalog_feed(jsonb, integer)
  to authenticated;

commit;
