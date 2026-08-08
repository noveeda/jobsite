begin;

-- A provider is not eligible for live traffic merely because a deployment has a
-- credential.  Existing deterministic fixture providers intentionally keep the
-- default `activation_required = false`; every real connector must opt in and
-- then satisfy the complete, secret-free approval record below.
alter table public.source_providers
  add column if not exists activation_required boolean not null default false,
  add column if not exists approval_status text not null default 'pending',
  add column if not exists approval_expires_at timestamptz,
  add column if not exists staging_smoke_reference text,
  add column if not exists enabled_at timestamptz,
  add column if not exists enabled_by uuid references auth.users(id) on delete set null;

alter table public.source_providers
  add constraint source_providers_approval_status_check
    check (approval_status in ('pending', 'approved', 'blocked', 'withdrawn')),
  add constraint source_providers_activation_record_check
    check (
      not activation_required
      or (
        access_mode = 'approved_api'
        and length(btrim(coalesce(approval_reference, ''))) between 1 and 500
        and terms_url is not null
        and attribution ? 'text'
        and attribution ? 'href'
        and length(btrim(coalesce(attribution->>'text', ''))) > 0
        and attribution->>'href' ~ '^https://[^[:space:]]+$'
        and retention_policy <> '{}'::jsonb
        and staging_smoke_reference is not null
        and length(btrim(staging_smoke_reference)) between 1 and 500
      )
    ),
  add constraint source_providers_enabled_activation_check
    check (
      not enabled
      or not activation_required
      or (
        approval_status = 'approved'
        and enabled_at is not null
        and enabled_by is not null
      )
    );

-- Operator approval records remain part of the already restricted provider
-- table.  Browser roles deliberately receive neither a select grant nor a
-- mutation grant for these columns.
revoke all on table public.source_providers from public, anon, authenticated;

commit;
