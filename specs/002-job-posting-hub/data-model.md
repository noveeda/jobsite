# Data Model: 개인용 통합 채용공고 허브

**Feature**: `002-job-posting-hub`
**Date**: 2026-08-06

## Design rules

- Supabase `auth.users.id` is the account identity; no duplicate profile table is required for MVP.
- Every user-owned table includes `user_id uuid not null` and RLS for select, insert, update, and delete.
- Server-generated `created_at` and `updated_at` timestamps determine ordering and last-write-wins.
- The service role key is never exposed to the browser. Ownership comes only from the verified session, never request-supplied `user_id`.
- Full source bodies, images, and provider credentials are never stored in user tables.
- All destructive restore and overwrite paths create revisions in the same transaction.

## Enumerations

### `source_provider`

`manual | saramin | jobkorea | other`

### `connector_mode`

`manual | approved_api`

`approved_api` is valid only when server configuration confirms provider approval and credentials.

### `value_origin`

`source | normalized | user | missing | not_applicable | failed`

### `application_status`

`unreviewed | interested | planned | applied | interviewing | accepted | rejected | excluded`

### `deadline_kind`

`fixed | rolling | until_hired | unknown`

### `source_status`

`active | closed | unreachable | unsupported | unknown`

### `duplicate_decision`

`suggested | confirmed | rejected`

## Field provenance document

`jobs.field_provenance` maps a supported field name to:

```json
{
  "title": {
    "origin": "source",
    "sourceId": "uuid",
    "observedAt": "2026-08-06T10:00:00Z"
  },
  "summary": {
    "origin": "normalized",
    "sourceId": "uuid",
    "observedAt": "2026-08-06T10:00:00Z"
  },
  "salaryText": {
    "origin": "missing",
    "sourceId": "uuid",
    "observedAt": "2026-08-06T10:00:00Z"
  }
}
```

Allowed keys are the structured job fields listed below. Validation rejects unknown origin values. User edits change only the edited field's origin to `user`; subsequent source refreshes do not overwrite user-origin values without explicit confirmation.

## Tables

### 1. `jobs`

Canonical job record shown in lists and detail pages.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key, server generated |
| `user_id` | uuid | FK to `auth.users.id`, required, indexed |
| `title` | text | Required, trimmed, 1–300 chars |
| `company_name` | text | Required, trimmed, 1–200 chars |
| `role_name` | text | Nullable, max 200 chars |
| `summary` | text | Nullable, short deterministic summary, max 1,000 chars |
| `responsibilities` | text[] | Structured bullets, not full source body |
| `qualifications` | text[] | Structured bullets |
| `preferred_qualifications` | text[] | Structured bullets |
| `career_min_years` | smallint | Nullable, 0–80 |
| `career_max_years` | smallint | Nullable, >= min, <= 80 |
| `education_text` | text | Nullable, max 100 chars |
| `employment_types` | text[] | Normalized labels |
| `locations` | text[] | Normalized labels |
| `salary_text` | text | Nullable, max 200 chars |
| `skills` | text[] | Normalized distinct labels |
| `posted_at` | timestamptz | Nullable |
| `deadline_at` | timestamptz | Nullable; required when deadline kind is fixed |
| `deadline_kind` | deadline_kind | Required |
| `application_status` | application_status | Default `unreviewed` |
| `memo` | text | User-authored, max 20,000 chars |
| `next_action_at` | timestamptz | Nullable |
| `duplicate_group_id` | uuid | Nullable FK to `duplicate_groups.id` |
| `field_provenance` | jsonb | Required, validated shape |
| `created_at` | timestamptz | Server default |
| `updated_at` | timestamptz | Server trigger on every write |

**Indexes**:

- `(user_id, updated_at desc)`
- `(user_id, application_status)`
- `(user_id, deadline_at)`
- GIN on normalized search document built from title, company, role, locations, and skills

**Validation**:

- No full HTML or full source-body field exists.
- `excluded` is represented by `application_status`, not a second boolean.
- All status transitions are allowed so users can correct mistakes; every transition creates a revision.

### 2. `job_sources`

One canonical job may have multiple provider URLs.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | Required ownership key |
| `job_id` | uuid | FK to `jobs.id` on delete cascade |
| `provider` | source_provider | Required |
| `connector_mode` | connector_mode | Required |
| `external_id` | text | Nullable; provider-issued ID only |
| `original_url` | text | Required valid HTTPS URL |
| `normalized_url` | text | Required canonical URL for duplicate detection |
| `source_values` | jsonb | Only API-permitted structured fields, no full body |
| `status` | source_status | Default `unknown` |
| `first_observed_at` | timestamptz | Server default |
| `last_checked_at` | timestamptz | Nullable |
| `last_success_at` | timestamptz | Nullable |
| `last_error_code` | text | Nullable, sanitized code only |
| `created_at` | timestamptz | Server default |
| `updated_at` | timestamptz | Server trigger |

**Constraints**:

- Unique `(user_id, normalized_url)`.
- Unique `(user_id, provider, external_id)` when external ID is present.
- `approved_api` must correspond to enabled server configuration; otherwise writes use `manual`.
- Redirected URLs are normalized only after provider allowlist validation.

### 3. `source_checks`

Append-only trace of detail refresh attempts.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | Required ownership key |
| `source_id` | uuid | FK to `job_sources.id` on delete cascade |
| `result_status` | source_status | Required |
| `fields_changed` | text[] | Empty on no change or failure |
| `error_code` | text | Nullable, no secret or raw response |
| `checked_at` | timestamptz | Server default |

Retention for the personal MVP is the latest 100 checks per source; pruning must not affect `last_success_at` or user data.

### 4. `duplicate_groups`

User-confirmed collection of records representing one opportunity.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | Required ownership key |
| `created_at` | timestamptz | Server default |
| `updated_at` | timestamptz | Server trigger |

A group with fewer than two jobs is removed after a split. Removing a group never deletes jobs, sources, notes, or history.

### 5. `duplicate_pairs`

Suggestions and explicit confirmed/rejected decisions.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | Required ownership key |
| `left_job_id` | uuid | FK to `jobs.id` |
| `right_job_id` | uuid | FK to `jobs.id` |
| `score` | numeric(5,4) | 0–1 |
| `reasons` | jsonb | Human-readable matched-field reasons |
| `decision` | duplicate_decision | Default `suggested` |
| `decided_at` | timestamptz | Nullable until confirmed/rejected |
| `created_at` | timestamptz | Server default |
| `updated_at` | timestamptz | Server trigger |

**Constraints**:

- Store pairs in deterministic UUID order; left and right cannot match.
- Unique `(user_id, left_job_id, right_job_id)`.
- `rejected` prevents the same unchanged pair from being re-suggested.
- Confirming creates or joins a duplicate group transactionally; rejecting or splitting never deletes records.

### 6. `job_revisions`

Immutable prior snapshots for conflict and user recovery.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | Required ownership key |
| `job_id` | uuid | Required job identity; retained if the current row is deleted |
| `snapshot` | jsonb | Previous user-visible job state and provenance |
| `changed_at` | timestamptz | Server timestamp |
| `device_id` | uuid | Client installation ID, informational only |
| `change_kind` | text | `update`, `delete`, `restore`, `import` |
| `restored_from_revision_id` | uuid | Nullable self-reference |

**Rules**:

- Trigger writes the old snapshot before update/delete.
- Clients cannot update or delete revision rows.
- Restore verifies ownership, writes the selected snapshot to the job, and records the superseded current state as a new revision.

## Relationships

```text
auth.users 1 ── * jobs
jobs 1 ── * job_sources
job_sources 1 ── * source_checks
jobs * ── 0..1 duplicate_groups
jobs * ── * duplicate_pairs (two directed FKs stored in canonical order)
jobs 1 ── * job_revisions
```

## State transitions

### Job application status

Any status may transition to any other status because correction is user-controlled. Each transition:

1. validates account ownership;
2. records the prior job snapshot;
3. updates with a server timestamp;
4. publishes the resulting row to the user's subscribed clients.

### Source status

```text
unknown ──> active | closed | unreachable | unsupported
active  ──> closed | unreachable
closed  ──> active | unreachable
unreachable ──> active | closed | unsupported
```

A failed check sets `unreachable` only for that source, retains stored structured data, and never changes user fields.

### Duplicate decision

```text
suggested ──> confirmed | rejected
confirmed ──> rejected   (split)
rejected  ──> confirmed  (explicit user reversal)
```

Every user decision is reversible.

## RLS policy invariant

For each user-owned table:

- SELECT/DELETE: `auth.uid() is not null and auth.uid() = user_id`
- INSERT: `auth.uid() is not null and auth.uid() = user_id`
- UPDATE: both `USING` and `WITH CHECK` require `auth.uid() = user_id`
- Child-table writes also verify the referenced parent belongs to the same user.

Database tests must prove user A cannot read, insert under, update, restore, group, or delete user B's rows.

## Export and restore mapping

- Export excludes database auth tokens, provider API credentials, and Supabase-managed user records.
- Export includes schema version, generated time, jobs, sources, duplicate decisions/groups, and revisions needed for recovery.
- User IDs are omitted from the portable payload and rebound to the currently authenticated account on restore.
- Validation checks schema version, IDs, references, sizes, URL rules, enums, and duplicate IDs before any mutation.
- Commit revalidates and applies all changes in one transaction; existing IDs create revisions before replacement.
