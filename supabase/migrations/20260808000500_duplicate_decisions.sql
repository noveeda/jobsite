begin;

create table public.catalog_duplicate_candidates (
  id uuid primary key default gen_random_uuid(),
  left_canonical_job_id uuid not null references public.canonical_jobs(id) on delete restrict,
  right_canonical_job_id uuid not null references public.canonical_jobs(id) on delete restrict,
  left_source_posting_id uuid not null references public.source_postings(id) on delete restrict,
  right_source_posting_id uuid not null references public.source_postings(id) on delete restrict,
  left_generation_id uuid not null references public.collection_runs(id) on delete restrict,
  right_generation_id uuid not null references public.collection_runs(id) on delete restrict,
  score numeric(5,4) not null,
  reasons jsonb not null,
  evidence_revision integer not null default 1,
  status text not null default 'active',
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint catalog_duplicate_candidates_pair_order_check check (left_canonical_job_id < right_canonical_job_id),
  constraint catalog_duplicate_candidates_distinct_jobs_check check (left_canonical_job_id <> right_canonical_job_id),
  constraint catalog_duplicate_candidates_pair_key unique (left_canonical_job_id, right_canonical_job_id),
  constraint catalog_duplicate_candidates_score_check check (score >= 0 and score <= 1),
  constraint catalog_duplicate_candidates_reasons_check check (
    case when jsonb_typeof(reasons) = 'array'
      then jsonb_array_length(reasons) between 1 and 20
      else false
    end
  ),
  constraint catalog_duplicate_candidates_evidence_revision_check check (evidence_revision > 0),
  constraint catalog_duplicate_candidates_status_check check (status in ('active', 'superseded'))
);

create index catalog_duplicate_candidates_active_idx
  on public.catalog_duplicate_candidates(status, left_canonical_job_id, right_canonical_job_id)
  where status = 'active';

create table public.catalog_duplicate_graph_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);

create table public.catalog_duplicate_decisions (
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references public.catalog_duplicate_candidates(id) on delete restrict,
  decision text,
  effective_revision integer not null default 0,
  portable_endpoints jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, candidate_id),
  constraint catalog_duplicate_decisions_decision_check check (decision is null or decision in ('merged', 'separate')),
  constraint catalog_duplicate_decisions_revision_check check (effective_revision >= 0),
  constraint catalog_duplicate_decisions_endpoints_check check (jsonb_typeof(portable_endpoints) = 'object')
);

create table public.catalog_duplicate_decision_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references public.catalog_duplicate_candidates(id) on delete restrict,
  operation_id uuid not null,
  action text not null,
  payload_fingerprint text not null,
  expected_revision integer not null,
  effective_revision integer not null,
  before_decision text,
  after_decision text,
  portable_endpoints jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint catalog_duplicate_decision_events_operation_key unique (user_id, operation_id),
  constraint catalog_duplicate_decision_events_action_check check (action in ('merge', 'separate', 'undo')),
  constraint catalog_duplicate_decision_events_expected_revision_check check (expected_revision >= 0),
  constraint catalog_duplicate_decision_events_effective_revision_check check (effective_revision > 0),
  constraint catalog_duplicate_decision_events_before_check check (before_decision is null or before_decision in ('merged', 'separate')),
  constraint catalog_duplicate_decision_events_after_check check (after_decision is null or after_decision in ('merged', 'separate')),
  constraint catalog_duplicate_decision_events_endpoints_check check (jsonb_typeof(portable_endpoints) = 'object'),
  constraint catalog_duplicate_decision_events_result_check check (jsonb_typeof(result) = 'object')
);

create index catalog_duplicate_decision_events_owner_idx
  on public.catalog_duplicate_decision_events(user_id, created_at desc, id desc);

create table public.catalog_duplicate_issue_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references public.catalog_duplicate_candidates(id) on delete restrict,
  operation_id uuid not null,
  category text not null,
  message text not null,
  payload_fingerprint text not null,
  portable_endpoints jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint catalog_duplicate_issue_reports_operation_key unique (user_id, operation_id),
  constraint catalog_duplicate_issue_reports_category_check check (category in ('incorrect_value', 'duplicate', 'broken_link', 'attribution', 'other')),
  constraint catalog_duplicate_issue_reports_message_check check (length(btrim(message)) between 1 and 2000),
  constraint catalog_duplicate_issue_reports_endpoints_check check (jsonb_typeof(portable_endpoints) = 'object')
);

create or replace function public.catalog_duplicate_validate_candidate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  left_posting public.source_postings%rowtype;
  right_posting public.source_postings%rowtype;
  left_run public.collection_runs%rowtype;
  right_run public.collection_runs%rowtype;
  reason jsonb;
begin
  -- Let the named ordered-pair constraints report identity errors before
  -- inspecting evidence that cannot be meaningful for an invalid pair.
  if new.left_canonical_job_id >= new.right_canonical_job_id then
    return new;
  end if;

  -- Complete reconciliation may retire facts whose prior generations are no
  -- longer current. Retiring that unchanged evidence must stay possible so it
  -- can retain private decision history without pretending it is current.
  if tg_op = 'UPDATE'
     and old.status = 'active'
     and new.status = 'superseded'
     and new.left_source_posting_id is not distinct from old.left_source_posting_id
     and new.right_source_posting_id is not distinct from old.right_source_posting_id
     and new.left_generation_id is not distinct from old.left_generation_id
     and new.right_generation_id is not distinct from old.right_generation_id
     and new.score is not distinct from old.score
     and new.reasons is not distinct from old.reasons then
    return new;
  end if;

  select * into left_posting from public.source_postings where id = new.left_source_posting_id;
  select * into right_posting from public.source_postings where id = new.right_source_posting_id;
  select * into left_run from public.collection_runs where id = new.left_generation_id;
  select * into right_run from public.collection_runs where id = new.right_generation_id;

  if left_posting.id is null or right_posting.id is null
     or left_posting.canonical_job_id <> new.left_canonical_job_id
     or right_posting.canonical_job_id <> new.right_canonical_job_id
     or left_posting.provider_code = right_posting.provider_code
     or left_posting.source_status not in ('active', 'missing_once')
     or right_posting.source_status not in ('active', 'missing_once')
     or left_posting.last_collection_run_id is distinct from new.left_generation_id
     or right_posting.last_collection_run_id is distinct from new.right_generation_id
     or left_run.id is null or right_run.id is null
     or left_run.provider_code <> left_posting.provider_code
     or right_run.provider_code <> right_posting.provider_code
     or left_run.run_kind <> 'reconciliation' or right_run.run_kind <> 'reconciliation'
     or left_run.status <> 'succeeded' or right_run.status <> 'succeeded'
     or not left_run.snapshot_complete or not right_run.snapshot_complete then
    raise exception 'invalid duplicate candidate evidence' using errcode = '23514';
  end if;

  if jsonb_typeof(new.reasons) <> 'array' then
    raise exception 'invalid duplicate candidate reasons' using errcode = '23514';
  end if;

  for reason in select value from jsonb_array_elements(
    case when jsonb_typeof(new.reasons) = 'array' then new.reasons else '[]'::jsonb end
  )
  loop
    if jsonb_typeof(reason) <> 'string' or reason #>> '{}' !~ '^[a-z][a-z0-9_]{1,39}$' then
      raise exception 'invalid duplicate candidate reason' using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

create trigger catalog_duplicate_candidates_validate
  before insert or update of left_canonical_job_id, right_canonical_job_id,
    left_source_posting_id, right_source_posting_id, left_generation_id,
    right_generation_id, score, reasons, evidence_revision, status
  on public.catalog_duplicate_candidates
  for each row execute function public.catalog_duplicate_validate_candidate();

create function public.catalog_duplicate_prevent_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'catalog duplicate candidates are immutable shared evidence' using errcode = '55000';
end;
$$;

create trigger catalog_duplicate_candidates_no_delete
  before delete on public.catalog_duplicate_candidates
  for each row execute function public.catalog_duplicate_prevent_delete();

create function public.catalog_duplicate_has_current_consent(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from (
      select consent.terms_version, consent.privacy_version
      from public.account_consents as consent
      where consent.user_id = target_user_id
      order by consent.accepted_at desc, consent.id desc
      limit 1
    ) as latest_consent
    where latest_consent.terms_version = '2026-08-07'
      and latest_consent.privacy_version = '2026-08-07'
  );
$$;

create function public.catalog_duplicate_is_currently_eligible(target_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_duplicate_candidates as candidate
    join public.canonical_jobs as left_job on left_job.id = candidate.left_canonical_job_id
    join public.canonical_jobs as right_job on right_job.id = candidate.right_canonical_job_id
    join public.source_postings as left_posting on left_posting.id = candidate.left_source_posting_id
    join public.source_postings as right_posting on right_posting.id = candidate.right_source_posting_id
    join public.source_providers as left_provider on left_provider.code = left_posting.provider_code
    join public.source_providers as right_provider on right_provider.code = right_posting.provider_code
    join public.collection_runs as left_run on left_run.id = candidate.left_generation_id
    join public.collection_runs as right_run on right_run.id = candidate.right_generation_id
    where candidate.id = target_candidate_id
      and candidate.status = 'active'
      and left_job.lifecycle_status in ('active', 'stale')
      and right_job.lifecycle_status in ('active', 'stale')
      and left_posting.canonical_job_id = left_job.id
      and right_posting.canonical_job_id = right_job.id
      and left_posting.provider_code <> right_posting.provider_code
      and left_posting.source_status in ('active', 'missing_once')
      and right_posting.source_status in ('active', 'missing_once')
      and left_provider.enabled and right_provider.enabled
      and left_posting.last_collection_run_id = left_run.id
      and right_posting.last_collection_run_id = right_run.id
      and left_run.provider_code = left_posting.provider_code
      and right_run.provider_code = right_posting.provider_code
      and left_run.run_kind = 'reconciliation' and right_run.run_kind = 'reconciliation'
      and left_run.status = 'succeeded' and right_run.status = 'succeeded'
      and left_run.snapshot_complete and right_run.snapshot_complete
  );
$$;

create function public.catalog_duplicate_portable_endpoints(target_candidate_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'left', jsonb_build_object('providerCode', left_posting.provider_code, 'externalId', left_posting.external_id),
    'right', jsonb_build_object('providerCode', right_posting.provider_code, 'externalId', right_posting.external_id)
  )
  from public.catalog_duplicate_candidates as candidate
  join public.source_postings as left_posting on left_posting.id = candidate.left_source_posting_id
  join public.source_postings as right_posting on right_posting.id = candidate.right_source_posting_id
  where candidate.id = target_candidate_id;
$$;

create function public.catalog_duplicate_component(
  target_user_id uuid,
  target_start_id uuid,
  target_excluded_candidate_id uuid
)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with recursive graph(left_id, right_id) as (
    select candidate.left_canonical_job_id, candidate.right_canonical_job_id
    from public.catalog_duplicate_decisions as decision
    join public.catalog_duplicate_candidates as candidate on candidate.id = decision.candidate_id
    where decision.user_id = target_user_id
      and decision.decision = 'merged'
      and decision.candidate_id <> target_excluded_candidate_id
  ), walk(node, path) as (
    select target_start_id, array[target_start_id]::uuid[]
    union all
    select case when graph.left_id = walk.node then graph.right_id else graph.left_id end,
      walk.path || case when graph.left_id = walk.node then graph.right_id else graph.left_id end
    from walk
    join graph on graph.left_id = walk.node or graph.right_id = walk.node
    where not (case when graph.left_id = walk.node then graph.right_id else graph.left_id end = any(walk.path))
      and cardinality(walk.path) < 26
  )
  select coalesce(array_agg(distinct node), array[target_start_id]::uuid[]) from walk;
$$;

alter table public.catalog_duplicate_candidates enable row level security;
alter table public.catalog_duplicate_candidates force row level security;
alter table public.catalog_duplicate_graph_locks enable row level security;
alter table public.catalog_duplicate_graph_locks force row level security;
alter table public.catalog_duplicate_decisions enable row level security;
alter table public.catalog_duplicate_decisions force row level security;
alter table public.catalog_duplicate_decision_events enable row level security;
alter table public.catalog_duplicate_decision_events force row level security;
alter table public.catalog_duplicate_issue_reports enable row level security;
alter table public.catalog_duplicate_issue_reports force row level security;

create policy catalog_duplicate_decisions_owner_select
  on public.catalog_duplicate_decisions for select to authenticated
  using (auth.uid() = user_id);
create policy catalog_duplicate_decision_events_owner_select
  on public.catalog_duplicate_decision_events for select to authenticated
  using (auth.uid() = user_id);
create policy catalog_duplicate_issue_reports_owner_select
  on public.catalog_duplicate_issue_reports for select to authenticated
  using (auth.uid() = user_id);

revoke all on table public.catalog_duplicate_candidates from public, anon, authenticated;
revoke all on table public.catalog_duplicate_graph_locks from public, anon, authenticated;
revoke all on table public.catalog_duplicate_decisions from public, anon, authenticated;
revoke all on table public.catalog_duplicate_decision_events from public, anon, authenticated;
revoke all on table public.catalog_duplicate_issue_reports from public, anon, authenticated;
grant select on table public.catalog_duplicate_decisions to authenticated;
grant select on table public.catalog_duplicate_decision_events to authenticated;
grant select on table public.catalog_duplicate_issue_reports to authenticated;
grant select, insert, update on table public.catalog_duplicate_candidates to service_role;

create function public.set_catalog_duplicate_decision(
  target_candidate_id uuid,
  target_action text,
  target_operation_id uuid,
  target_expected_revision integer,
  target_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  candidate public.catalog_duplicate_candidates%rowtype;
  existing_event public.catalog_duplicate_decision_events%rowtype;
  current_decision public.catalog_duplicate_decisions%rowtype;
  before_state text;
  after_state text;
  payload_fingerprint text;
  endpoints jsonb;
  left_nodes uuid[];
  right_nodes uuid[];
  prospective_nodes uuid[];
  blocking_edges jsonb;
  quota_allowed boolean;
  next_revision integer;
  result jsonb;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if target_action not in ('merge', 'separate', 'undo')
     or target_expected_revision < 0
     or jsonb_typeof(target_payload) <> 'object'
     or octet_length(target_payload::text) > 4096 then
    raise exception 'invalid duplicate decision input' using errcode = '22023';
  end if;

  payload_fingerprint := encode(extensions.digest(
    convert_to(target_candidate_id::text || ':' || target_action || ':' || target_expected_revision::text || ':' || target_payload::text, 'utf8'),
    'sha256'
  ), 'hex');

  select * into existing_event
  from public.catalog_duplicate_decision_events
  where user_id = caller_id and operation_id = target_operation_id;
  if found then
    if existing_event.candidate_id <> target_candidate_id
       or existing_event.action <> target_action
       or existing_event.expected_revision <> target_expected_revision
       or existing_event.payload_fingerprint <> payload_fingerprint then
      raise exception 'operation id was reused with a different immutable payload' using errcode = '22023';
    end if;
    return existing_event.result || jsonb_build_object('replayed', true);
  end if;

  if not public.catalog_duplicate_has_current_consent(caller_id) then
    raise exception 'current consent required' using errcode = '42501';
  end if;

  insert into public.catalog_duplicate_graph_locks(user_id) values (caller_id)
  on conflict (user_id) do nothing;
  perform 1 from public.catalog_duplicate_graph_locks where user_id = caller_id for update;

  select * into candidate from public.catalog_duplicate_candidates
  where id = target_candidate_id for update;
  if candidate.id is null or not public.catalog_duplicate_is_currently_eligible(target_candidate_id) then
    raise exception 'duplicate candidate unavailable' using errcode = '22023';
  end if;

  select * into current_decision
  from public.catalog_duplicate_decisions
  where user_id = caller_id and candidate_id = target_candidate_id
  for update;
  before_state := current_decision.decision;
  if coalesce(current_decision.effective_revision, 0) <> target_expected_revision then
    raise exception 'duplicate decision revision is stale' using errcode = '40001';
  end if;

  endpoints := public.catalog_duplicate_portable_endpoints(target_candidate_id);
  left_nodes := public.catalog_duplicate_component(caller_id, candidate.left_canonical_job_id, target_candidate_id);
  right_nodes := public.catalog_duplicate_component(caller_id, candidate.right_canonical_job_id, target_candidate_id);
  select coalesce(array_agg(distinct node), '{}'::uuid[]) into prospective_nodes
  from unnest(left_nodes || right_nodes) as node;

  if cardinality(left_nodes) > 25 or cardinality(right_nodes) > 25
     or (target_action = 'merge' and cardinality(prospective_nodes) > 25) then
    return jsonb_build_object('ok', false, 'code', 'COMPONENT_LIMIT', 'blockingEdges', '[]'::jsonb, 'replayed', false);
  end if;

  if target_action = 'merge' and before_state = 'separate' then
    return jsonb_build_object('ok', false, 'code', 'SEPARATE_CONFLICT', 'blockingEdges', jsonb_build_array(target_candidate_id), 'replayed', false);
  end if;

  if target_action = 'merge' then
    select coalesce(jsonb_agg(decision.candidate_id order by decision.candidate_id), '[]'::jsonb)
    into blocking_edges
    from public.catalog_duplicate_decisions as decision
    join public.catalog_duplicate_candidates as other_candidate on other_candidate.id = decision.candidate_id
    where decision.user_id = caller_id
      and decision.decision = 'separate'
      and (
        (other_candidate.left_canonical_job_id = any(left_nodes) and other_candidate.right_canonical_job_id = any(right_nodes))
        or (other_candidate.right_canonical_job_id = any(left_nodes) and other_candidate.left_canonical_job_id = any(right_nodes))
      );
    if blocking_edges <> '[]'::jsonb then
      return jsonb_build_object('ok', false, 'code', 'SEPARATE_CONFLICT', 'blockingEdges', blocking_edges, 'replayed', false);
    end if;
  elsif target_action = 'separate' then
    if candidate.right_canonical_job_id = any(left_nodes) then
      select coalesce(jsonb_agg(edge.candidate_id order by edge.candidate_id), '[]'::jsonb)
      into blocking_edges
      from public.catalog_duplicate_decisions as edge
      join public.catalog_duplicate_candidates as edge_candidate on edge_candidate.id = edge.candidate_id
      where edge.user_id = caller_id
        and edge.decision = 'merged'
        and edge.candidate_id <> target_candidate_id
        and (
          (edge_candidate.left_canonical_job_id = any(left_nodes) and edge_candidate.right_canonical_job_id = any(left_nodes))
        );
      return jsonb_build_object('ok', false, 'code', 'INDIRECT_MERGE_CONFLICT', 'blockingEdges', blocking_edges, 'replayed', false);
    end if;
  end if;

  select allowed into quota_allowed from public.consume_rate_limit('mutation_write'::public.rate_limit_action);
  if not quota_allowed then
    raise exception 'duplicate decision rate limit exceeded' using errcode = '54000';
  end if;

  after_state := case target_action when 'merge' then 'merged' when 'separate' then 'separate' else null end;
  next_revision := coalesce(current_decision.effective_revision, 0) + 1;
  insert into public.catalog_duplicate_decisions as decision(
    user_id, candidate_id, decision, effective_revision, portable_endpoints
  ) values (
    caller_id, target_candidate_id, after_state, next_revision, endpoints
  ) on conflict (user_id, candidate_id) do update
    set decision = excluded.decision,
        effective_revision = excluded.effective_revision,
        portable_endpoints = excluded.portable_endpoints,
        updated_at = clock_timestamp();

  result := jsonb_build_object(
    'ok', true,
    'status', coalesce(after_state, 'undone'),
    'revision', next_revision,
    'candidateId', target_candidate_id,
    'representativeId', (select min(node::text) from unnest(prospective_nodes) as node),
    'replayed', false
  );
  insert into public.catalog_duplicate_decision_events(
    user_id, candidate_id, operation_id, action, payload_fingerprint,
    expected_revision, effective_revision, before_decision, after_decision,
    portable_endpoints, result
  ) values (
    caller_id, target_candidate_id, target_operation_id, target_action, payload_fingerprint,
    target_expected_revision, next_revision, before_state, after_state, endpoints, result
  );
  return result;
end;
$$;

create function public.submit_catalog_duplicate_issue_report(
  target_candidate_id uuid,
  target_category text,
  target_message text,
  target_operation_id uuid,
  target_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  existing_report public.catalog_duplicate_issue_reports%rowtype;
  payload_fingerprint text;
  endpoints jsonb;
  quota_allowed boolean;
  report_id uuid;
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if target_category not in ('incorrect_value', 'duplicate', 'broken_link', 'attribution', 'other')
     or length(btrim(coalesce(target_message, ''))) not between 1 and 2000
     or jsonb_typeof(target_payload) <> 'object'
     or octet_length(target_payload::text) > 4096 then
    raise exception 'invalid duplicate issue report input' using errcode = '22023';
  end if;
  payload_fingerprint := encode(extensions.digest(
    convert_to(target_candidate_id::text || ':' || target_category || ':' || btrim(target_message) || ':' || target_payload::text, 'utf8'),
    'sha256'
  ), 'hex');
  select * into existing_report from public.catalog_duplicate_issue_reports
  where user_id = caller_id and operation_id = target_operation_id;
  if found then
    if existing_report.candidate_id <> target_candidate_id
       or existing_report.payload_fingerprint <> payload_fingerprint then
      raise exception 'operation id was reused with a different immutable payload' using errcode = '22023';
    end if;
    return jsonb_build_object('ok', true, 'reportId', existing_report.id, 'replayed', true);
  end if;
  if not public.catalog_duplicate_has_current_consent(caller_id)
     or not public.catalog_duplicate_is_currently_eligible(target_candidate_id) then
    raise exception 'duplicate candidate unavailable' using errcode = '22023';
  end if;
  select allowed into quota_allowed from public.consume_rate_limit('mutation_write'::public.rate_limit_action);
  if not quota_allowed then
    raise exception 'duplicate issue report rate limit exceeded' using errcode = '54000';
  end if;
  endpoints := public.catalog_duplicate_portable_endpoints(target_candidate_id);
  insert into public.catalog_duplicate_issue_reports(
    user_id, candidate_id, operation_id, category, message, payload_fingerprint, portable_endpoints
  ) values (
    caller_id, target_candidate_id, target_operation_id, target_category, btrim(target_message), payload_fingerprint, endpoints
  ) returning id into report_id;
  return jsonb_build_object('ok', true, 'reportId', report_id, 'replayed', false);
end;
$$;

revoke all on function public.catalog_duplicate_validate_candidate() from public, anon, authenticated;
revoke all on function public.catalog_duplicate_prevent_delete() from public, anon, authenticated;
revoke all on function public.catalog_duplicate_has_current_consent(uuid) from public, anon, authenticated;
revoke all on function public.catalog_duplicate_is_currently_eligible(uuid) from public, anon, authenticated;
revoke all on function public.catalog_duplicate_portable_endpoints(uuid) from public, anon, authenticated;
revoke all on function public.catalog_duplicate_component(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_catalog_duplicate_decision(uuid, text, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.submit_catalog_duplicate_issue_report(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_catalog_duplicate_decision(uuid, text, uuid, integer, jsonb) to authenticated;
grant execute on function public.submit_catalog_duplicate_issue_report(uuid, text, text, uuid, jsonb) to authenticated;

-- A source link is presentational evidence, not a provider-controlled redirect.
-- Keep this guard in SQL so every caller of the companion detail RPC gets the
-- same credential-free, provider-host-bound guarantee.
create function public.catalog_duplicate_safe_source_url(target_url text, target_terms_url text)
returns text
language plpgsql
immutable
security definer
set search_path = ''
as $$
declare
  source_authority text;
  provider_authority text;
begin
  if target_url is null or target_terms_url is null
     or target_url !~ '^https://[^[:space:]@/?#]+(?::[0-9]{1,5})?(?:[/?#]|$)'
     or target_terms_url !~ '^https://[^[:space:]@/?#]+(?::[0-9]{1,5})?(?:[/?#]|$)'
     or target_url ~ '^https://[^/?#]*@'
     or target_terms_url ~ '^https://[^/?#]*@' then
    return null;
  end if;
  source_authority := lower(substring(target_url from '^https://([^/?#]+)'));
  provider_authority := lower(substring(target_terms_url from '^https://([^/?#]+)'));
  if source_authority is null or provider_authority is null or source_authority <> provider_authority then
    return null;
  end if;
  return target_url;
end;
$$;

create or replace function public.catalog_duplicate_is_currently_eligible(target_candidate_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.catalog_duplicate_candidates as candidate
    join public.canonical_jobs as left_job on left_job.id = candidate.left_canonical_job_id
    join public.canonical_jobs as right_job on right_job.id = candidate.right_canonical_job_id
    join public.source_postings as left_posting on left_posting.id = candidate.left_source_posting_id
    join public.source_postings as right_posting on right_posting.id = candidate.right_source_posting_id
    join public.source_providers as left_provider on left_provider.code = left_posting.provider_code
    join public.source_providers as right_provider on right_provider.code = right_posting.provider_code
    join public.collection_runs as left_run on left_run.id = candidate.left_generation_id
    join public.collection_runs as right_run on right_run.id = candidate.right_generation_id
    where candidate.id = target_candidate_id
      and candidate.status = 'active'
      and left_job.lifecycle_status in ('active', 'stale')
      and right_job.lifecycle_status in ('active', 'stale')
      and left_posting.canonical_job_id = left_job.id
      and right_posting.canonical_job_id = right_job.id
      and left_posting.provider_code <> right_posting.provider_code
      and left_posting.source_status in ('active', 'missing_once')
      and right_posting.source_status in ('active', 'missing_once')
      and left_provider.enabled and right_provider.enabled
      and public.catalog_duplicate_safe_source_url(left_posting.original_url, left_provider.terms_url) is not null
      and public.catalog_duplicate_safe_source_url(right_posting.original_url, right_provider.terms_url) is not null
      and left_posting.last_collection_run_id = left_run.id
      and right_posting.last_collection_run_id = right_run.id
      and left_run.provider_code = left_posting.provider_code
      and right_run.provider_code = right_posting.provider_code
      and left_run.run_kind = 'reconciliation' and right_run.run_kind = 'reconciliation'
      and left_run.status = 'succeeded' and right_run.status = 'succeeded'
      and left_run.snapshot_complete and right_run.snapshot_complete
  );
$$;

create function public.refresh_catalog_duplicate_candidates_for_reconciliation(
  target_provider_code text,
  target_run_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_run public.collection_runs%rowtype;
  candidate_record record;
begin
  select * into current_run
  from public.collection_runs
  where id = target_run_id and provider_code = target_provider_code
  for update;
  if current_run.id is null
     or current_run.run_kind <> 'reconciliation'
     or current_run.status <> 'succeeded'
     or not current_run.snapshot_complete then
    raise exception 'complete reconciliation required for duplicate refresh' using errcode = '55000';
  end if;

  -- Only a complete reconciliation can supersede evidence. Decisions and their
  -- append-only events remain untouched because candidates are never deleted.
  update public.catalog_duplicate_candidates as candidate
  set status = 'superseded', updated_at = clock_timestamp()
  where candidate.status = 'active'
    and exists (
      select 1
      from public.source_postings as left_posting
      join public.source_postings as right_posting on right_posting.id = candidate.right_source_posting_id
      where left_posting.id = candidate.left_source_posting_id
        and (left_posting.provider_code = target_provider_code or right_posting.provider_code = target_provider_code)
    )
    and not public.catalog_duplicate_is_currently_eligible(candidate.id);

  for candidate_record in
    with eligible_pairs as (
      select
        left_job.id as left_job_id,
        right_job.id as right_job_id,
        left_posting.id as left_posting_id,
        right_posting.id as right_posting_id,
        left_posting.last_collection_run_id as left_generation_id,
        right_posting.last_collection_run_id as right_generation_id,
        case when regexp_replace(lower(left_job.company_name), '[^[:alnum:]]+', '', 'g')
                    = regexp_replace(lower(right_job.company_name), '[^[:alnum:]]+', '', 'g') then 0.5 else 0 end
          + case when regexp_replace(lower(left_job.title), '[^[:alnum:]]+', '', 'g')
                    = regexp_replace(lower(right_job.title), '[^[:alnum:]]+', '', 'g') then 0.5 else 0 end as score,
        case
          when regexp_replace(lower(left_job.company_name), '[^[:alnum:]]+', '', 'g')
                    = regexp_replace(lower(right_job.company_name), '[^[:alnum:]]+', '', 'g')
           and regexp_replace(lower(left_job.title), '[^[:alnum:]]+', '', 'g')
                    = regexp_replace(lower(right_job.title), '[^[:alnum:]]+', '', 'g')
          then jsonb_build_array('company_match', 'title_match')
          else '[]'::jsonb
        end as reasons,
        row_number() over (partition by left_job.id, right_job.id order by left_posting.id, right_posting.id) as source_rank
      from public.source_postings as left_posting
      join public.canonical_jobs as left_job on left_job.id = left_posting.canonical_job_id
      join public.source_providers as left_provider on left_provider.code = left_posting.provider_code
      join public.collection_runs as left_run on left_run.id = left_posting.last_collection_run_id
      join public.source_postings as right_posting
        on left_posting.canonical_job_id < right_posting.canonical_job_id
       and left_posting.provider_code <> right_posting.provider_code
      join public.canonical_jobs as right_job on right_job.id = right_posting.canonical_job_id
      join public.source_providers as right_provider on right_provider.code = right_posting.provider_code
      join public.collection_runs as right_run on right_run.id = right_posting.last_collection_run_id
      where (left_posting.provider_code = target_provider_code or right_posting.provider_code = target_provider_code)
        and left_posting.source_status in ('active', 'missing_once')
        and right_posting.source_status in ('active', 'missing_once')
        and left_job.lifecycle_status in ('active', 'stale')
        and right_job.lifecycle_status in ('active', 'stale')
        and left_provider.enabled and right_provider.enabled
        and public.catalog_duplicate_safe_source_url(left_posting.original_url, left_provider.terms_url) is not null
        and public.catalog_duplicate_safe_source_url(right_posting.original_url, right_provider.terms_url) is not null
        and left_run.run_kind = 'reconciliation' and right_run.run_kind = 'reconciliation'
        and left_run.status = 'succeeded' and right_run.status = 'succeeded'
        and left_run.snapshot_complete and right_run.snapshot_complete
    )
    select * from eligible_pairs
    where source_rank = 1 and score >= 0.7
  loop
    insert into public.catalog_duplicate_candidates as candidate (
      left_canonical_job_id, right_canonical_job_id,
      left_source_posting_id, right_source_posting_id,
      left_generation_id, right_generation_id, score, reasons
    ) values (
      candidate_record.left_job_id, candidate_record.right_job_id,
      candidate_record.left_posting_id, candidate_record.right_posting_id,
      candidate_record.left_generation_id, candidate_record.right_generation_id,
      candidate_record.score, candidate_record.reasons
    ) on conflict (left_canonical_job_id, right_canonical_job_id) do update
      set left_source_posting_id = excluded.left_source_posting_id,
          right_source_posting_id = excluded.right_source_posting_id,
          left_generation_id = excluded.left_generation_id,
          right_generation_id = excluded.right_generation_id,
          score = excluded.score,
          reasons = excluded.reasons,
          status = 'active',
          evidence_revision = candidate.evidence_revision + 1,
          updated_at = clock_timestamp()
      where candidate.status <> 'active'
        or candidate.left_source_posting_id is distinct from excluded.left_source_posting_id
        or candidate.right_source_posting_id is distinct from excluded.right_source_posting_id
        or candidate.left_generation_id is distinct from excluded.left_generation_id
        or candidate.right_generation_id is distinct from excluded.right_generation_id
        or candidate.score is distinct from excluded.score
        or candidate.reasons is distinct from excluded.reasons;
  end loop;
end;
$$;

create function public.catalog_duplicate_detail_component(target_user_id uuid, target_start_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with recursive graph(left_id, right_id) as (
    select candidate.left_canonical_job_id, candidate.right_canonical_job_id
    from public.catalog_duplicate_decisions as decision
    join public.catalog_duplicate_candidates as candidate on candidate.id = decision.candidate_id
    where decision.user_id = target_user_id
      and decision.decision = 'merged'
      and public.catalog_duplicate_is_currently_eligible(candidate.id)
  ), walk(node, path) as (
    select target_start_id, array[target_start_id]::uuid[]
    union all
    select case when graph.left_id = walk.node then graph.right_id else graph.left_id end,
      walk.path || case when graph.left_id = walk.node then graph.right_id else graph.left_id end
    from walk
    join graph on graph.left_id = walk.node or graph.right_id = walk.node
    where not (case when graph.left_id = walk.node then graph.right_id else graph.left_id end = any(walk.path))
      and cardinality(walk.path) < 26
  )
  select coalesce(array_agg(node order by node), array[target_start_id]::uuid[])
  from (select distinct node from walk) as nodes;
$$;

create function public.get_catalog_duplicate_detail(target_id uuid)
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
begin
  if caller_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not public.catalog_duplicate_has_current_consent(caller_id) then
    return jsonb_build_object('candidates', result);
  end if;

  for candidate_record in
    select candidate.*, left_job.deadline_at as left_deadline_at, right_job.deadline_at as right_deadline_at,
      left_job.locations as left_locations, right_job.locations as right_locations,
      left_posting.provider_code as left_provider_code, right_posting.provider_code as right_provider_code,
      left_provider.display_name as left_provider_name, right_provider.display_name as right_provider_name,
      left_posting.original_url as left_original_url, right_posting.original_url as right_original_url,
      left_posting.last_observed_at as left_observed_at, right_posting.last_observed_at as right_observed_at
    from public.catalog_duplicate_candidates as candidate
    join public.canonical_jobs as left_job on left_job.id = candidate.left_canonical_job_id
    join public.canonical_jobs as right_job on right_job.id = candidate.right_canonical_job_id
    join public.source_postings as left_posting on left_posting.id = candidate.left_source_posting_id
    join public.source_postings as right_posting on right_posting.id = candidate.right_source_posting_id
    join public.source_providers as left_provider on left_provider.code = left_posting.provider_code
    join public.source_providers as right_provider on right_provider.code = right_posting.provider_code
    where (candidate.left_canonical_job_id = target_id or candidate.right_canonical_job_id = target_id)
      and public.catalog_duplicate_is_currently_eligible(candidate.id)
    order by candidate.id
  loop
    candidate_count := candidate_count + 1;
    if candidate_count > 25 then
      raise exception 'duplicate detail candidate limit exceeded' using errcode = '54000';
    end if;
    members := public.catalog_duplicate_detail_component(caller_id, target_id);
    if cardinality(members) > 25 then
      raise exception 'duplicate component limit exceeded' using errcode = '54000';
    end if;
    sources := jsonb_build_array(
      jsonb_build_object('provider', candidate_record.left_provider_code, 'providerName', candidate_record.left_provider_name,
        'originalUrl', public.catalog_duplicate_safe_source_url(candidate_record.left_original_url, (select terms_url from public.source_providers where code = candidate_record.left_provider_code)),
        'observedAt', candidate_record.left_observed_at),
      jsonb_build_object('provider', candidate_record.right_provider_code, 'providerName', candidate_record.right_provider_name,
        'originalUrl', public.catalog_duplicate_safe_source_url(candidate_record.right_original_url, (select terms_url from public.source_providers where code = candidate_record.right_provider_code)),
        'observedAt', candidate_record.right_observed_at)
    );
    conflicts := '[]'::jsonb;
    if candidate_record.left_deadline_at is distinct from candidate_record.right_deadline_at then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('field', 'deadlineAt', 'values', jsonb_build_array(
        jsonb_build_object('provider', candidate_record.left_provider_code, 'observedAt', candidate_record.left_observed_at, 'value', candidate_record.left_deadline_at),
        jsonb_build_object('provider', candidate_record.right_provider_code, 'observedAt', candidate_record.right_observed_at, 'value', candidate_record.right_deadline_at)
      )));
    end if;
    if candidate_record.left_locations is distinct from candidate_record.right_locations then
      conflicts := conflicts || jsonb_build_array(jsonb_build_object('field', 'locations', 'values', jsonb_build_array(
        jsonb_build_object('provider', candidate_record.left_provider_code, 'observedAt', candidate_record.left_observed_at, 'value', nullif(array_to_string(candidate_record.left_locations, ', '), '')),
        jsonb_build_object('provider', candidate_record.right_provider_code, 'observedAt', candidate_record.right_observed_at, 'value', nullif(array_to_string(candidate_record.right_locations, ', '), ''))
      )));
    end if;
    select jsonb_build_object(
      'decision', decision.decision,
      'revision', coalesce(decision.effective_revision, 0),
      'history', coalesce((
        select jsonb_agg(jsonb_build_object('action', event.action, 'createdAt', event.created_at) order by event.created_at desc, event.id desc)
        from (
          select * from public.catalog_duplicate_decision_events
          where user_id = caller_id and candidate_id = candidate_record.id
          order by created_at desc, id desc limit 25
        ) as event
      ), '[]'::jsonb)
    ) into user_detail
    from public.catalog_duplicate_decisions as decision
    where decision.user_id = caller_id and decision.candidate_id = candidate_record.id;
    user_detail := coalesce(user_detail, jsonb_build_object('decision', null, 'revision', 0, 'history', '[]'::jsonb));
    result := result || jsonb_build_array(jsonb_build_object(
      'id', candidate_record.id,
      'counterpartId', case when candidate_record.left_canonical_job_id = target_id then candidate_record.right_canonical_job_id else candidate_record.left_canonical_job_id end,
      'score', candidate_record.score,
      'reasons', candidate_record.reasons,
      'evidenceRevision', candidate_record.evidence_revision,
      'sources', sources,
      'conflicts', conflicts,
      'currentUser', user_detail,
      'group', jsonb_build_object(
        'representativeId', (select min(member::text)::uuid from unnest(members) as member),
        'memberIds', (select jsonb_agg(member order by member) from unnest(members) as member)
      )
    ));
  end loop;
  return jsonb_build_object('candidates', result);
end;
$$;

-- Wrap the existing ingestion procedure instead of refreshing after the caller
-- sees success. A refresh exception rolls back the complete finalization too.
alter function public.ingest_source_postings(text, uuid, jsonb, boolean, boolean)
  rename to ingest_source_postings_base;

create function public.ingest_source_postings(
  target_provider_code text,
  target_run_id uuid,
  target_postings jsonb,
  target_finalize boolean default false,
  target_snapshot_complete boolean default false
)
returns table (upserted_count integer, closed_count integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query select * from public.ingest_source_postings_base(
    target_provider_code, target_run_id, target_postings, target_finalize, target_snapshot_complete
  );
  if target_finalize and target_snapshot_complete then
    perform public.refresh_catalog_duplicate_candidates_for_reconciliation(target_provider_code, target_run_id);
  end if;
end;
$$;

revoke all on function public.catalog_duplicate_safe_source_url(text, text) from public, anon, authenticated;
revoke all on function public.refresh_catalog_duplicate_candidates_for_reconciliation(text, uuid) from public, anon, authenticated;
revoke all on function public.catalog_duplicate_detail_component(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_catalog_duplicate_detail(uuid) from public, anon, service_role;
revoke all on function public.ingest_source_postings_base(text, uuid, jsonb, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.ingest_source_postings(text, uuid, jsonb, boolean, boolean) from public, anon, authenticated;
grant execute on function public.get_catalog_duplicate_detail(uuid) to authenticated;
grant execute on function public.ingest_source_postings(text, uuid, jsonb, boolean, boolean) to service_role;

commit;
