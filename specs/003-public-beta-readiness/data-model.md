# Data Model: 공개 베타 준비

**Feature**: `003-public-beta-readiness`
**Date**: 2026-08-07

## Design invariants

- `auth.users.id` remains the only account identity. Both new tables reference it with `on delete cascade`, so deleting the Supabase Auth user removes consent and request-usage records together with all existing user-owned rows.
- Ownership is derived from `auth.uid()` only. A request body never supplies an authoritative user ID.
- `account_consents` is append-only. A policy version change creates another record rather than rewriting evidence of an earlier acceptance.
- `request_usage` is writable only through `consume_rate_limit`; clients receive a decision, not raw usage rows.
- RLS is enabled and forced on both tables. Security-definer functions use `set search_path = public, pg_temp`, reject a null `auth.uid()`, and receive execute permission only for the intended role.
- Neither table stores IP addresses, user agents, OAuth tokens, cookies, provider keys, request bodies, job content, or free-form user text.

## Enumerations

### `rate_limit_action`

```text
source_preview | source_refresh | import_validate | import_commit | consent_write | account_delete
```

The enumeration is closed. Adding an operation requires a migration that also defines its window and maximum in `consume_rate_limit`.

## Tables

### 1. `account_consents`

Immutable evidence that an authenticated user accepted the exact mandatory notices current at that time.

| Field | Type | Rules |
|---|---|---|
| `id` | uuid | Primary key, `gen_random_uuid()` |
| `user_id` | uuid | Required FK to `auth.users(id)` on delete cascade |
| `terms_version` | text | Required, 1-40 ASCII letters, digits, `.`, `_`, or `-` |
| `privacy_version` | text | Required, same format as `terms_version` |
| `accepted_at` | timestamptz | Required server time, default `now()`; client cannot supply or update it |

**Constraints and indexes**:

- Unique `(user_id, terms_version, privacy_version)` makes a repeated acceptance idempotent.
- Index `(user_id, accepted_at desc)` supports the dashboard consent gate.
- Versions are opaque deployment identifiers such as `2026-08-07`; the application owns the required current pair.

**RLS and privileges**:

- `SELECT`: `auth.uid() = user_id`.
- Direct `INSERT`, `UPDATE`, and `DELETE` by `anon` or `authenticated` are revoked.
- `POST /api/consents` records acceptance through a narrowly scoped database function or server transaction that binds `user_id = auth.uid()` and uses database time.
- Only deletion of the parent Auth user removes consent rows.

**Current-consent rule**:

A user is current only when at least one row matches both server-configured required versions. Matching the terms version alone or privacy version alone is insufficient. A deployment that changes either required version immediately returns existing users to the consent screen without altering their previous rows.

### 2. `request_usage`

Durable, per-account fixed-window counters for operations that mutate data or consume an external service quota.

| Field | Type | Rules |
|---|---|---|
| `user_id` | uuid | Required FK to `auth.users(id)` on delete cascade |
| `action` | `rate_limit_action` | Required |
| `bucket_start` | timestamptz | Required UTC start of the fixed window |
| `request_count` | integer | Required, `1..maximum(action)` |
| `updated_at` | timestamptz | Required server time, updated on every accepted consumption |

**Primary key**: `(user_id, action, bucket_start)`.

**RLS and privileges**:

- RLS is enabled and forced; no direct row policy is granted to `anon` or `authenticated`.
- Direct table privileges are revoked from `public`, `anon`, and `authenticated`.
- Only `consume_rate_limit(rate_limit_action)` may insert or increment counters.
- The function determines the account from `auth.uid()` and never accepts a user ID, maximum, window, count, or timestamp from its caller.

**Retention**:

- Buckets older than 48 hours may be deleted by an operator-owned scheduled job.
- Retention cleanup is not part of a request transaction and cannot increase or reset a current bucket.

## `consume_rate_limit` RPC

### Signature

```sql
public.consume_rate_limit(target_action public.rate_limit_action)
returns table (
  allowed boolean,
  limit_value integer,
  remaining integer,
  reset_at timestamptz,
  retry_after_seconds integer
)
```

### Fixed policy

| Action | Window | Maximum accepted requests |
|---|---:|---:|
| `source_preview` | 1 minute | 10 |
| `source_refresh` | 30 minutes | 30 |
| `import_validate` | 1 hour | 10 |
| `import_commit` | 1 hour | 3 |
| `consent_write` | 1 hour | 10 |
| `account_delete` | 1 hour | 3 |

### Transaction rules

1. Reject a missing authenticated identity before reading or writing a counter.
2. Select the window and maximum from the closed action mapping above.
3. Calculate `bucket_start` from database UTC time; caller time is ignored.
4. Atomically insert count `1` or increment the current row only while it is below the maximum.
5. Return `allowed=false`, `remaining=0`, the exact `reset_at`, and a positive ceiling-rounded `retry_after_seconds` when no increment occurred.
6. Concurrent calls for the same account, action, and bucket serialize on the primary-key row. At most the configured maximum can return `allowed=true`.
7. A storage or RPC failure is fail-closed for provider calls, imports, consent writes, and account deletion; the HTTP layer returns `503 RATE_LIMIT_UNAVAILABLE` and performs no protected operation.

`execute` is revoked from `public` and `anon` and granted to `authenticated`. Because the limits are internal constants, a direct authenticated RPC caller cannot raise or reset a quota.

## Relationships

```text
auth.users 1 ── * account_consents
auth.users 1 ── * request_usage
auth.users 1 ── * existing jobs, sources, checks, duplicate records, and revisions
```

Deleting one `auth.users` row is the single account-lifecycle root operation. PostgreSQL foreign-key cascades remove all referenced public rows. No application loop enumerates or deletes child tables independently.

## Account deletion invariant

The authenticated route verifies the session, same-origin request, recent sign-in, exact confirmation phrase, and rate-limit decision before using the server-only Supabase Admin client to delete precisely `auth.uid()`. `SUPABASE_SERVICE_ROLE_KEY` is never present in browser code, a `NEXT_PUBLIC_*` variable, a response, or a log.

Successful deletion means:

- the Auth user no longer exists;
- all existing user-owned tables plus `account_consents` and `request_usage` contain zero rows for that identity through `on delete cascade`;
- the current response clears authentication cookies;
- subsequent requests with the former session cannot pass `getUser()`.

An admin deletion failure returns an error and is never reported as success. A concurrent second deletion that observes the same user already absent is treated as an idempotent success and reveals no information about another account.

## Required database verification

- User A cannot read consent or usage rows belonging to user B.
- Authenticated and anonymous clients cannot directly insert, update, delete, or truncate request counters.
- Repeated consent for an identical version pair creates one row; accepting a new pair preserves the old row.
- One more concurrent consumption than each maximum yields exactly the maximum number of allowed decisions.
- A failed/denied consumption does not execute its protected operation.
- Deleting an Auth user cascades through both new tables and every pre-existing user-owned table.
