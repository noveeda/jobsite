begin;

create table public.source_providers (
  code text primary key,
  display_name text not null,
  enabled boolean not null default false,
  access_mode text,
  terms_url text,
  approval_reference text,
  refresh_interval_minutes integer not null default 360,
  daily_limit integer,
  page_limit integer,
  attribution jsonb not null default '{}'::jsonb,
  retention_policy jsonb not null default '{}'::jsonb,
  capabilities jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error_code text,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_providers_code_check check (code ~ '^[a-z][a-z0-9_-]{1,39}$'),
  constraint source_providers_access_mode_check check (
    access_mode is null or access_mode in ('approved_api', 'public_feed')
  ),
  constraint source_providers_terms_url_check check (
    terms_url is null or terms_url ~ '^https://[^[:space:]]+$'
  ),
  constraint source_providers_refresh_check check (refresh_interval_minutes > 0),
  constraint source_providers_daily_limit_check check (daily_limit is null or daily_limit > 0),
  constraint source_providers_page_limit_check check (page_limit is null or page_limit > 0),
  constraint source_providers_json_check check (
    jsonb_typeof(attribution) = 'object'
    and jsonb_typeof(retention_policy) = 'object'
    and jsonb_typeof(capabilities) = 'object'
  ),
  constraint source_providers_enabled_metadata_check check (
    not enabled or (
      access_mode is not null
      and terms_url is not null
      and attribution <> '{}'::jsonb
      and retention_policy <> '{}'::jsonb
    )
  )
);

create table public.canonical_jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company_name text not null,
  role_name text,
  locations text[] not null default '{}',
  employment_types text[] not null default '{}',
  career_min_years integer,
  career_max_years integer,
  experience_text text,
  education_text text,
  industry text,
  job_categories text[] not null default '{}',
  salary_text text,
  posted_at timestamptz,
  deadline_kind text not null default 'unknown',
  deadline_at timestamptz,
  lifecycle_status text not null default 'active',
  last_observed_at timestamptz not null,
  field_provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canonical_jobs_title_check check (length(btrim(title)) > 0),
  constraint canonical_jobs_company_check check (length(btrim(company_name)) > 0),
  constraint canonical_jobs_career_min_check check (career_min_years is null or career_min_years >= 0),
  constraint canonical_jobs_career_max_check check (career_max_years is null or career_max_years >= 0),
  constraint canonical_jobs_career_range_check check (
    career_min_years is null or career_max_years is null or career_min_years <= career_max_years
  ),
  constraint canonical_jobs_deadline_kind_check check (
    deadline_kind in ('fixed', 'rolling', 'until_hired', 'unknown')
  ),
  constraint canonical_jobs_fixed_deadline_check check (
    deadline_kind <> 'fixed' or deadline_at is not null
  ),
  constraint canonical_jobs_lifecycle_check check (
    lifecycle_status in ('active', 'stale', 'closed', 'withdrawn')
  ),
  constraint canonical_jobs_provenance_check check (jsonb_typeof(field_provenance) = 'object')
);

create table public.collection_runs (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null references public.source_providers(code),
  schedule_bucket timestamptz not null,
  run_kind text not null,
  status text not null default 'pending',
  cursor jsonb,
  snapshot_complete boolean not null default false,
  lease_until timestamptz,
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  fetched_count integer not null default 0,
  upserted_count integer not null default 0,
  closed_count integer not null default 0,
  quota_used integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_summary text,
  created_at timestamptz not null default now(),
  constraint collection_runs_identity_key unique (provider_code, schedule_bucket, run_kind),
  constraint collection_runs_kind_check check (run_kind in ('incremental', 'reconciliation', 'bootstrap')),
  constraint collection_runs_status_check check (
    status in ('pending', 'running', 'partial', 'succeeded', 'failed', 'cancelled')
  ),
  constraint collection_runs_snapshot_check check (not snapshot_complete or status = 'succeeded'),
  constraint collection_runs_counts_check check (
    attempt_count >= 0
    and fetched_count >= 0
    and upserted_count >= 0
    and closed_count >= 0
    and quota_used >= 0
  )
);

create table public.source_postings (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null references public.source_providers(code),
  canonical_job_id uuid not null references public.canonical_jobs(id) on delete cascade,
  external_id text not null,
  original_url text not null,
  normalized_url text not null,
  source_values jsonb not null default '{}'::jsonb,
  source_status text not null default 'active',
  first_observed_at timestamptz not null,
  last_observed_at timestamptz not null,
  missing_complete_runs smallint not null default 0,
  last_collection_run_id uuid references public.collection_runs(id) on delete set null,
  content_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint source_postings_provider_external_key unique (provider_code, external_id),
  constraint source_postings_provider_url_key unique (provider_code, normalized_url),
  constraint source_postings_external_id_check check (length(btrim(external_id)) > 0),
  constraint source_postings_original_url_check check (original_url ~ '^https://[^[:space:]]+$'),
  constraint source_postings_normalized_url_check check (normalized_url ~ '^https://[^[:space:]]+$'),
  constraint source_postings_values_check check (jsonb_typeof(source_values) = 'object'),
  constraint source_postings_status_check check (
    source_status in ('active', 'missing_once', 'closed', 'withdrawn', 'error')
  ),
  constraint source_postings_missing_check check (missing_complete_runs >= 0),
  constraint source_postings_observed_check check (first_observed_at <= last_observed_at),
  constraint source_postings_fingerprint_check check (length(content_fingerprint) > 0)
);

create table public.provider_daily_usage (
  provider_code text not null references public.source_providers(code),
  usage_date date not null,
  scheduled_calls integer not null default 0,
  reserve_calls integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider_code, usage_date),
  constraint provider_daily_usage_counts_check check (scheduled_calls >= 0 and reserve_calls >= 0)
);

create index canonical_jobs_feed_idx
  on public.canonical_jobs(posted_at desc nulls last, last_observed_at desc, id)
  where lifecycle_status = 'active';
create index canonical_jobs_locations_idx on public.canonical_jobs using gin(locations);
create index canonical_jobs_employment_types_idx on public.canonical_jobs using gin(employment_types);
create index canonical_jobs_categories_idx on public.canonical_jobs using gin(job_categories);
create index canonical_jobs_search_idx on public.canonical_jobs using gin(
  to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(company_name, '') || ' ' || coalesce(role_name, ''))
);
create index source_postings_canonical_idx on public.source_postings(canonical_job_id);
create index source_postings_provider_status_idx on public.source_postings(provider_code, source_status, last_observed_at desc);
create index collection_runs_provider_due_idx on public.collection_runs(provider_code, schedule_bucket desc, status);

create trigger source_providers_updated_at
  before update on public.source_providers
  for each row execute function public.set_updated_at();
create trigger canonical_jobs_updated_at
  before update on public.canonical_jobs
  for each row execute function public.set_updated_at();
create trigger source_postings_updated_at
  before update on public.source_postings
  for each row execute function public.set_updated_at();
create trigger provider_daily_usage_updated_at
  before update on public.provider_daily_usage
  for each row execute function public.set_updated_at();

alter table public.source_providers enable row level security;
alter table public.source_providers force row level security;
alter table public.canonical_jobs enable row level security;
alter table public.canonical_jobs force row level security;
alter table public.collection_runs enable row level security;
alter table public.collection_runs force row level security;
alter table public.source_postings enable row level security;
alter table public.source_postings force row level security;
alter table public.provider_daily_usage enable row level security;
alter table public.provider_daily_usage force row level security;

revoke all on table public.source_providers from public, anon, authenticated;
revoke all on table public.canonical_jobs from public, anon, authenticated;
revoke all on table public.collection_runs from public, anon, authenticated;
revoke all on table public.source_postings from public, anon, authenticated;
revoke all on table public.provider_daily_usage from public, anon, authenticated;

commit;
