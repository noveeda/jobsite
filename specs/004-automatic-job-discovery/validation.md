# Implementation Validation

## T001 — Migration history checkpoint

- Date: 2026-08-08 (Asia/Seoul)
- Branch: codex/initial-implementation
- Rename: supabase/migrations/006_job_history.sql → supabase/migrations/0060_job_history.sql
- Git blob before rename: 0c99b1733c97e32e97de9964a9cdac81bd164ee0
- Git blob after rename: 0c99b1733c97e32e97de9964a9cdac81bd164ee0
- Content identity: PASS
- Linked migration list: local and remote both contain 0060
- Linked dry-run: upToDate=true, zero pending migrations
- Linked repair: not run and not required

## T002 — Disposable local reset

- Date: 2026-08-08 (Asia/Seoul)
- Target: local PostgreSQL at 127.0.0.1:54322
- Docker server: 29.6.2
- Reset: PASS
- Local migration list: 001, 002, 003, 004, 005, 0060, 0061, 007, 008, 009
- pgTAP baseline: PASS
- pgTAP result: 10 files, 114 tests, all successful
- Remote database: not modified

## T003–T004 — Approval-independent setup

- Date: 2026-08-08 (Asia/Seoul)
- Environment validation: feature flags default off; collector secret and operator UUIDs fail closed
- Secret exposure: no real values committed; server-only secret and provider key omitted from validator return
- Fixture providers: two deterministic cursor styles, 60 records each, 120 active records total
- Intentional cross-provider duplicate signatures: 1
- External API calls: none
- Vitest: 21 files, 96 tests, all successful
- TypeScript typecheck: PASS
- ESLint: PASS
## T005–T010 — Shared catalog foundation

- Date: 2026-08-08 (Asia/Seoul)
- Core schema: five additive shared catalog tables with ENABLE/FORCE RLS and default-deny grants
- Security RPCs: provider-wide lease, atomic quota, allowlisted ingest, provider disable, provenance-aware purge
- Authenticated visibility: consented catalog read passes without exposing provider operations tables
- Provider contracts: capabilities, compliance, cursor, normalized posting, provenance, stable retry-safe errors
- Validation: UTC/HTTPS, Saramin limits, retention allowlist, recursive secret/URL checks, complete matching provenance
- Generated Supabase types: includes shared tables and service-only RPCs
- Local reset: PASS
- pgTAP: 11 files, 148 tests, all successful
- Vitest unit: 23 files, 116 tests, all successful
- TypeScript typecheck: PASS
- ESLint: PASS
- Production build: PASS
- External provider calls: none

## T011–T017, T019, T021–T036 — Fixture catalog discovery, filtering, and purge hardening

- Date: 2026-08-09 (Asia/Seoul)
- Collector boundaries: fail-closed configuration, operator allowlist, six-hour lease, atomic quota, bounded page loop, provider isolation, normalized source facts, and redacted stable errors
- Real-provider state: Saramin remains approvalStatus=pending, enabled=false, and absent from the runtime registry; external provider calls were zero
- Feed security: authenticated feed/detail RPCs require the exact latest terms/privacy consent and enforce the same 24-hour stale canonical/source freshness boundary
- Feed UX: automatic /jobs default, manual /jobs/new secondary path, preparing/ready-empty/partial/failed/degraded states, cached-feed copy, GET filters/chips, 30-item pagination, safe return focus, and 44×44 controls
- Performance fixture: deterministic 1,000 rows; seven representative runs with the first warm-up excluded; calculated p95 under two seconds; external browser requests zero
- Vitest unit: 36 files, 234 tests, all successful
- Purge hardening: only source rows outside the exact scrub postcondition are updated; the RPC return and audit counts equal the actual source-row changes
- Canonical repair: provenance, lifecycle, paired career/deadline fields, postedAt, and strictly validated field-level survivor fallbacks are repaired even when source rows already satisfy the scrub postcondition
- Purge idempotency/audit: source and canonical full postcondition returns 0 without audit; canonical-only repair records `cursor.canonicalRepaired` while preserving source-only count semantics
- Purge security: service-role-only `SECURITY DEFINER` wrapper with a fixed search path; the legacy unchecked function is revoked and never called
- Purge pgTAP: 46/46 PASS; one expected TODO remains for personal_job_states purge survival after T041
- Core + ingest regression pgTAP: 64/64 PASS
- Full pgTAP: 14 files, 286 tests, all successful
- Independent purge review: 0 Critical, 0 High, 0 Medium findings
- Automatic discovery E2E: 8/8 PASS
- Combined filter/pagination/zero-state/detail-focus E2E: 4/4 PASS
- Accessibility-focused automatic feed E2E: 4/4 PASS
- Manual registration regression E2E: 1/1 PASS
- TypeScript typecheck: PASS
- ESLint: PASS
- Production build: PASS
- git diff --check: PASS (Windows line-ending warnings only)
- T018 remains open until purge postconditions and personal_job_states survival are complete
- T020 remains open until approved Saramin attribution can run without fixme
- Linux/Ubuntu gates remain explicitly scheduled in T071–T072
