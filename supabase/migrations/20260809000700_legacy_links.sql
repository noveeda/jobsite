begin;

create function public.legacy_links_is_safe_display(target_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  field_name text;
  location_value text;
begin
  if jsonb_typeof(target_value) <> 'object' or octet_length(target_value::text) > 4096 then
    return false;
  end if;

  for field_name in select jsonb_object_keys(target_value)
  loop
    if field_name not in ('title', 'companyName', 'roleName', 'locations', 'postedAt', 'deadlineAt') then
      return false;
    end if;
  end loop;

  if target_value ? 'title' and (jsonb_typeof(target_value->'title') <> 'string' or char_length(target_value->>'title') > 300) then
    return false;
  end if;
  if target_value ? 'companyName' and (jsonb_typeof(target_value->'companyName') <> 'string' or char_length(target_value->>'companyName') > 200) then
    return false;
  end if;
  if target_value ? 'roleName' and (jsonb_typeof(target_value->'roleName') <> 'string' or char_length(target_value->>'roleName') > 200) then
    return false;
  end if;
  if target_value ? 'postedAt' and (jsonb_typeof(target_value->'postedAt') <> 'string' or char_length(target_value->>'postedAt') > 64) then
    return false;
  end if;
  if target_value ? 'deadlineAt' and (jsonb_typeof(target_value->'deadlineAt') <> 'string' or char_length(target_value->>'deadlineAt') > 64) then
    return false;
  end if;
  if target_value ? 'locations' then
    if jsonb_typeof(target_value->'locations') <> 'array' or jsonb_array_length(target_value->'locations') > 20 then
      return false;
    end if;
    for location_value in
      select jsonb_array_elements_text(
        case when jsonb_typeof(target_value->'locations') = 'array' then target_value->'locations' else '[]'::jsonb end
      )
    loop
      if char_length(location_value) > 100 then
        return false;
      end if;
    end loop;
  end if;

  return true;
end;
$$;

create function public.legacy_links_is_safe_state(target_value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  field_name text;
  application_state text;
begin
  if jsonb_typeof(target_value) <> 'object' or octet_length(target_value::text) > 12288 then
    return false;
  end if;

  for field_name in select jsonb_object_keys(target_value)
  loop
    if field_name not in ('saved', 'excluded', 'applicationStatus', 'memo', 'nextActionAt') then
      return false;
    end if;
  end loop;

  if target_value ? 'saved' and jsonb_typeof(target_value->'saved') <> 'boolean' then
    return false;
  end if;
  if target_value ? 'excluded' and jsonb_typeof(target_value->'excluded') <> 'boolean' then
    return false;
  end if;
  if target_value ? 'applicationStatus' then
    application_state := target_value->>'applicationStatus';
    if jsonb_typeof(target_value->'applicationStatus') <> 'string'
       or application_state not in ('unreviewed', 'planned', 'applied', 'interviewing', 'offered', 'rejected', 'withdrawn') then
      return false;
    end if;
  end if;
  if target_value ? 'memo' and (jsonb_typeof(target_value->'memo') <> 'string' or char_length(target_value->>'memo') > 10000) then
    return false;
  end if;
  if target_value ? 'nextActionAt' and (jsonb_typeof(target_value->'nextActionAt') <> 'string' or char_length(target_value->>'nextActionAt') > 64) then
    return false;
  end if;

  return true;
end;
$$;

create table public.manual_catalog_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  manual_job_id uuid not null references public.jobs(id) on delete cascade,
  source_posting_id uuid not null references public.source_postings(id) on delete restrict,
  canonical_job_id uuid not null references public.canonical_jobs(id) on delete restrict,
  provider_code text not null,
  external_id text not null,
  original_url text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, manual_job_id),
  constraint manual_catalog_links_provider_code_check check (provider_code ~ '^[a-z][a-z0-9_-]{1,39}$'),
  constraint manual_catalog_links_external_id_check check (char_length(btrim(external_id)) between 1 and 200),
  constraint manual_catalog_links_original_url_check check (
    char_length(original_url) <= 2048
    and original_url ~ '^https://[^[:space:]]+$'
    and original_url !~ '^https://[^/@[:space:]]+@'
  )
);

create index manual_catalog_links_source_posting_idx
  on public.manual_catalog_links(source_posting_id);

create table public.unresolved_source_overlays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_code text not null,
  external_id text not null,
  original_url text not null,
  state_payload jsonb not null default '{}'::jsonb,
  safe_display jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint unresolved_source_overlays_owner_identity_key unique (user_id, provider_code, external_id, original_url),
  constraint unresolved_source_overlays_provider_code_check check (provider_code ~ '^[a-z][a-z0-9_-]{1,39}$'),
  constraint unresolved_source_overlays_external_id_check check (char_length(btrim(external_id)) between 1 and 200),
  constraint unresolved_source_overlays_original_url_check check (
    char_length(original_url) <= 2048
    and original_url ~ '^https://[^[:space:]]+$'
    and original_url !~ '^https://[^/@[:space:]]+@'
  ),
  constraint unresolved_source_overlays_state_payload_check check (public.legacy_links_is_safe_state(state_payload)),
  constraint unresolved_source_overlays_safe_display_check check (public.legacy_links_is_safe_display(safe_display))
);

create table public.unresolved_duplicate_overlays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  left_provider_code text not null,
  left_external_id text not null,
  left_original_url text not null,
  right_provider_code text not null,
  right_external_id text not null,
  right_original_url text not null,
  decision text not null,
  left_safe_display jsonb not null default '{}'::jsonb,
  right_safe_display jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint unresolved_duplicate_overlays_owner_identity_key unique (
    user_id, left_provider_code, left_external_id, left_original_url,
    right_provider_code, right_external_id, right_original_url, decision
  ),
  constraint unresolved_duplicate_overlays_left_provider_code_check check (left_provider_code ~ '^[a-z][a-z0-9_-]{1,39}$'),
  constraint unresolved_duplicate_overlays_right_provider_code_check check (right_provider_code ~ '^[a-z][a-z0-9_-]{1,39}$'),
  constraint unresolved_duplicate_overlays_left_external_id_check check (char_length(btrim(left_external_id)) between 1 and 200),
  constraint unresolved_duplicate_overlays_right_external_id_check check (char_length(btrim(right_external_id)) between 1 and 200),
  constraint unresolved_duplicate_overlays_left_original_url_check check (
    char_length(left_original_url) <= 2048
    and left_original_url ~ '^https://[^[:space:]]+$'
    and left_original_url !~ '^https://[^/@[:space:]]+@'
  ),
  constraint unresolved_duplicate_overlays_right_original_url_check check (
    char_length(right_original_url) <= 2048
    and right_original_url ~ '^https://[^[:space:]]+$'
    and right_original_url !~ '^https://[^/@[:space:]]+@'
  ),
  constraint unresolved_duplicate_overlays_endpoint_order_check check (
    (left_provider_code, left_external_id, left_original_url)
      < (right_provider_code, right_external_id, right_original_url)
  ),
  constraint unresolved_duplicate_overlays_decision_check check (decision in ('merge', 'separate')),
  constraint unresolved_duplicate_overlays_left_safe_display_check check (public.legacy_links_is_safe_display(left_safe_display)),
  constraint unresolved_duplicate_overlays_right_safe_display_check check (public.legacy_links_is_safe_display(right_safe_display))
);

create index unresolved_source_overlays_owner_idx
  on public.unresolved_source_overlays(user_id, updated_at desc);
create index unresolved_duplicate_overlays_owner_idx
  on public.unresolved_duplicate_overlays(user_id, updated_at desc);

create trigger manual_catalog_links_updated_at
  before update on public.manual_catalog_links
  for each row execute function public.set_updated_at();
create trigger unresolved_source_overlays_updated_at
  before update on public.unresolved_source_overlays
  for each row execute function public.set_updated_at();
create trigger unresolved_duplicate_overlays_updated_at
  before update on public.unresolved_duplicate_overlays
  for each row execute function public.set_updated_at();

create function public.validate_manual_catalog_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  posting public.source_postings%rowtype;
begin
  select * into posting
  from public.source_postings
  where id = new.source_posting_id;

  if posting.id is null
     or posting.provider_code <> new.provider_code
     or posting.external_id <> new.external_id
     or posting.original_url <> new.original_url
     or posting.canonical_job_id <> new.canonical_job_id then
    raise exception 'manual catalog link source identity mismatch' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger manual_catalog_links_validate_source
  before insert or update on public.manual_catalog_links
  for each row execute function public.validate_manual_catalog_link();

alter table public.manual_catalog_links enable row level security;
alter table public.manual_catalog_links force row level security;
alter table public.unresolved_source_overlays enable row level security;
alter table public.unresolved_source_overlays force row level security;
alter table public.unresolved_duplicate_overlays enable row level security;
alter table public.unresolved_duplicate_overlays force row level security;

create policy manual_catalog_links_owner_all
  on public.manual_catalog_links for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy unresolved_source_overlays_owner_all
  on public.unresolved_source_overlays for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy unresolved_duplicate_overlays_owner_all
  on public.unresolved_duplicate_overlays for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.manual_catalog_links from public, anon, authenticated, service_role;
revoke all on table public.unresolved_source_overlays from public, anon, authenticated, service_role;
revoke all on table public.unresolved_duplicate_overlays from public, anon, authenticated, service_role;

create function public.link_manual_job_to_catalog(
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

  return jsonb_build_object(
    'manualJobId', target_manual_job_id,
    'canonicalJobId', posting.canonical_job_id,
    'providerCode', posting.provider_code,
    'externalId', posting.external_id,
    'originalUrl', posting.original_url
  );
end;
$$;

create function public.get_manual_catalog_link(target_manual_job_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'manualJobId', link.manual_job_id,
    'canonicalJobId', link.canonical_job_id,
    'providerCode', link.provider_code,
    'externalId', link.external_id,
    'originalUrl', link.original_url
  )
  from public.manual_catalog_links as link
  join public.jobs as job on job.id = link.manual_job_id
  where link.manual_job_id = target_manual_job_id
    and link.user_id = auth.uid()
    and job.user_id = auth.uid();
$$;

create function public.unlink_manual_catalog_link(target_manual_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  removed boolean := false;
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

  return jsonb_build_object(
    'manualJobId', target_manual_job_id,
    'unlinked', coalesce(removed, false)
  );
end;
$$;

revoke all on function public.legacy_links_is_safe_display(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.legacy_links_is_safe_state(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.validate_manual_catalog_link() from public, anon, authenticated, service_role;
revoke all on function public.link_manual_job_to_catalog(uuid, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_manual_catalog_link(uuid) from public, anon, authenticated, service_role;
revoke all on function public.unlink_manual_catalog_link(uuid) from public, anon, authenticated, service_role;
grant execute on function public.link_manual_job_to_catalog(uuid, text, text, text) to authenticated;
grant execute on function public.get_manual_catalog_link(uuid) to authenticated;
grant execute on function public.unlink_manual_catalog_link(uuid) to authenticated;

commit;
