begin;

-- Personal duplicate decisions change only the caller's presentation. The
-- common catalog RPC remains the source of shared provider-health metadata.
create or replace function public.get_catalog_feed(
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
  safe_take integer := case when target_take between 30 and 1020 and target_take % 30 = 0 then target_take else 30 end;
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
  if not public.catalog_duplicate_has_current_consent(caller_id) then
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
    if career_min > career_max then career_filter := null; career_min := null; career_max := null; end if;
  elsif career_filter ~ '^[0-9]{1,2}\+$' then
    career_min := left(career_filter, -1)::integer;
  end if;

  common_result := public.get_catalog_feed_common(filters - 'saved' - 'includeExcluded', 30);

  with recursive common_candidates as materialized (
    select job.*, state.saved, state.excluded, state.application_status, state.next_action_at
    from public.canonical_jobs as job
    left join public.personal_job_states as state on state.user_id = caller_id and state.canonical_job_id = job.id
    where (job.lifecycle_status = 'active' or (job.lifecycle_status = 'stale' and job.last_observed_at >= statement_timestamp() - interval '24 hours'))
      and exists (
        select 1 from public.source_postings posting join public.source_providers provider on provider.code = posting.provider_code
        where posting.canonical_job_id = job.id and posting.source_status in ('active', 'missing_once')
          and (job.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours') and provider.enabled
      )
  ), retained_candidates as materialized (
    select job.*, state.saved, state.excluded, state.application_status, state.next_action_at
    from public.personal_job_states state join public.canonical_jobs job on job.id = state.canonical_job_id
    where state.user_id = caller_id and job.lifecycle_status in ('closed', 'withdrawn')
      and ((saved_only and state.saved) or (include_excluded and state.excluded))
      and (include_excluded or not state.excluded) and (not saved_only or state.saved)
      and exists (select 1 from public.source_postings posting where posting.canonical_job_id = job.id)
  ), personal_candidates as materialized (
    select candidate.*, false as retained_candidate from common_candidates candidate
    where (include_excluded or not coalesce(candidate.excluded, false)) and (not saved_only or coalesce(candidate.saved, false))
    union all
    select candidate.*, true as retained_candidate from retained_candidates candidate
  ), evaluated as materialized (
    select candidate.*,
      (q_filter is null or position(lower(q_filter) in lower(candidate.title || ' ' || candidate.company_name || ' ' || coalesce(candidate.role_name, ''))) > 0) as q_matches,
      (region_filter is null or exists (select 1 from unnest(candidate.locations) value where lower(value) = lower(region_filter))) as region_matches,
      (role_filter is null or (candidate.role_name is not null and lower(candidate.role_name) = lower(role_filter))) as role_matches,
      (employment_filter is null or exists (select 1 from unnest(candidate.employment_types) value where lower(value) = lower(employment_filter))) as employment_matches,
      (deadline_filter is null
        or (deadline_filter = 'active' and (candidate.deadline_kind in ('rolling', 'until_hired') or (candidate.deadline_kind = 'fixed' and candidate.deadline_at >= statement_timestamp())))
        or (deadline_filter = 'closingSoon' and candidate.deadline_kind = 'fixed' and candidate.deadline_at between statement_timestamp() and statement_timestamp() + interval '7 days')
        or (deadline_filter = 'unknown' and candidate.deadline_kind = 'unknown')) as deadline_matches,
      (career_filter is null
        or (career_filter = 'entry' and candidate.career_min_years = 0)
        or (career_filter = 'experienced' and coalesce(candidate.career_max_years, candidate.career_min_years, 0) > 0)
        or (career_filter = 'any' and (candidate.career_min_years is not null or candidate.career_max_years is not null))
        or (career_max is not null and candidate.career_min_years is not null and candidate.career_max_years is not null and candidate.career_min_years <= career_min and candidate.career_max_years >= career_max)
        or (career_max is null and career_min is not null and coalesce(candidate.career_max_years, candidate.career_min_years) >= career_min)) as career_matches,
      (source_filter is null or exists (
        select 1 from public.source_postings posting join public.source_providers provider on provider.code = posting.provider_code
        where posting.canonical_job_id = candidate.id and posting.provider_code = source_filter
          and (candidate.retained_candidate or (posting.source_status in ('active', 'missing_once') and (candidate.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours') and provider.enabled))
      )) as source_matches,
      exists (
        select 1 from public.source_postings posting join public.source_providers provider on provider.code = posting.provider_code
        where posting.canonical_job_id = candidate.id
          and (candidate.retained_candidate or (posting.source_status in ('active', 'missing_once') and (candidate.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours') and provider.enabled))
      ) as source_available
    from personal_candidates candidate
  ), visible as materialized (
    select jsonb_build_object(
      'id', job.id, 'title', job.title, 'companyName', job.company_name, 'roleName', job.role_name,
      'locations', to_jsonb(job.locations), 'employmentTypes', to_jsonb(job.employment_types),
      'careerMinYears', job.career_min_years, 'careerMaxYears', job.career_max_years,
      'experienceText', job.experience_text, 'educationText', job.education_text, 'industry', job.industry,
      'jobCategories', to_jsonb(job.job_categories), 'salaryText', job.salary_text, 'postedAt', job.posted_at,
      'deadlineKind', job.deadline_kind, 'deadlineAt', job.deadline_at, 'lifecycleStatus', job.lifecycle_status,
      'lastObservedAt', job.last_observed_at,
      'sources', coalesce((
        select jsonb_agg(jsonb_build_object('provider', provider.code, 'providerName', provider.display_name, 'originalUrl', posting.original_url, 'lastObservedAt', posting.last_observed_at, 'attribution', jsonb_build_object('text', provider.attribution->>'text', 'href', provider.attribution->>'href')) order by provider.code, posting.id)
        from public.source_postings posting join public.source_providers provider on provider.code = posting.provider_code
        where posting.canonical_job_id = job.id and (job.retained_candidate or (posting.source_status in ('active', 'missing_once') and (job.lifecycle_status = 'active' or posting.last_observed_at >= statement_timestamp() - interval '24 hours') and provider.enabled))
      ), '[]'::jsonb),
      'personalState', jsonb_build_object('saved', coalesce(job.saved, false), 'excluded', coalesce(job.excluded, false), 'applicationStatus', coalesce(job.application_status, 'unreviewed'), 'nextActionAt', job.next_action_at)
    ) as item, job.posted_at, job.last_observed_at, job.deadline_at, job.id as canonical_job_id
    from evaluated job
    where job.q_matches and job.region_matches and job.role_matches and job.career_matches and job.employment_matches and job.deadline_matches and job.source_matches
  ), active_edges as materialized (
    select candidate.id, candidate.left_canonical_job_id as left_id, candidate.right_canonical_job_id as right_id, candidate.reasons
    from public.catalog_duplicate_decisions decision
    join public.catalog_duplicate_candidates candidate on candidate.id = decision.candidate_id
    where decision.user_id = caller_id and decision.decision = 'merged'
      and public.catalog_duplicate_is_currently_eligible(candidate.id)
  ), walk(root, node, path) as (
    select visible.canonical_job_id, visible.canonical_job_id, array[visible.canonical_job_id]::uuid[] from visible
    union all
    select walk.root, case when edge.left_id = walk.node then edge.right_id else edge.left_id end,
      walk.path || case when edge.left_id = walk.node then edge.right_id else edge.left_id end
    from walk join active_edges edge on edge.left_id = walk.node or edge.right_id = walk.node
    where not (case when edge.left_id = walk.node then edge.right_id else edge.left_id end = any(walk.path))
      and cardinality(walk.path) < 25
  ), group_map as materialized (
    select root, (array_agg(distinct node order by node))[1] as group_id, array_agg(distinct node order by node) as member_ids
    from walk group by root
  ), group_reasons as materialized (
    select membership.group_id, coalesce(jsonb_agg(membership.reason order by membership.reason), '[]'::jsonb) as reasons
    from (
      select distinct groups.group_id, reason.value #>> '{}' as reason
      from (select distinct group_id, member_ids from group_map) groups
      join active_edges edge on edge.left_id = any(groups.member_ids) and edge.right_id = any(groups.member_ids)
      cross join lateral jsonb_array_elements(case when jsonb_typeof(edge.reasons) = 'array' then edge.reasons else '[]'::jsonb end) reason(value)
    ) membership
    group by membership.group_id
  ), grouped as materialized (
    select visible.*, groups.group_id, groups.member_ids
    from visible join group_map groups on groups.root = visible.canonical_job_id
  ), matching_members as materialized (
    select group_id, jsonb_agg(canonical_job_id order by canonical_job_id) as matching_member_ids
    from grouped group by group_id
  ), ranked as materialized (
    select grouped.*, row_number() over (
      partition by grouped.group_id
      order by case when sort_filter = 'deadline' then grouped.deadline_at end asc nulls last, grouped.posted_at desc nulls last, grouped.last_observed_at desc, grouped.canonical_job_id asc
    ) as representative_rank
    from grouped
  ), cards as materialized (
    select ranked.*,
      case when cardinality(ranked.member_ids) > 1 then ranked.item || jsonb_build_object('duplicateGroup', jsonb_build_object(
        'representativeId', ranked.canonical_job_id,
        'memberIds', to_jsonb(ranked.member_ids),
        'matchingMemberIds', matching.matching_member_ids,
        'reasons', coalesce(reasons.reasons, '[]'::jsonb)
      )) else ranked.item end as card
    from ranked
    join matching_members matching on matching.group_id = ranked.group_id
    left join group_reasons reasons on reasons.group_id = ranked.group_id
    where ranked.representative_rank = 1
  ), ordered as materialized (
    select cards.*, row_number() over (
      order by case when sort_filter = 'deadline' then deadline_at end asc nulls last, posted_at desc nulls last, last_observed_at desc, canonical_job_id asc
    ) as ordinal
    from cards
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(card order by ordinal) from ordered where ordinal <= safe_take), '[]'::jsonb),
    'total', (select count(*) from ordered),
    'missingCounts', jsonb_build_object(
      'region', (select count(*) from evaluated where q_matches and role_matches and career_matches and employment_matches and deadline_matches and source_matches and cardinality(locations) = 0),
      'role', (select count(*) from evaluated where q_matches and region_matches and career_matches and employment_matches and deadline_matches and source_matches and (role_name is null or btrim(role_name) = '')),
      'career', (select count(*) from evaluated where q_matches and region_matches and role_matches and employment_matches and deadline_matches and source_matches and career_min_years is null and career_max_years is null),
      'employment', (select count(*) from evaluated where q_matches and region_matches and role_matches and career_matches and deadline_matches and source_matches and cardinality(employment_types) = 0),
      'deadline', (select count(*) from evaluated where q_matches and region_matches and role_matches and career_matches and employment_matches and source_matches and deadline_kind = 'unknown'),
      'source', (select count(*) from evaluated where q_matches and region_matches and role_matches and career_matches and employment_matches and deadline_matches and not source_available)
    ),
    'hasMore', (select count(*) > safe_take from ordered),
    'providerHealth', common_result->'providerHealth',
    'enabledProviderCount', coalesce((common_result->>'enabledProviderCount')::integer, 0)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_catalog_duplicate_detail(target_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  candidate_record record;
  members uuid[];
  candidate_count integer := 0;
  result jsonb := '[]'::jsonb;
  sources jsonb;
  conflicts jsonb;
  user_detail jsonb;
  active boolean;
begin
  if caller_id is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if not public.catalog_duplicate_has_current_consent(caller_id) then return jsonb_build_object('candidates', result); end if;
  for candidate_record in
    select candidate.*, left_job.deadline_at as left_deadline_at, right_job.deadline_at as right_deadline_at,
      left_job.locations as left_locations, right_job.locations as right_locations,
      left_posting.provider_code as left_provider_code, right_posting.provider_code as right_provider_code,
      left_provider.display_name as left_provider_name, right_provider.display_name as right_provider_name,
      left_posting.original_url as left_original_url, right_posting.original_url as right_original_url,
      left_posting.last_observed_at as left_observed_at, right_posting.last_observed_at as right_observed_at
    from public.catalog_duplicate_candidates candidate
    join public.canonical_jobs left_job on left_job.id = candidate.left_canonical_job_id
    join public.canonical_jobs right_job on right_job.id = candidate.right_canonical_job_id
    join public.source_postings left_posting on left_posting.id = candidate.left_source_posting_id
    join public.source_postings right_posting on right_posting.id = candidate.right_source_posting_id
    join public.source_providers left_provider on left_provider.code = left_posting.provider_code
    join public.source_providers right_provider on right_provider.code = right_posting.provider_code
    where (candidate.left_canonical_job_id = target_id or candidate.right_canonical_job_id = target_id)
      and (public.catalog_duplicate_is_currently_eligible(candidate.id)
        or exists (select 1 from public.catalog_duplicate_decisions decision where decision.user_id = caller_id and decision.candidate_id = candidate.id)
        or exists (select 1 from public.catalog_duplicate_decision_events event where event.user_id = caller_id and event.candidate_id = candidate.id))
    order by candidate.id
  loop
    candidate_count := candidate_count + 1;
    if candidate_count > 25 then raise exception 'duplicate detail candidate limit exceeded' using errcode = '54000'; end if;
    active := public.catalog_duplicate_is_currently_eligible(candidate_record.id);
    members := case when active then public.catalog_duplicate_detail_component(caller_id, target_id) else array[target_id]::uuid[] end;
    if cardinality(members) > 25 then raise exception 'duplicate component limit exceeded' using errcode = '54000'; end if;
    sources := jsonb_build_array(
      jsonb_build_object('provider', candidate_record.left_provider_code, 'providerName', candidate_record.left_provider_name, 'originalUrl', public.catalog_duplicate_safe_source_url(candidate_record.left_original_url, (select terms_url from public.source_providers where code = candidate_record.left_provider_code)), 'observedAt', candidate_record.left_observed_at),
      jsonb_build_object('provider', candidate_record.right_provider_code, 'providerName', candidate_record.right_provider_name, 'originalUrl', public.catalog_duplicate_safe_source_url(candidate_record.right_original_url, (select terms_url from public.source_providers where code = candidate_record.right_provider_code)), 'observedAt', candidate_record.right_observed_at)
    );
    conflicts := '[]'::jsonb;
    if candidate_record.left_deadline_at is distinct from candidate_record.right_deadline_at then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('field', 'deadlineAt', 'values', jsonb_build_array(jsonb_build_object('provider', candidate_record.left_provider_code, 'observedAt', candidate_record.left_observed_at, 'value', candidate_record.left_deadline_at), jsonb_build_object('provider', candidate_record.right_provider_code, 'observedAt', candidate_record.right_observed_at, 'value', candidate_record.right_deadline_at))));
    end if;
    if candidate_record.left_locations is distinct from candidate_record.right_locations then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('field', 'locations', 'values', jsonb_build_array(jsonb_build_object('provider', candidate_record.left_provider_code, 'observedAt', candidate_record.left_observed_at, 'value', nullif(array_to_string(candidate_record.left_locations, ', '), '')), jsonb_build_object('provider', candidate_record.right_provider_code, 'observedAt', candidate_record.right_observed_at, 'value', nullif(array_to_string(candidate_record.right_locations, ', '), '')))));
    end if;
    select jsonb_build_object('decision', decision.decision, 'revision', coalesce(decision.effective_revision, 0), 'history', coalesce((
      select jsonb_agg(jsonb_build_object('action', event.action, 'createdAt', event.created_at) order by event.created_at desc, event.id desc)
      from (select * from public.catalog_duplicate_decision_events where user_id = caller_id and candidate_id = candidate_record.id order by created_at desc, id desc limit 25) event
    ), '[]'::jsonb)) into user_detail
    from public.catalog_duplicate_decisions decision where decision.user_id = caller_id and decision.candidate_id = candidate_record.id;
    user_detail := coalesce(user_detail, jsonb_build_object('decision', null, 'revision', 0, 'history', '[]'::jsonb));
    result := result || jsonb_build_array(jsonb_build_object(
      'id', candidate_record.id,
      'counterpartId', case when candidate_record.left_canonical_job_id = target_id then candidate_record.right_canonical_job_id else candidate_record.left_canonical_job_id end,
      'score', candidate_record.score, 'reasons', candidate_record.reasons, 'evidenceRevision', candidate_record.evidence_revision,
      'active', active, 'sources', sources, 'conflicts', conflicts, 'currentUser', user_detail,
      'group', jsonb_build_object('representativeId', members[1], 'memberIds', to_jsonb(members))
    ));
  end loop;
  return jsonb_build_object('candidates', result);
end;
$$;

revoke all on function public.get_catalog_feed(jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.get_catalog_duplicate_detail(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_catalog_feed(jsonb, integer) to authenticated;
grant execute on function public.get_catalog_duplicate_detail(uuid) to authenticated;

commit;
