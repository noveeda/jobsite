begin;

-- Keep the original v1 implementation intact behind non-public entrypoints.
alter function public.preview_backup_restore(jsonb)
  rename to preview_backup_restore_v1;
alter function public.commit_backup_restore(jsonb, uuid)
  rename to commit_backup_restore_v1;
alter function public.preview_backup_restore_v1(jsonb) set search_path = '';
alter function public.commit_backup_restore_v1(jsonb, uuid) set search_path = '';

create function public.backup_v2_is_source_ref(target_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(target_value) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(target_value) as key
       where key not in ('provider', 'externalId', 'originalUrl')
     )
     or not (target_value ?& array['provider', 'externalId', 'originalUrl'])
     or jsonb_typeof(target_value->'provider') <> 'string'
     or jsonb_typeof(target_value->'externalId') <> 'string'
     or jsonb_typeof(target_value->'originalUrl') <> 'string'
     or target_value->>'provider' !~ '^[a-z][a-z0-9_-]{1,39}$'
     or char_length(target_value->>'externalId') not between 1 and 200
     or btrim(target_value->>'externalId') <> target_value->>'externalId'
     or char_length(target_value->>'originalUrl') > 2048
     or target_value->>'originalUrl' !~ '^https://[^[:space:]]+$'
     or target_value->>'originalUrl' ~ '^https://[^/@[:space:]]+@' then
    return false;
  end if;
  return true;
end;
$$;

create function public.backup_v2_validate(target_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  item_key text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(target_payload) <> 'object'
     or octet_length(target_payload::text) > 10 * 1024 * 1024
     or exists (
       select 1 from jsonb_object_keys(target_payload) as key
       where key not in ('version', 'exportedAt', 'legacy', 'personalStates', 'duplicateDecisions', 'manualLinks')
     )
     or not (target_payload ?& array['version', 'exportedAt', 'legacy', 'personalStates', 'duplicateDecisions', 'manualLinks'])
     or target_payload->>'version' <> '2'
     or jsonb_typeof(target_payload->'exportedAt') <> 'string'
     or jsonb_typeof(target_payload->'legacy') <> 'object'
     or jsonb_typeof(target_payload->'personalStates') <> 'array'
     or jsonb_typeof(target_payload->'duplicateDecisions') <> 'array'
     or jsonb_typeof(target_payload->'manualLinks') <> 'array'
     or jsonb_array_length(target_payload->'personalStates') > 20000
     or jsonb_array_length(target_payload->'duplicateDecisions') > 20000
     or jsonb_array_length(target_payload->'manualLinks') > 20000 then
    raise exception 'invalid backup v2 envelope' using errcode = '22023';
  end if;

  perform public.preview_backup_restore_v1(target_payload->'legacy');

  for item in select value from jsonb_array_elements(target_payload->'personalStates')
  loop
    if jsonb_typeof(item) <> 'object'
       or exists (select 1 from jsonb_object_keys(item) as key where key not in ('sourceRef', 'displaySnapshot', 'saved', 'excluded', 'applicationStatus', 'memo', 'nextActionAt', 'updatedAt'))
       or not (item ?& array['sourceRef', 'updatedAt'])
       or not public.backup_v2_is_source_ref(item->'sourceRef')
       or (item ? 'displaySnapshot' and not public.legacy_links_is_safe_display(item->'displaySnapshot'))
       or (item ? 'saved' and jsonb_typeof(item->'saved') <> 'boolean')
       or (item ? 'excluded' and jsonb_typeof(item->'excluded') <> 'boolean')
       or (item ? 'applicationStatus' and (jsonb_typeof(item->'applicationStatus') <> 'string' or item->>'applicationStatus' not in ('unreviewed', 'planned', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn')))
       or (item ? 'memo' and (jsonb_typeof(item->'memo') <> 'string' or char_length(item->>'memo') > 10000))
       or (item ? 'nextActionAt' and jsonb_typeof(item->'nextActionAt') not in ('string', 'null'))
       or jsonb_typeof(item->'updatedAt') <> 'string' then
      raise exception 'invalid backup v2 personal state' using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1 from jsonb_array_elements(target_payload->'personalStates') as state
    group by state->'sourceRef'::text having count(*) > 1
  ) then
    raise exception 'duplicate backup v2 source reference' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(target_payload->'duplicateDecisions')
  loop
    if jsonb_typeof(item) <> 'object'
       or exists (select 1 from jsonb_object_keys(item) as key where key not in ('leftSourceRef', 'rightSourceRef', 'decision', 'leftDisplaySnapshot', 'rightDisplaySnapshot', 'representativeSourceRef'))
       or not (item ?& array['leftSourceRef', 'rightSourceRef', 'decision'])
       or not public.backup_v2_is_source_ref(item->'leftSourceRef')
       or not public.backup_v2_is_source_ref(item->'rightSourceRef')
       or item->'leftSourceRef' = item->'rightSourceRef'
       or item->>'decision' not in ('merged', 'separate')
       or (item ? 'leftDisplaySnapshot' and not public.legacy_links_is_safe_display(item->'leftDisplaySnapshot'))
       or (item ? 'rightDisplaySnapshot' and not public.legacy_links_is_safe_display(item->'rightDisplaySnapshot'))
       or (item ? 'representativeSourceRef' and jsonb_typeof(item->'representativeSourceRef') <> 'null' and not public.backup_v2_is_source_ref(item->'representativeSourceRef')) then
      raise exception 'invalid backup v2 duplicate decision' using errcode = '22023';
    end if;
  end loop;
  if exists (
    select 1
    from jsonb_array_elements(target_payload->'duplicateDecisions') as decision
    group by least(decision->'leftSourceRef'::text, decision->'rightSourceRef'::text), greatest(decision->'leftSourceRef'::text, decision->'rightSourceRef'::text)
    having count(*) > 1
  ) then
    raise exception 'duplicate backup v2 duplicate decision' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(target_payload->'manualLinks')
  loop
    if jsonb_typeof(item) <> 'object'
       or exists (select 1 from jsonb_object_keys(item) as key where key not in ('legacyJobId', 'sourceRef'))
       or not (item ?& array['legacyJobId', 'sourceRef'])
       or jsonb_typeof(item->'legacyJobId') <> 'string'
       or item->>'legacyJobId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or not public.backup_v2_is_source_ref(item->'sourceRef')
       or not exists (select 1 from jsonb_array_elements(target_payload->'legacy'->'jobs') as job where job->>'id' = item->>'legacyJobId') then
      raise exception 'invalid backup v2 manual link' using errcode = '22023';
    end if;
  end loop;
  if exists (
    select 1 from jsonb_array_elements(target_payload->'manualLinks') as link
    group by link->>'legacyJobId' having count(*) > 1
  ) then
    raise exception 'duplicate backup v2 manual link' using errcode = '22023';
  end if;
end;
$$;

create function public.preview_backup_restore(target_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(target_payload->>'schemaVersion', '') = '1' then
    return public.preview_backup_restore_v1(target_payload);
  end if;
  perform public.backup_v2_validate(target_payload);
  return jsonb_build_object(
    'valid', true,
    'counts', jsonb_build_object(
      'jobs', jsonb_array_length(target_payload->'legacy'->'jobs'),
      'sources', jsonb_array_length(target_payload->'legacy'->'sources'),
      'duplicatePairs', jsonb_array_length(target_payload->'legacy'->'duplicatePairs'),
      'revisions', jsonb_array_length(target_payload->'legacy'->'revisions'),
      'personalStates', jsonb_array_length(target_payload->'personalStates'),
      'duplicateDecisions', jsonb_array_length(target_payload->'duplicateDecisions'),
      'manualLinks', jsonb_array_length(target_payload->'manualLinks')
    )
  );
end;
$$;

create function public.commit_backup_restore(target_payload jsonb, target_device uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  item jsonb;
  source_ref jsonb;
  state_payload jsonb;
  source_row public.source_postings%rowtype;
  candidate_id uuid;
  expected_revision integer;
  decision_result jsonb;
  operation_id uuid;
  left_provider text;
  left_external text;
  left_url text;
  right_provider text;
  right_external text;
  right_url text;
  left_display jsonb;
  right_display jsonb;
  temp_text text;
  legacy_result jsonb;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(target_payload->>'schemaVersion', '') = '1' then
    return public.commit_backup_restore_v1(target_payload, target_device);
  end if;

  perform public.backup_v2_validate(target_payload);
  legacy_result := public.commit_backup_restore_v1(target_payload->'legacy', target_device);

  for item in select value from jsonb_array_elements(target_payload->'personalStates')
  loop
    source_ref := item->'sourceRef';
    select posting.* into source_row
    from public.source_postings as posting
    join public.canonical_jobs as canonical on canonical.id = posting.canonical_job_id
    where posting.provider_code = source_ref->>'provider'
      and posting.external_id = source_ref->>'externalId'
      and posting.original_url = source_ref->>'originalUrl'
      and posting.source_status = 'active'
      and canonical.lifecycle_status = 'active'
    limit 1;

    state_payload := jsonb_strip_nulls(jsonb_build_object(
      'saved', item->'saved',
      'excluded', item->'excluded',
      'applicationStatus', item->'applicationStatus',
      'memo', item->'memo',
      'nextActionAt', item->'nextActionAt'
    ));
    if source_row.id is null then
      insert into public.unresolved_source_overlays(
        user_id, provider_code, external_id, original_url, state_payload, safe_display
      ) values (
        caller_id, source_ref->>'provider', source_ref->>'externalId', source_ref->>'originalUrl',
        state_payload, coalesce(item->'displaySnapshot', '{}'::jsonb)
      ) on conflict (user_id, provider_code, external_id, original_url) do update
        set state_payload = excluded.state_payload,
            safe_display = excluded.safe_display,
            updated_at = clock_timestamp();
    else
      insert into public.personal_job_states(
        user_id, canonical_job_id, saved, excluded, application_status, memo, next_action_at
      ) values (
        caller_id, source_row.canonical_job_id,
        coalesce((item->>'saved')::boolean, false),
        coalesce((item->>'excluded')::boolean, false),
        coalesce(item->>'applicationStatus', 'unreviewed'),
        coalesce(item->>'memo', ''),
        nullif(item->>'nextActionAt', '')::timestamptz
      ) on conflict (user_id, canonical_job_id) do update
        set saved = excluded.saved,
            excluded = excluded.excluded,
            application_status = excluded.application_status,
            memo = excluded.memo,
            next_action_at = excluded.next_action_at,
            updated_at = clock_timestamp();
    end if;
  end loop;

  for item in select value from jsonb_array_elements(target_payload->'manualLinks')
  loop
    source_ref := item->'sourceRef';
    select posting.* into source_row
    from public.source_postings as posting
    join public.canonical_jobs as canonical on canonical.id = posting.canonical_job_id
    where posting.provider_code = source_ref->>'provider'
      and posting.external_id = source_ref->>'externalId'
      and posting.original_url = source_ref->>'originalUrl'
      and posting.source_status = 'active'
      and canonical.lifecycle_status = 'active'
    limit 1;
    if source_row.id is not null then
      insert into public.manual_catalog_links(
        user_id, manual_job_id, source_posting_id, canonical_job_id, provider_code, external_id, original_url
      ) values (
        caller_id, (item->>'legacyJobId')::uuid, source_row.id, source_row.canonical_job_id,
        source_row.provider_code, source_row.external_id, source_row.original_url
      ) on conflict (user_id, manual_job_id) do update
        set source_posting_id = excluded.source_posting_id,
            canonical_job_id = excluded.canonical_job_id,
            provider_code = excluded.provider_code,
            external_id = excluded.external_id,
            original_url = excluded.original_url,
            updated_at = clock_timestamp();
    end if;
  end loop;

  for item in select value from jsonb_array_elements(target_payload->'duplicateDecisions')
  loop
    left_provider := item->'leftSourceRef'->>'provider';
    left_external := item->'leftSourceRef'->>'externalId';
    left_url := item->'leftSourceRef'->>'originalUrl';
    right_provider := item->'rightSourceRef'->>'provider';
    right_external := item->'rightSourceRef'->>'externalId';
    right_url := item->'rightSourceRef'->>'originalUrl';
    left_display := coalesce(item->'leftDisplaySnapshot', '{}'::jsonb);
    right_display := coalesce(item->'rightDisplaySnapshot', '{}'::jsonb);

    select candidate.id, coalesce(existing.effective_revision, 0)
      into candidate_id, expected_revision
    from public.catalog_duplicate_candidates as candidate
    join public.source_postings as left_posting on left_posting.id = candidate.left_source_posting_id
    join public.source_postings as right_posting on right_posting.id = candidate.right_source_posting_id
    left join public.catalog_duplicate_decisions as existing
      on existing.candidate_id = candidate.id and existing.user_id = caller_id
    where candidate.status = 'active'
      and public.catalog_duplicate_is_currently_eligible(candidate.id)
      and (
        (left_posting.provider_code = left_provider and left_posting.external_id = left_external and left_posting.original_url = left_url
         and right_posting.provider_code = right_provider and right_posting.external_id = right_external and right_posting.original_url = right_url)
        or
        (left_posting.provider_code = right_provider and left_posting.external_id = right_external and left_posting.original_url = right_url
         and right_posting.provider_code = left_provider and right_posting.external_id = left_external and right_posting.original_url = left_url)
      )
    limit 1;

    if candidate_id is not null then
      operation_id := (
        substr(md5(caller_id::text || ':backup-v2:' || least(left_provider || '|' || left_external || '|' || left_url, right_provider || '|' || right_external || '|' || right_url) || ':' || item->>'decision'), 1, 8)
        || '-' || substr(md5(caller_id::text || ':backup-v2:' || item::text), 9, 4)
        || '-4' || substr(md5(caller_id::text || ':backup-v2:' || item::text), 14, 3)
        || '-8' || substr(md5(caller_id::text || ':backup-v2:' || item::text), 18, 3)
        || '-' || substr(md5(caller_id::text || ':backup-v2:' || item::text), 21, 12)
      )::uuid;
      begin
        select public.set_catalog_duplicate_decision(
          candidate_id,
          case item->>'decision' when 'merged' then 'merge' else 'separate' end,
          operation_id,
          expected_revision,
          '{}'::jsonb
        ) into decision_result;
      exception
        when sqlstate '22023' or sqlstate '42501' or sqlstate '40001' or sqlstate '54000' then
        decision_result := null;
      end;
      if coalesce(decision_result->>'ok', 'false') = 'true' then
        continue;
      end if;
    end if;

    if (left_provider, left_external, left_url) > (right_provider, right_external, right_url) then
      temp_text := left_provider; left_provider := right_provider; right_provider := temp_text;
      temp_text := left_external; left_external := right_external; right_external := temp_text;
      temp_text := left_url; left_url := right_url; right_url := temp_text;
      state_payload := left_display; left_display := right_display; right_display := state_payload;
    end if;
    insert into public.unresolved_duplicate_overlays(
      user_id,
      left_provider_code, left_external_id, left_original_url,
      right_provider_code, right_external_id, right_original_url,
      decision, left_safe_display, right_safe_display
    ) values (
      caller_id,
      left_provider, left_external, left_url,
      right_provider, right_external, right_url,
      case item->>'decision' when 'merged' then 'merge' else 'separate' end,
      left_display, right_display
    ) on conflict (
      user_id,
      left_provider_code, left_external_id, left_original_url,
      right_provider_code, right_external_id, right_original_url, decision
    ) do update set
      left_safe_display = excluded.left_safe_display,
      right_safe_display = excluded.right_safe_display,
      updated_at = clock_timestamp();
  end loop;

  return legacy_result || jsonb_build_object(
    'personalStates', jsonb_array_length(target_payload->'personalStates'),
    'duplicateDecisions', jsonb_array_length(target_payload->'duplicateDecisions'),
    'manualLinks', jsonb_array_length(target_payload->'manualLinks')
  );
end;
$$;

revoke all on function public.preview_backup_restore_v1(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.commit_backup_restore_v1(jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.backup_v2_is_source_ref(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.backup_v2_validate(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.preview_backup_restore(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.commit_backup_restore(jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.preview_backup_restore(jsonb) to authenticated;
grant execute on function public.commit_backup_restore(jsonb, uuid) to authenticated;

commit;
