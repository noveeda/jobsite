create extension if not exists pgcrypto;

create type public.source_provider as enum ('manual', 'saramin', 'jobkorea', 'other');
create type public.connector_mode as enum ('manual', 'approved_api');
create type public.application_status as enum ('unreviewed', 'interested', 'planned', 'applied', 'interviewing', 'accepted', 'rejected', 'excluded');
create type public.deadline_kind as enum ('fixed', 'rolling', 'until_hired', 'unknown');
create type public.source_status as enum ('active', 'closed', 'unreachable', 'unsupported', 'unknown');
create type public.duplicate_decision as enum ('suggested', 'confirmed', 'rejected');

create table public.duplicate_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  company_name text not null,
  role_name text,
  summary text,
  responsibilities text[] not null default '{}',
  qualifications text[] not null default '{}',
  preferred_qualifications text[] not null default '{}',
  career_min_years smallint,
  career_max_years smallint,
  education_text text,
  employment_types text[] not null default '{}',
  locations text[] not null default '{}',
  salary_text text,
  skills text[] not null default '{}',
  posted_at timestamptz,
  deadline_at timestamptz,
  deadline_kind public.deadline_kind not null default 'unknown',
  application_status public.application_status not null default 'unreviewed',
  memo text not null default '',
  next_action_at timestamptz,
  duplicate_group_id uuid references public.duplicate_groups(id) on delete set null,
  field_provenance jsonb not null default '{}',
  search_document tsvector not null default ''::tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_bounded_fields_check check (
    char_length(btrim(title)) between 1 and 300 and
    char_length(btrim(company_name)) between 1 and 200 and
    (role_name is null or char_length(role_name) <= 200) and
    (summary is null or char_length(summary) <= 1000) and
    (education_text is null or char_length(education_text) <= 100) and
    (salary_text is null or char_length(salary_text) <= 200) and
    char_length(memo) <= 20000 and
    (career_min_years is null or career_min_years between 0 and 80) and
    (career_max_years is null or career_max_years between 0 and 80) and
    (career_min_years is null or career_max_years is null or career_max_years >= career_min_years) and
    (deadline_kind <> 'fixed' or deadline_at is not null) and
    jsonb_typeof(field_provenance) = 'object'
  )
);

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  provider public.source_provider not null default 'other',
  connector_mode public.connector_mode not null default 'manual',
  external_id text,
  original_url text not null,
  normalized_url text not null,
  source_values jsonb not null default '{}',
  status public.source_status not null default 'unknown',
  first_observed_at timestamptz not null default now(),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_sources_https_url_check check (original_url ~ '^https://[^[:space:]]+$' and normalized_url ~ '^https://[^[:space:]]+$'),
  constraint job_sources_external_id_length_check check (external_id is null or char_length(external_id) <= 200),
  constraint job_sources_user_normalized_url_key unique (user_id, normalized_url)
);

create unique index job_sources_provider_external_id_key on public.job_sources(user_id, provider, external_id) where external_id is not null;

create table public.source_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.job_sources(id) on delete cascade,
  result_status public.source_status not null,
  fields_changed text[] not null default '{}',
  error_code text,
  checked_at timestamptz not null default now()
);

create table public.duplicate_pairs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  left_job_id uuid not null references public.jobs(id) on delete cascade,
  right_job_id uuid not null references public.jobs(id) on delete cascade,
  score numeric(5,4) not null,
  reasons jsonb not null default '{}',
  decision public.duplicate_decision not null default 'suggested',
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint duplicate_pairs_valid_check check (left_job_id < right_job_id and score between 0 and 1),
  constraint duplicate_pairs_user_pair_key unique (user_id, left_job_id, right_job_id)
);

create table public.job_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null,
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  device_id uuid not null default gen_random_uuid(),
  change_kind text not null check (change_kind in ('update', 'delete', 'restore', 'import')),
  restored_from_revision_id uuid references public.job_revisions(id) on delete set null
);

create index jobs_user_updated_idx on public.jobs(user_id, updated_at desc);
create index jobs_user_status_idx on public.jobs(user_id, application_status);
create index jobs_user_deadline_idx on public.jobs(user_id, deadline_at);
create index jobs_search_idx on public.jobs using gin(search_document);
create index sources_user_job_idx on public.job_sources(user_id, job_id);
create index source_checks_source_checked_idx on public.source_checks(source_id, checked_at desc);
create index duplicate_pairs_user_decision_idx on public.duplicate_pairs(user_id, decision);
create index revisions_user_job_changed_idx on public.job_revisions(user_id, job_id, changed_at desc);
