begin;

create or replace function public.export_backup_v2_overlays()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  caller_id uuid := auth.uid();
  manual_links jsonb;
  personal_states jsonb;
  duplicate_decisions jsonb;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  if (select count(*) from public.manual_catalog_links where user_id = caller_id) > 20000
     or (select count(*) from public.personal_job_states where user_id = caller_id)
        + (select count(*) from public.unresolved_source_overlays where user_id = caller_id) > 20000
     or (select count(*) from public.catalog_duplicate_decisions where user_id = caller_id and decision is not null)
        + (select count(*) from public.unresolved_duplicate_overlays where user_id = caller_id) > 20000 then
    raise exception 'backup v2 overlay limit exceeded' using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'legacyJobId', link.manual_job_id,
        'sourceRef', jsonb_build_object(
          'provider', link.provider_code,
          'externalId', link.external_id,
          'originalUrl', link.original_url
        )
      )
      order by link.manual_job_id
    ),
    '[]'::jsonb
  ) into manual_links
  from public.manual_catalog_links as link
  where link.user_id = caller_id;

  with state_rows as (
    select
      jsonb_build_array(posting.provider_code, posting.external_id, posting.original_url)::text as source_key,
      state.updated_at,
      jsonb_build_object(
        'sourceRef', jsonb_build_object(
          'provider', posting.provider_code,
          'externalId', posting.external_id,
          'originalUrl', posting.original_url
        ),
        'displaySnapshot', jsonb_strip_nulls(jsonb_build_object(
          'title', job.title,
          'companyName', job.company_name,
          'roleName', job.role_name,
          'locations', job.locations,
          'postedAt', to_char(job.posted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'deadlineAt', to_char(job.deadline_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )),
        'saved', state.saved,
        'excluded', state.excluded,
        'applicationStatus', state.application_status,
        'memo', state.memo,
        'nextActionAt', to_char(state.next_action_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
        'updatedAt', to_char(state.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) as payload
    from public.personal_job_states as state
    join public.canonical_jobs as job on job.id = state.canonical_job_id
    join lateral (
      select provider_code, external_id, original_url
      from public.source_postings
      where canonical_job_id = state.canonical_job_id
      order by provider_code, external_id, original_url
      limit 1
    ) as posting on true
    where state.user_id = caller_id

    union all

    select
      jsonb_build_array(overlay.provider_code, overlay.external_id, overlay.original_url)::text as source_key,
      overlay.updated_at,
      jsonb_build_object(
        'sourceRef', jsonb_build_object(
          'provider', overlay.provider_code,
          'externalId', overlay.external_id,
          'originalUrl', overlay.original_url
        ),
        'displaySnapshot', overlay.safe_display,
        'updatedAt', to_char(overlay.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      ) || overlay.state_payload as payload
    from public.unresolved_source_overlays as overlay
    where overlay.user_id = caller_id
  ), selected_states as (
    select distinct on (source_key) source_key, payload
    from state_rows
    order by source_key, updated_at desc
  )
  select coalesce(jsonb_agg(payload order by source_key), '[]'::jsonb)
    into personal_states
  from selected_states;

  with decision_rows as (
    select
      jsonb_build_array(left_posting.provider_code, left_posting.external_id, left_posting.original_url)::text as left_key,
      jsonb_build_array(right_posting.provider_code, right_posting.external_id, right_posting.original_url)::text as right_key,
      decision.updated_at,
      jsonb_build_object(
        'leftSourceRef', jsonb_build_object(
          'provider', left_posting.provider_code,
          'externalId', left_posting.external_id,
          'originalUrl', left_posting.original_url
        ),
        'rightSourceRef', jsonb_build_object(
          'provider', right_posting.provider_code,
          'externalId', right_posting.external_id,
          'originalUrl', right_posting.original_url
        ),
        'decision', decision.decision,
        'leftDisplaySnapshot', jsonb_strip_nulls(jsonb_build_object(
          'title', left_job.title,
          'companyName', left_job.company_name,
          'roleName', left_job.role_name,
          'locations', left_job.locations,
          'postedAt', to_char(left_job.posted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'deadlineAt', to_char(left_job.deadline_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        )),
        'rightDisplaySnapshot', jsonb_strip_nulls(jsonb_build_object(
          'title', right_job.title,
          'companyName', right_job.company_name,
          'roleName', right_job.role_name,
          'locations', right_job.locations,
          'postedAt', to_char(right_job.posted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'deadlineAt', to_char(right_job.deadline_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ))
      ) as payload
    from public.catalog_duplicate_decisions as decision
    join public.catalog_duplicate_candidates as candidate on candidate.id = decision.candidate_id
    join public.source_postings as left_posting on left_posting.id = candidate.left_source_posting_id
    join public.source_postings as right_posting on right_posting.id = candidate.right_source_posting_id
    join public.canonical_jobs as left_job on left_job.id = candidate.left_canonical_job_id
    join public.canonical_jobs as right_job on right_job.id = candidate.right_canonical_job_id
    where decision.user_id = caller_id
      and decision.decision is not null

    union all

    select
      jsonb_build_array(overlay.left_provider_code, overlay.left_external_id, overlay.left_original_url)::text as left_key,
      jsonb_build_array(overlay.right_provider_code, overlay.right_external_id, overlay.right_original_url)::text as right_key,
      overlay.updated_at,
      jsonb_build_object(
        'leftSourceRef', jsonb_build_object(
          'provider', overlay.left_provider_code,
          'externalId', overlay.left_external_id,
          'originalUrl', overlay.left_original_url
        ),
        'rightSourceRef', jsonb_build_object(
          'provider', overlay.right_provider_code,
          'externalId', overlay.right_external_id,
          'originalUrl', overlay.right_original_url
        ),
        'decision', case overlay.decision when 'merge' then 'merged' else 'separate' end,
        'leftDisplaySnapshot', overlay.left_safe_display,
        'rightDisplaySnapshot', overlay.right_safe_display
      ) as payload
    from public.unresolved_duplicate_overlays as overlay
    where overlay.user_id = caller_id
  ), selected_decisions as (
    select distinct on (least(left_key, right_key), greatest(left_key, right_key))
      least(left_key, right_key) as first_key,
      greatest(left_key, right_key) as second_key,
      payload
    from decision_rows
    order by least(left_key, right_key), greatest(left_key, right_key), updated_at desc
  )
  select coalesce(jsonb_agg(payload order by first_key, second_key), '[]'::jsonb)
    into duplicate_decisions
  from selected_decisions;

  if jsonb_array_length(manual_links) > 20000
     or jsonb_array_length(personal_states) > 20000
     or jsonb_array_length(duplicate_decisions) > 20000 then
    raise exception 'backup v2 overlay limit exceeded' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'manualLinks', manual_links,
    'personalStates', personal_states,
    'duplicateDecisions', duplicate_decisions
  );
end;
$$;

revoke all on function public.export_backup_v2_overlays() from public, anon, authenticated, service_role;
grant execute on function public.export_backup_v2_overlays() to authenticated;

commit;
