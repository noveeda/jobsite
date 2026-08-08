begin;

create table public.personal_job_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_job_id uuid not null references public.canonical_jobs(id) on delete restrict,
  saved boolean not null default false,
  excluded boolean not null default false,
  application_status text not null default 'unreviewed',
  memo text not null default '',
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, canonical_job_id),
  constraint personal_job_states_application_status_check check (
    application_status in (
      'unreviewed',
      'planned',
      'applied',
      'interviewing',
      'offered',
      'rejected',
      'withdrawn'
    )
  ),
  constraint personal_job_states_memo_check check (char_length(memo) <= 10000)
);

create index personal_job_states_saved_idx
  on public.personal_job_states(user_id, canonical_job_id)
  where saved;

create index personal_job_states_excluded_idx
  on public.personal_job_states(user_id, canonical_job_id)
  where excluded;

create trigger personal_job_states_updated_at
  before update on public.personal_job_states
  for each row execute function public.set_updated_at();

alter table public.personal_job_states enable row level security;
alter table public.personal_job_states force row level security;

revoke all on table public.personal_job_states from public, anon, authenticated;
grant select, insert, update, delete on table public.personal_job_states to authenticated;

create policy personal_job_states_owner_select
  on public.personal_job_states
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy personal_job_states_owner_insert
  on public.personal_job_states
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy personal_job_states_owner_update
  on public.personal_job_states
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy personal_job_states_owner_delete
  on public.personal_job_states
  for delete
  to authenticated
  using (auth.uid() = user_id);

alter function public.get_catalog_feed(jsonb, integer)
  rename to get_catalog_feed_common;
alter function public.get_catalog_job_detail(uuid)
  rename to get_catalog_job_detail_common;

revoke all on function public.get_catalog_feed_common(jsonb, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_catalog_job_detail_common(uuid)
  from public, anon, authenticated, service_role;

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
  include_excluded boolean := false;
  saved_only boolean := false;
  sort_filter text;
  q_filter text;
  region_filter text;
  role_filter text;
  employment_filter text;
  deadline_filter text;
  source_filter text;
  career_filter text;
  career_min integer;
  career_max integer;
  common_result jsonb;
  result jsonb;
begin
  if caller_id is null or jsonb_typeof(filters) <> 'object' then
    return public.get_catalog_feed_common('{"saved":true}'::jsonb, 30);
  end if;
  if (filters ? 'includeExcluded' and jsonb_typeof(filters->'includeExcluded') <> 'boolean')
     or (filters ? 'saved' and jsonb_typeof(filters->'saved') <> 'boolean') then
    return public.get_catalog_feed_common('{"saved":true}'::jsonb, 30);
  end if;

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
    return public.get_catalog_feed_common('{"saved":true}'::jsonb, 30);
  end if;

  include_excluded := filters @> '{"includeExcluded":true}'::jsonb;
  saved_only := filters @> '{"saved":true}'::jsonb;
  sort_filter := case when filters->>'sort' = 'deadline' then 'deadline' else 'posted' end;
  q_filter := case when jsonb_typeof(filters->'q') = 'string' and length(btrim(filters->>'q')) between 1 and 100 then btrim(regexp_replace(filters->>'q', '\s+', ' ', 'g')) end;
  region_filter := case when jsonb_typeof(filters->'region') = 'string' and length(btrim(filters->>'region')) between 1 and 100 then btrim(filters->>'region') end;
  role_filter := case when jsonb_typeof(filters->'role') = 'string' and length(btrim(filters->>'role')) between 1 and 100 then btrim(filters->>'role') end;
  employment_filter := case when jsonb_typeof(filters->'employment') = 'string' and length(btrim(filters->>'employment')) between 1 and 100 then btrim(filters->>'employment') end;
  deadline_filter := case when filters->>'deadline' in ('active', 'closingSoon', 'unknown') then filters->>'deadline' end;
  source_filter := case when jsonb_typeof(filters->'source') = 'string' and (filters->>'source') ~ '^[a-z][a-z0-9_-]{1,39}$' then filters->>'source' end;
  career_filter := case when jsonb_typeof(filters->'career') = 'string' and (filters->>'career') ~ '^(entry|experienced|any|[0-9]{1,2}(-[0-9]{1,2}|\+)?)$' then filters->>'career' end;

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

  -- The common RPC still owns provider health metadata. Job candidates and
  -- missing-value counts are evaluated below after personal filtering.
  common_result := public.get_catalog_feed_common(filters - 'saved' - 'includeExcluded', 30);

  with common_candidates as materialized (
    select
      job.*,
      state.saved,
      state.excluded,
      state.application_status,
      state.next_action_at
    from public.canonical_jobs as job
    left join public.personal_job_states as state
      on state.user_id = caller_id and state.canonical_job_id = job.id
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
        join public.source_providers as provider on provider.code = posting.provider_code
        where posting.canonical_job_id = job.id
          and posting.source_status in ('active', 'missing_once')
          and (job.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
          and provider.enabled
      )
  ),
  retained_candidates as materialized (
    select
      job.*,
      state.saved,
      state.excluded,
      state.application_status,
      state.next_action_at
    from public.personal_job_states as state
    join public.canonical_jobs as job on job.id = state.canonical_job_id
    where state.user_id = caller_id
      and job.lifecycle_status in ('closed', 'withdrawn')
      and ((saved_only and state.saved) or (include_excluded and state.excluded))
      and (include_excluded or not state.excluded)
      and (not saved_only or state.saved)
      and exists (select 1 from public.source_postings as posting where posting.canonical_job_id = job.id)
  ),
  personal_candidates as materialized (
    select candidate.*, false as retained_candidate
    from common_candidates as candidate
    where (include_excluded or not coalesce(candidate.excluded, false))
      and (not saved_only or coalesce(candidate.saved, false))
    union all
    select candidate.*, true as retained_candidate
    from retained_candidates as candidate
  ),
  evaluated as materialized (
    select
      candidate.*,
      (q_filter is null or position(lower(q_filter) in lower(candidate.title || ' ' || candidate.company_name || ' ' || coalesce(candidate.role_name, ''))) > 0) as q_matches,
      (region_filter is null or exists (select 1 from unnest(candidate.locations) as value where lower(value) = lower(region_filter))) as region_matches,
      (role_filter is null or (candidate.role_name is not null and lower(candidate.role_name) = lower(role_filter))) as role_matches,
      (employment_filter is null or exists (select 1 from unnest(candidate.employment_types) as value where lower(value) = lower(employment_filter))) as employment_matches,
      (
        deadline_filter is null
        or (deadline_filter = 'active' and (candidate.deadline_kind in ('rolling', 'until_hired') or (candidate.deadline_kind = 'fixed' and candidate.deadline_at >= statement_timestamp())))
        or (deadline_filter = 'closingSoon' and candidate.deadline_kind = 'fixed' and candidate.deadline_at between statement_timestamp() and statement_timestamp() + interval '7 days')
        or (deadline_filter = 'unknown' and candidate.deadline_kind = 'unknown')
      ) as deadline_matches,
      (
        career_filter is null
        or (career_filter = 'entry' and candidate.career_min_years = 0)
        or (career_filter = 'experienced' and coalesce(candidate.career_max_years, candidate.career_min_years, 0) > 0)
        or (career_filter = 'any' and (candidate.career_min_years is not null or candidate.career_max_years is not null))
        or (career_max is not null and candidate.career_min_years is not null and candidate.career_max_years is not null and candidate.career_min_years <= career_min and candidate.career_max_years >= career_max)
        or (career_max is null and career_min is not null and coalesce(candidate.career_max_years, candidate.career_min_years) >= career_min)
      ) as career_matches,
      (
        source_filter is null
        or exists (
          select 1
          from public.source_postings as posting
          join public.source_providers as provider on provider.code = posting.provider_code
          where posting.canonical_job_id = candidate.id
            and posting.provider_code = source_filter
            and (
              candidate.retained_candidate
              or (
                posting.source_status in ('active', 'missing_once')
                and (candidate.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
                and provider.enabled
              )
            )
        )
      ) as source_matches,
      exists (
        select 1
        from public.source_postings as posting
        join public.source_providers as provider on provider.code = posting.provider_code
        where posting.canonical_job_id = candidate.id
          and (
            candidate.retained_candidate
            or (
              posting.source_status in ('active', 'missing_once')
              and (candidate.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
              and provider.enabled
            )
          )
      ) as source_available
    from personal_candidates as candidate
  ),
  combined as materialized (
    select
      jsonb_build_object(
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
        'sources', coalesce((
          select jsonb_agg(jsonb_build_object(
            'provider', provider.code,
            'providerName', provider.display_name,
            'originalUrl', posting.original_url,
            'lastObservedAt', posting.last_observed_at,
            'attribution', jsonb_build_object(
              'text', provider.attribution->>'text',
              'href', provider.attribution->>'href'
            )
          ) order by provider.code, posting.id)
          from public.source_postings as posting
          join public.source_providers as provider on provider.code = posting.provider_code
          where posting.canonical_job_id = job.id
            and (
              job.retained_candidate
              or (
                posting.source_status in ('active', 'missing_once')
                and (job.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours')
                and provider.enabled
              )
            )
        ), '[]'::jsonb),
        'personalState', jsonb_build_object(
          'saved', coalesce(job.saved, false),
          'excluded', coalesce(job.excluded, false),
          'applicationStatus', coalesce(job.application_status, 'unreviewed'),
          'nextActionAt', job.next_action_at
        )
      ) as item,
      job.posted_at,
      job.last_observed_at,
      job.deadline_at,
      job.id as canonical_job_id
    from evaluated as job
    where job.q_matches
      and job.region_matches
      and job.role_matches
      and job.career_matches
      and job.employment_matches
      and job.deadline_matches
      and job.source_matches
  ),
  ordered as materialized (
    select combined.*, row_number() over (
      order by
        case when sort_filter = 'deadline' then deadline_at end asc nulls last,
        posted_at desc nulls last,
        last_observed_at desc,
        canonical_job_id asc
    ) as ordinal
    from combined
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(item order by ordinal) from ordered where ordinal <= safe_take), '[]'::jsonb),
    'total', (select count(*) from ordered),
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
        select count(*) from evaluated
        where q_matches and region_matches and role_matches and career_matches and employment_matches and deadline_matches
          and not source_available
      )
    ),
    'hasMore', (select count(*) > safe_take from ordered),
    'providerHealth', common_result->'providerHealth',
    'enabledProviderCount', coalesce((common_result->>'enabledProviderCount')::integer, 0)
  ) into result;

  return result;
end;
$$;

create function public.get_catalog_job_detail(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  caller_id uuid := auth.uid();
  common_detail jsonb;
  state public.personal_job_states%rowtype;
  result jsonb;
begin
  if caller_id is null then return null; end if;
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
  ) then return null; end if;

  select * into state
  from public.personal_job_states as personal
  where personal.user_id = caller_id and personal.canonical_job_id = target_id;

  common_detail := public.get_catalog_job_detail_common(target_id);
  if common_detail is not null then
    return common_detail || jsonb_build_object('personalState', jsonb_build_object(
      'saved', coalesce(state.saved, false),
      'excluded', coalesce(state.excluded, false),
      'applicationStatus', coalesce(state.application_status, 'unreviewed'),
      'memo', coalesce(state.memo, ''),
      'nextActionAt', state.next_action_at
    ));
  end if;
  if state.user_id is null then return null; end if;

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
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', provider.code,
        'providerName', provider.display_name,
        'originalUrl', posting.original_url,
        'lastObservedAt', posting.last_observed_at,
        'attribution', jsonb_build_object(
          'text', provider.attribution->>'text',
          'href', provider.attribution->>'href'
        )
      ) order by provider.code, posting.id)
      from public.source_postings as posting
      join public.source_providers as provider on provider.code = posting.provider_code
      where posting.canonical_job_id = job.id
    ), '[]'::jsonb),
    'personalState', jsonb_build_object(
      'saved', state.saved,
      'excluded', state.excluded,
      'applicationStatus', state.application_status,
      'memo', state.memo,
      'nextActionAt', state.next_action_at
    )
  ) into result
  from public.canonical_jobs as job
  where job.id = target_id
    and exists (select 1 from public.source_postings as posting where posting.canonical_job_id = job.id);

  return result;
end;
$$;

revoke all on function public.get_catalog_feed(jsonb, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.get_catalog_job_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_catalog_feed(jsonb, integer) to authenticated;
grant execute on function public.get_catalog_job_detail(uuid) to authenticated;

commit;
