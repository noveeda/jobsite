# Phase 0 Research: 공개 베타 준비

**Date**: 2026-08-07
**Feature**: 003-public-beta-readiness

## 1. Application shape and dependencies

**Decision**: Keep Node.js 24, Next.js 16 App Router, React 19, TypeScript strict mode, and Supabase. Add no dependency.

**Rationale**: Existing server routes, RLS storage, SQL functions, Zod, Vitest, pgTAP, Playwright, and platform logs cover every beta requirement. Another service, cache, queue, ORM, or monitoring SDK adds operations without required value.

**Alternatives considered**:

- Separate operations API: rejected because it duplicates authentication and deployment.
- Redis/Upstash counters: rejected because Postgres can enforce expected beta volume atomically.
- Monitoring SDK: deferred because sanitized JSON logs and platform alerts meet beta needs.

## 2. Versioned consent

**Decision**: Persist immutable, account-owned consent records in Postgres and compare them with server-configured current notice versions at every private-layout entry.

**Rationale**: Server timestamps and explicit versions prove what was accepted and synchronize across devices. A layout gate covers all private pages; public notices remain accessible without a session. Increasing any required version triggers re-consent.

**Alternatives considered**:

- Cookie-only consent: rejected because it is mutable and device-local.
- One profile boolean: rejected because it loses version history.
- Page-by-page checks: rejected because one missed page bypasses the rule.

## 3. Account and owned-data deletion

**Decision**: Require an exact phrase and authenticated session, delete application rows through an account-bound database function, then delete the Supabase Auth user through a server-only service-role client.

**Rationale**: Ordinary clients cannot administer Auth users. The privileged key is confined to the final server boundary. Explicit cascades and an idempotent function make owned-data deletion database-testable, while the existing portable export is offered first.

**Failure rule**: Never report success while Auth remains active. If rows are gone but Auth deletion fails, sign out where possible, return a retry/support state, and write only a sanitized reconciliation event.

**Alternatives considered**:

- Client-side admin call: rejected because it exposes the service-role key.
- Relying implicitly on Auth cascades: rejected because every application table must be explicitly verified.
- Soft deletion: rejected because permanent deletion is required.

## 4. Database-backed request limits

**Decision**: Use a fixed-window Postgres counter and atomic security-definer RPC keyed by verified user, operation, and window start. Return allowance, remaining count, and retry delay; risky operations fail closed.

**Rationale**: Database state is shared across deployment instances and survives restarts. Fixed windows are deterministic and sufficient for tens to hundreds of users. Account keys isolate usage.

**Rules**:

- Authenticate before consuming a limit and never trust caller-supplied identity.
- Apply strict limits to provider and destructive calls, moderate limits to mutations, import/export, and consent.
- Return HTTP 429 and Retry-After from routes.
- Opportunistically prune expired windows in bounded batches.

**Alternatives considered**:

- Process memory: rejected because counts reset and multiply per instance.
- IP-only keys: rejected because shared networks couple users and create additional personal-data handling.
- Sliding request logs: rejected because their row volume and cleanup are unnecessary.

## 5. Environment and secrets

**Decision**: Parse the server environment once with Zod and fail production startup for missing or unsafe settings. Reject production auth bypass, non-HTTPS public URLs, and enabled connectors without credentials.

**Rationale**: Silent fallback can turn a test bypass into universal access. One typed parser prevents inconsistent checks. Only Supabase public URL/key enter browser bundles; service-role and provider credentials remain server-only.

**Required production inputs**:

- Public HTTPS application URL
- Supabase URL and publishable key
- Supabase service-role key for deletion only
- Current terms, privacy, and source-notice versions
- Optional approved provider credentials only with their enable flag

**Alternatives considered**:

- Route-time checks only: rejected because a deployment can look healthy until a critical route runs.
- Permissive defaults: rejected because they hide legal and security omissions.

## 6. Health and security headers

**Decision**: Add a public uncached health route with a sub-two-second bounded storage probe and generic state. Apply production HSTS, MIME-sniff prevention, frame denial, strict referrer policy, and restrictive permissions policy. Add CSP only after Next.js and Supabase browser verification.

**Rationale**: Operators need readiness without leaking URLs, keys, schema details, or errors. Static headers cover the named browser threats without a package. A short timeout preserves the health target.

**Alternatives considered**:

- Raw environment/database details: rejected as disclosure.
- Probing job providers: rejected because provider outages must not mark core storage unavailable.
- Security-header package: rejected because Next config and the existing proxy suffice.

## 7. Safe logs and monitoring

**Decision**: Emit allowlisted one-line JSON to standard output and use deployment-platform retention, search, and alerts. Events contain only timestamp, request ID, operation, outcome, duration, status, and bounded error category.

**Rationale**: Allowlisting is safer than redacting arbitrary objects. Request IDs support incident correlation without identity or content, and platform monitoring adds no dependency.

**Never log**: bodies, URLs/query strings, cookies, authorization headers, keys, tokens, email, raw user IDs, job fields, memos, backup content, or raw production exceptions/stacks.

**Alternatives considered**:

- Logging request/error objects: rejected because nested secrets can escape.
- Database event storage: rejected because it mixes observability with user data and creates retention work.
- New SDK: deferred until platform monitoring proves insufficient.

## 8. Source attribution and isolation

**Decision**: Preserve provider, original URL, observation time, connector mode, and field provenance. Show Saramin provider attribution and an original-first notice; keep unapproved sources manual.

**Rationale**: This meets source conditions without expanding copied content. Provider failure or throttling remains metadata-only and cannot alter notes, status, schedule, or stored job data.

**Alternatives considered**:

- Generic unlabeled imports: rejected because origin is hidden.
- Copied content over original links: rejected because the original is authoritative.
- Key-presence activation: rejected because approval and an explicit flag are also required.

## 9. Backup, deployment, and incidents

**Decision**: Publish one operations runbook covering environment and OAuth setup, migration order, pre-migration backup, deploy smoke, rollback, managed daily backups, periodic restore drills, RPO/RTO, incident triage, secret rotation, rate-limit failure, connector shutdown, and partial deletion reconciliation.

**Rationale**: User JSON export provides portability but cannot recover the whole service or Auth. Repeatable operator steps and restore evidence satisfy the operational requirement.

**Alternatives considered**:

- User export as service backup: rejected because it lacks full database/Auth coverage.
- Generic automatic down migrations: rejected in favor of backward-compatible fixes plus verified backup; destructive migrations require explicit rollback.
- Containerization only for beta: rejected because the current Node deployment already meets the target.

## 10. Verification

**Decision**: Keep Vitest, pgTAP, and Playwright. Add environment/log helper tests; consent, counter, isolation and deletion database tests; and public notice, re-consent, export-first deletion, health timing, headers, attribution, 429, and safe-failure browser tests. Ubuntu Node 24 CI keeps provider calls disabled.

**Rationale**: The layers cover policy, database, and browser trust boundaries separately. A production-like manual smoke validates real OAuth, deployment configuration, backup availability, and deletion before invitations.

**Alternatives considered**:

- Browser-only tests: rejected because RLS and atomicity need direct assertions.
- Live provider CI: rejected because it is nondeterministic and consumes quota.
- Manual-only verification: rejected because these regressions are high impact.

## Resolved deployment inputs

No design clarification remains. Before opening access, the operator supplies finalized operator identity, privacy contact, notice effective date and versions, public HTTPS URL, Supabase production credentials, Google OAuth credentials, and separately approved provider credentials. Missing inputs keep startup or the relevant connector disabled.
