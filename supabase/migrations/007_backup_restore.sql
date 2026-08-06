create or replace function public.preview_backup_restore(target_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  conflicts integer;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if coalesce((target_payload->>'schemaVersion')::integer, 0) <> 1 then raise exception 'unsupported backup version'; end if;
  if jsonb_typeof(target_payload->'jobs') <> 'array'
     or jsonb_typeof(target_payload->'sources') <> 'array'
     or jsonb_typeof(target_payload->'duplicatePairs') <> 'array'
     or jsonb_typeof(target_payload->'revisions') <> 'array' then
    raise exception 'invalid backup collections';
  end if;

  if exists (
    select 1 from jsonb_array_elements(target_payload->'sources') source
    where not exists (
      select 1 from jsonb_array_elements(target_payload->'jobs') job
      where job->>'id' = source->>'jobId'
    )
  ) then raise exception 'invalid source reference'; end if;

  if exists (
    select 1 from jsonb_array_elements(target_payload->'duplicatePairs') pair
    where not exists (select 1 from jsonb_array_elements(target_payload->'jobs') job where job->>'id' = pair->>'leftJobId')
       or not exists (select 1 from jsonb_array_elements(target_payload->'jobs') job where job->>'id' = pair->>'rightJobId')
  ) then raise exception 'invalid duplicate reference'; end if;

  if exists (
    select 1 from public.jobs existing
    join jsonb_array_elements(target_payload->'jobs') item on existing.id = (item->>'id')::uuid
    where existing.user_id <> auth.uid()
  ) or exists (
    select 1 from public.job_sources existing
    join jsonb_array_elements(target_payload->'sources') item on existing.id = (item->>'id')::uuid
    where existing.user_id <> auth.uid()
  ) or exists (
    select 1 from public.duplicate_pairs existing
    join jsonb_array_elements(target_payload->'duplicatePairs') item on existing.id = (item->>'id')::uuid
    where existing.user_id <> auth.uid()
  ) or exists (
    select 1 from public.job_revisions existing
    join jsonb_array_elements(target_payload->'revisions') item on existing.id = (item->>'id')::uuid
    where existing.user_id <> auth.uid()
  ) then raise exception 'backup id belongs to another account'; end if;

  select count(*) into conflicts
  from public.jobs existing
  join jsonb_array_elements(target_payload->'jobs') item on existing.id = (item->>'id')::uuid
  where existing.user_id = auth.uid();

  return jsonb_build_object(
    'valid', true,
    'conflicts', conflicts,
    'counts', jsonb_build_object(
      'jobs', jsonb_array_length(target_payload->'jobs'),
      'sources', jsonb_array_length(target_payload->'sources'),
      'duplicatePairs', jsonb_array_length(target_payload->'duplicatePairs'),
      'revisions', jsonb_array_length(target_payload->'revisions')
    )
  );
end;
$$;

create or replace function public.commit_backup_restore(target_payload jsonb, target_device uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  group_id uuid;
  existing_owner uuid;
  revision_link jsonb;
begin
  perform public.preview_backup_restore(target_payload);
  perform set_config('app.device_id', target_device::text, true);
  perform set_config('app.change_kind', 'import', true);

  for group_id in
    select distinct (job->>'duplicateGroupId')::uuid
    from jsonb_array_elements(target_payload->'jobs') job
    where nullif(job->>'duplicateGroupId', '') is not null
  loop
    select user_id into existing_owner from public.duplicate_groups where id = group_id;
    if existing_owner is not null and existing_owner <> auth.uid() then raise exception 'duplicate group belongs to another account'; end if;
    insert into public.duplicate_groups(id, user_id) values (group_id, auth.uid()) on conflict (id) do nothing;
  end loop;

  for item in select value from jsonb_array_elements(target_payload->'jobs')
  loop
    if exists(select 1 from public.jobs where id = (item->>'id')::uuid and user_id = auth.uid()) then
      update public.jobs set
        title = item->>'title',
        company_name = item->>'companyName',
        role_name = item->>'roleName',
        summary = item->>'summary',
        responsibilities = coalesce(array(select jsonb_array_elements_text(item->'responsibilities')), '{}'),
        qualifications = coalesce(array(select jsonb_array_elements_text(item->'qualifications')), '{}'),
        preferred_qualifications = coalesce(array(select jsonb_array_elements_text(item->'preferredQualifications')), '{}'),
        career_min_years = (item->>'careerMinYears')::smallint,
        career_max_years = (item->>'careerMaxYears')::smallint,
        education_text = item->>'educationText',
        employment_types = coalesce(array(select jsonb_array_elements_text(item->'employmentTypes')), '{}'),
        locations = coalesce(array(select jsonb_array_elements_text(item->'locations')), '{}'),
        salary_text = item->>'salaryText',
        skills = coalesce(array(select jsonb_array_elements_text(item->'skills')), '{}'),
        posted_at = (item->>'postedAt')::timestamptz,
        deadline_at = (item->>'deadlineAt')::timestamptz,
        deadline_kind = (item->>'deadlineKind')::public.deadline_kind,
        application_status = (item->>'applicationStatus')::public.application_status,
        memo = coalesce(item->>'memo', ''),
        next_action_at = (item->>'nextActionAt')::timestamptz,
        duplicate_group_id = (item->>'duplicateGroupId')::uuid,
        field_provenance = coalesce(item->'fieldProvenance', '{}')
      where id = (item->>'id')::uuid and user_id = auth.uid();
    else
      insert into public.jobs(
        id,user_id,title,company_name,role_name,summary,responsibilities,qualifications,preferred_qualifications,
        career_min_years,career_max_years,education_text,employment_types,locations,salary_text,skills,
        posted_at,deadline_at,deadline_kind,application_status,memo,next_action_at,duplicate_group_id,
        field_provenance,created_at,updated_at
      ) values (
        (item->>'id')::uuid,auth.uid(),item->>'title',item->>'companyName',item->>'roleName',item->>'summary',
        coalesce(array(select jsonb_array_elements_text(item->'responsibilities')), '{}'),
        coalesce(array(select jsonb_array_elements_text(item->'qualifications')), '{}'),
        coalesce(array(select jsonb_array_elements_text(item->'preferredQualifications')), '{}'),
        (item->>'careerMinYears')::smallint,(item->>'careerMaxYears')::smallint,item->>'educationText',
        coalesce(array(select jsonb_array_elements_text(item->'employmentTypes')), '{}'),
        coalesce(array(select jsonb_array_elements_text(item->'locations')), '{}'),
        item->>'salaryText',coalesce(array(select jsonb_array_elements_text(item->'skills')), '{}'),
        (item->>'postedAt')::timestamptz,(item->>'deadlineAt')::timestamptz,
        (item->>'deadlineKind')::public.deadline_kind,(item->>'applicationStatus')::public.application_status,
        coalesce(item->>'memo',''),(item->>'nextActionAt')::timestamptz,(item->>'duplicateGroupId')::uuid,
        coalesce(item->'fieldProvenance','{}'),(item->>'createdAt')::timestamptz,(item->>'updatedAt')::timestamptz
      );
    end if;
  end loop;

  for item in select value from jsonb_array_elements(target_payload->'sources')
  loop
    if item->>'originalUrl' !~ '^https://[^[:space:]]+$' then raise exception 'invalid source url'; end if;
    if exists(select 1 from public.job_sources where id = (item->>'id')::uuid and user_id = auth.uid()) then
      update public.job_sources set
        job_id = (item->>'jobId')::uuid,
        provider = (item->>'provider')::public.source_provider,
        connector_mode = (item->>'connectorMode')::public.connector_mode,
        external_id = item->>'externalId',
        original_url = item->>'originalUrl',
        normalized_url = item->>'originalUrl',
        status = (item->>'status')::public.source_status,
        first_observed_at = (item->>'firstObservedAt')::timestamptz,
        last_checked_at = (item->>'lastCheckedAt')::timestamptz,
        last_success_at = (item->>'lastSuccessAt')::timestamptz,
        source_values = '{}',
        last_error_code = null
      where id = (item->>'id')::uuid and user_id = auth.uid();
    else
      insert into public.job_sources(
        id,user_id,job_id,provider,connector_mode,external_id,original_url,normalized_url,status,
        first_observed_at,last_checked_at,last_success_at,source_values,last_error_code
      ) values (
        (item->>'id')::uuid,auth.uid(),(item->>'jobId')::uuid,(item->>'provider')::public.source_provider,
        (item->>'connectorMode')::public.connector_mode,item->>'externalId',item->>'originalUrl',item->>'originalUrl',
        (item->>'status')::public.source_status,(item->>'firstObservedAt')::timestamptz,
        (item->>'lastCheckedAt')::timestamptz,(item->>'lastSuccessAt')::timestamptz,'{}',null
      );
    end if;
  end loop;

  for item in select value from jsonb_array_elements(target_payload->'duplicatePairs')
  loop
    insert into public.duplicate_pairs(
      id,user_id,left_job_id,right_job_id,score,reasons,decision,decided_at,created_at
    ) values (
      (item->>'id')::uuid,auth.uid(),(item->>'leftJobId')::uuid,(item->>'rightJobId')::uuid,
      (item->>'score')::numeric,coalesce(item->'reasons','{}'),(item->>'decision')::public.duplicate_decision,
      (item->>'decidedAt')::timestamptz,(item->>'createdAt')::timestamptz
    )
    on conflict (id) do update set
      score = excluded.score,reasons = excluded.reasons,decision = excluded.decision,decided_at = excluded.decided_at;
  end loop;

  for item in select value from jsonb_array_elements(target_payload->'revisions')
  loop
    insert into public.job_revisions(
      id,user_id,job_id,snapshot,changed_at,device_id,change_kind,restored_from_revision_id
    ) values (
      (item->>'id')::uuid,auth.uid(),(item->>'jobId')::uuid,coalesce(item->'snapshot','{}'),
      (item->>'changedAt')::timestamptz,(item->>'deviceId')::uuid,item->>'changeKind',null
    ) on conflict (id) do nothing;
  end loop;

  for revision_link in select value from jsonb_array_elements(target_payload->'revisions')
  loop
    if nullif(revision_link->>'restoredFromRevisionId','') is not null then
      update public.job_revisions
      set restored_from_revision_id = (revision_link->>'restoredFromRevisionId')::uuid
      where id = (revision_link->>'id')::uuid and user_id = auth.uid();
    end if;
  end loop;

  return jsonb_build_object(
    'jobs', jsonb_array_length(target_payload->'jobs'),
    'sources', jsonb_array_length(target_payload->'sources'),
    'duplicatePairs', jsonb_array_length(target_payload->'duplicatePairs'),
    'revisions', jsonb_array_length(target_payload->'revisions')
  );
end;
$$;

grant execute on function public.preview_backup_restore(jsonb) to authenticated;
grant execute on function public.commit_backup_restore(jsonb, uuid) to authenticated;