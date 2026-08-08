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
- Purge pgTAP: 47/47 PASS; personal_job_states row, status, and memo survive purge
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
- T018 is complete; ingest and purge postconditions include personal_job_states survival
- T020 remains open until approved Saramin attribution can run without fixme
- Linux/Ubuntu gates remain explicitly scheduled in T071–T072

## T018, T037–T046 — Personal catalog state

- Date: 2026-08-09 (Asia/Seoul)
- Progress: 45/76 tasks complete
- Data model: sparse `personal_job_states` overlay with owner-only ENABLE/FORCE RLS, account cascade, catalog retention, seven application states, 10,000-character memo limit, and next-action timestamp
- Feed behavior: save, exclude/restore, saved-only, closed/withdrawn retention, deterministic common ordering, and six faceted missing-value counts apply personal policy before count, sort, and limit
- Pagination regression: 1,021 newer excluded fixtures do not truncate later visible jobs; total and hasMore remain accurate through take 1020
- Detail/action security: latest-consent authenticated RPC, revoked common RPCs, current-user Server Actions, generic failure responses, and no memo in list payloads
- UX: status badges, editable memo/next action, explicit offline retry, per-card accessible exclusion names, 44×44 controls, and UTC/local datetime round-trip across standard and daylight-saving offsets
- Purge safety: JSON array functions receive CASE-guarded arrays; scalar/object source values cannot abort the purge transaction; personal state survives source scrub
- Backup compatibility: v1 remains GREEN; eight v2 restore assertions are explicit TODO until dependency-gated T047 after T051, T060, and T063
- `npm run verify`: PASS — ESLint, TypeScript, 37 unit files / 257 tests, Next.js 16.3.0 production build
- Full pgTAP: PASS — 17 files / 348 tests, including the eight expected T047 TODO assertions
- Focused Chromium E2E: PASS — 29/29 across personal tracking, automatic discovery, filters/pagination/focus, accessibility, and manual-registration regression
- Database lint: PASS — zero findings
- `git diff --check`: PASS (Windows line-ending warnings only)
- Independent final review: 0 Critical, 0 High, 0 Medium, 0 Low findings
- External provider calls: zero; Saramin approval remains pending
- Remote Supabase database: not modified
- Compound-engineering fallback: `compound-engineering` skill was unavailable, so reusable root causes, guardrails, and proof commands are persisted in `docs/engineering/lessons-learned.md` and required by `AGENTS.md`

## U4 — Dormant hosted collection schedule

- Migration `20260809000900_schedule_collection.sql` creates no cron job by default and is service-role-only for provision, enable, and disable operations.
- Local, test, preview, and staging enablement return a no-op; production requires an immutable provisioned marker, an exact HTTPS origin, one Vault URL value equal to that origin, and one non-empty Vault cron secret.
- The stored cron command is exactly `select public.invoke_collection_schedule();`; the helper reads Vault internally, returns `void`, and never logs or returns its secret.
- `supabase/tests/schedule_collection.test.sql` uses only transaction-local fake cron/Vault fixture values. It creates no hosted schedule, provider request, or real secret.
- Operator evidence remains required before production enablement: approved source gates, protected staging collector smoke, health/OAuth validation, quota/lease review, and a documented disable/rollback owner.
