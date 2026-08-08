begin;

-- A v2 backup can name a private manual job and a portable source identity
-- whose catalog row is no longer available on the target. Keep that intent
-- owner-scoped instead of silently dropping it or creating shared catalog data.
create table public.unresolved_manual_catalog_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  manual_job_id uuid not null references public.jobs(id) on delete cascade,
  provider_code text not null,
  external_id text not null,
  original_url text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, manual_job_id),
  constraint unresolved_manual_catalog_links_provider_code_check
    check (provider_code ~ '^[a-z][a-z0-9_-]{1,39}$'),
  constraint unresolved_manual_catalog_links_external_id_check
    check (char_length(btrim(external_id)) between 1 and 200),
  constraint unresolved_manual_catalog_links_original_url_check check (
    char_length(original_url) <= 2048
    and original_url ~ '^https://[^[:space:]]+$'
    and original_url !~ '^https://[^/@[:space:]]+@'
  )
);

create index unresolved_manual_catalog_links_source_identity_idx
  on public.unresolved_manual_catalog_links(provider_code, external_id, original_url);

create trigger unresolved_manual_catalog_links_updated_at
  before update on public.unresolved_manual_catalog_links
  for each row execute function public.set_updated_at();

alter table public.unresolved_manual_catalog_links enable row level security;
alter table public.unresolved_manual_catalog_links force row level security;

create policy unresolved_manual_catalog_links_owner_all
  on public.unresolved_manual_catalog_links for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.unresolved_manual_catalog_links
  from public, anon, authenticated, service_role;

-- This helper is intentionally uncallable. It runs from source/canonical
-- lifecycle triggers and only links records when the full portable identity is
-- again live in the catalog.
create function public.reconcile_unresolved_manual_catalog_links_for_source(
  target_provider_code text,
  target_external_id text,
  target_original_url text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_posting public.source_postings%rowtype;
  reconciled_count integer := 0;
begin
  select posting.* into resolved_posting
  from public.source_postings as posting
  join public.canonical_jobs as canonical on canonical.id = posting.canonical_job_id
  where posting.provider_code = target_provider_code
    and posting.external_id = target_external_id
    and posting.original_url = target_original_url
    and posting.source_status = 'active'
    and canonical.lifecycle_status = 'active'
  limit 1;

  if resolved_posting.id is null then
    return 0;
  end if;

  insert into public.manual_catalog_links(
    user_id, manual_job_id, source_posting_id, canonical_job_id,
    provider_code, external_id, original_url
  )
  select
    unresolved.user_id,
    unresolved.manual_job_id,
    resolved_posting.id,
    resolved_posting.canonical_job_id,
    resolved_posting.provider_code,
    resolved_posting.external_id,
    resolved_posting.original_url
  from public.unresolved_manual_catalog_links as unresolved
  join public.jobs as manual_job
    on manual_job.id = unresolved.manual_job_id
   and manual_job.user_id = unresolved.user_id
  where unresolved.provider_code = target_provider_code
    and unresolved.external_id = target_external_id
    and unresolved.original_url = target_original_url
  on conflict (user_id, manual_job_id) do update
    set source_posting_id = excluded.source_posting_id,
        canonical_job_id = excluded.canonical_job_id,
        provider_code = excluded.provider_code,
        external_id = excluded.external_id,
        original_url = excluded.original_url,
        updated_at = clock_timestamp();

  get diagnostics reconciled_count = row_count;

  delete from public.unresolved_manual_catalog_links as unresolved
  where unresolved.provider_code = target_provider_code
    and unresolved.external_id = target_external_id
    and unresolved.original_url = target_original_url
    and exists (
      select 1
      from public.manual_catalog_links as link
      where link.user_id = unresolved.user_id
        and link.manual_job_id = unresolved.manual_job_id
        and link.source_posting_id = resolved_posting.id
    );

  return reconciled_count;
end;
$$;

create function public.reconcile_unresolved_manual_catalog_links_from_posting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.reconcile_unresolved_manual_catalog_links_for_source(
    new.provider_code, new.external_id, new.original_url
  );
  return new;
end;
$$;

create trigger source_postings_reconcile_unresolved_manual_catalog_links
  after insert or update of provider_code, external_id, original_url, source_status, canonical_job_id
  on public.source_postings
  for each row execute function public.reconcile_unresolved_manual_catalog_links_from_posting();

create function public.reconcile_unresolved_manual_catalog_links_from_canonical()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  posting record;
begin
  if new.lifecycle_status = 'active' then
    for posting in
      select provider_code, external_id, original_url
      from public.source_postings
      where canonical_job_id = new.id
        and source_status = 'active'
    loop
      perform public.reconcile_unresolved_manual_catalog_links_for_source(
        posting.provider_code, posting.external_id, posting.original_url
      );
    end loop;
  end if;
  return new;
end;
$$;

create trigger canonical_jobs_reconcile_unresolved_manual_catalog_links
  after insert or update of lifecycle_status on public.canonical_jobs
  for each row execute function public.reconcile_unresolved_manual_catalog_links_from_canonical();

-- Replacing this private helper keeps the old public v2 RPC contract while
-- giving a missing/inactive identity a durable owner-only destination.
alter function public.commit_backup_restore(jsonb, uuid)
  rename to commit_backup_restore_without_unresolved_manual_links;

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
  source_is_active boolean;
  restore_result jsonb;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  restore_result := public.commit_backup_restore_without_unresolved_manual_links(
    target_payload, target_device
  );

  if coalesce(target_payload->>'schemaVersion', '') = '1' then
    return restore_result;
  end if;

  for item in select value from jsonb_array_elements(target_payload->'manualLinks')
  loop
    source_ref := item->'sourceRef';
    select exists (
      select 1
      from public.source_postings as posting
      join public.canonical_jobs as canonical on canonical.id = posting.canonical_job_id
      where posting.provider_code = source_ref->>'provider'
        and posting.external_id = source_ref->>'externalId'
        and posting.original_url = source_ref->>'originalUrl'
        and posting.source_status = 'active'
        and canonical.lifecycle_status = 'active'
    ) into source_is_active;

    if source_is_active then
      delete from public.unresolved_manual_catalog_links
      where user_id = caller_id
        and manual_job_id = (item->>'legacyJobId')::uuid;
    else
      -- A restore represents the backed-up user choice. Remove an older local
      -- resolved link first so export has exactly one portable identity.
      delete from public.manual_catalog_links
      where user_id = caller_id
        and manual_job_id = (item->>'legacyJobId')::uuid;

      insert into public.unresolved_manual_catalog_links(
        user_id, manual_job_id, provider_code, external_id, original_url
      ) values (
        caller_id,
        (item->>'legacyJobId')::uuid,
        source_ref->>'provider',
        source_ref->>'externalId',
        source_ref->>'originalUrl'
      ) on conflict (user_id, manual_job_id) do update
        set provider_code = excluded.provider_code,
            external_id = excluded.external_id,
            original_url = excluded.original_url,
            updated_at = clock_timestamp();
    end if;
  end loop;

  return restore_result;
end;
$$;

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

  if (select count(*) from public.manual_catalog_links where user_id = caller_id)
        + (select count(*) from public.unresolved_manual_catalog_links where user_id = caller_id) > 20000
     or (select count(*) from public.personal_job_states where user_id = caller_id)
        + (select count(*) from public.unresolved_source_overlays where user_id = caller_id) > 20000
     or (select count(*) from public.catalog_duplicate_decisions where user_id = caller_id and decision is not null)
        + (select count(*) from public.unresolved_duplicate_overlays where user_id = caller_id) > 20000 then
    raise exception 'backup v2 overlay limit exceeded' using errcode = '22023';
  end if;

  with link_rows as (
    select
      link.manual_job_id,
      link.provider_code,
      link.external_id,
      link.original_url,
      link.updated_at,
      true as is_resolved
    from public.manual_catalog_links as link
    where link.user_id = caller_id

    union all

    select
      unresolved.manual_job_id,
      unresolved.provider_code,
      unresolved.external_id,
      unresolved.original_url,
      unresolved.updated_at,
      false as is_resolved
    from public.unresolved_manual_catalog_links as unresolved
    where unresolved.user_id = caller_id
  ), selected_links as (
    select distinct on (manual_job_id)
      manual_job_id, provider_code, external_id, original_url
    from link_rows
    order by manual_job_id, updated_at desc, is_resolved desc
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'legacyJobId', manual_job_id,
        'sourceRef', jsonb_build_object(
          'provider', provider_code,
          'externalId', external_id,
          'originalUrl', original_url
        )
      )
      order by manual_job_id
    ),
    '[]'::jsonb
  ) into manual_links
  from selected_links;

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

create or replace function public.link_manual_job_to_catalog(
  target_manual_job_id uuid,
  target_provider_code text,
  target_external_id text,
  target_original_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  posting public.source_postings%rowtype;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if target_provider_code !~ '^[a-z][a-z0-9_-]{1,39}$'
     or char_length(btrim(coalesce(target_external_id, ''))) not between 1 and 200
     or char_length(coalesce(target_original_url, '')) > 2048
     or target_original_url !~ '^https://[^[:space:]]+$'
     or target_original_url ~ '^https://[^/@[:space:]]+@' then
    raise exception 'invalid catalog source identity' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.jobs
    where id = target_manual_job_id and user_id = caller_id
  ) then
    raise exception 'manual job unavailable' using errcode = '22023';
  end if;

  select * into posting
  from public.source_postings
  where provider_code = target_provider_code
    and external_id = target_external_id
    and original_url = target_original_url;
  if posting.id is null then
    raise exception 'catalog source identity unavailable' using errcode = '22023';
  end if;

  insert into public.manual_catalog_links(
    user_id, manual_job_id, source_posting_id, canonical_job_id,
    provider_code, external_id, original_url
  ) values (
    caller_id, target_manual_job_id, posting.id, posting.canonical_job_id,
    posting.provider_code, posting.external_id, posting.original_url
  ) on conflict (user_id, manual_job_id) do update
    set source_posting_id = excluded.source_posting_id,
        canonical_job_id = excluded.canonical_job_id,
        provider_code = excluded.provider_code,
        external_id = excluded.external_id,
        original_url = excluded.original_url,
        updated_at = clock_timestamp();

  delete from public.unresolved_manual_catalog_links
  where user_id = caller_id and manual_job_id = target_manual_job_id;

  return jsonb_build_object(
    'manualJobId', target_manual_job_id,
    'canonicalJobId', posting.canonical_job_id,
    'providerCode', posting.provider_code,
    'externalId', posting.external_id,
    'originalUrl', posting.original_url
  );
end;
$$;

create or replace function public.unlink_manual_catalog_link(target_manual_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  removed boolean := false;
  unresolved_removed boolean := false;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.jobs
    where id = target_manual_job_id and user_id = caller_id
  ) then
    raise exception 'manual job unavailable' using errcode = '22023';
  end if;

  delete from public.manual_catalog_links
  where user_id = caller_id and manual_job_id = target_manual_job_id
  returning true into removed;
  delete from public.unresolved_manual_catalog_links
  where user_id = caller_id and manual_job_id = target_manual_job_id
  returning true into unresolved_removed;

  return jsonb_build_object(
    'manualJobId', target_manual_job_id,
    'unlinked', coalesce(removed, false) or coalesce(unresolved_removed, false)
  );
end;
$$;

revoke all on function public.reconcile_unresolved_manual_catalog_links_for_source(text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_unresolved_manual_catalog_links_from_posting()
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_unresolved_manual_catalog_links_from_canonical()
  from public, anon, authenticated, service_role;
revoke all on function public.commit_backup_restore_without_unresolved_manual_links(jsonb, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.commit_backup_restore(jsonb, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.commit_backup_restore(jsonb, uuid) to authenticated;

commit;
