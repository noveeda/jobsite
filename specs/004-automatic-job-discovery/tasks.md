---
description: "자동 통합 채용공고 탐색의 의존성 순서 작업 목록"
---

# Tasks: 자동 통합 채용공고 탐색

**Input**: Design documents from specs/004-automatic-job-discovery/

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Constitution이 요구하는 출처 실패·중복 오판·개인 상태 보존·백업 복원에는 선행 테스트가 필수다. 각 사용자 스토리는 독립 인수 테스트를 가진다.

**Organization**: Setup과 Foundational 완료 후 P1부터 사용자 스토리 단위로 구현한다. [P]는 미완료 작업과 파일 충돌 없이 병렬 실행 가능한 작업이다.

## Phase 1: Setup and Migration History

**Purpose**: 원격과 저장소의 migration 이력을 안전하게 맞추고 기능 플래그·fixture 기반을 준비한다.

- [X] T001 Verify and commit the identical rename from supabase/migrations/006_job_history.sql to supabase/migrations/0060_job_history.sql as a clean migration-history checkpoint, confirm linked dry-run has zero pending migrations without linked repair, and record evidence in specs/004-automatic-job-discovery/validation.md before T006
- [X] T002 Reset the disposable local Supabase database against supabase/migrations/0060_job_history.sql and record local migration-list and pgTAP baseline in specs/004-automatic-job-discovery/validation.md
- [X] T003 [P] Add AUTOMATIC_DISCOVERY_ENABLED, COLLECTOR_ENABLED, CRON_SECRET, OPERATOR_USER_IDS, and canonical SARAMIN_API_KEY documentation to .env.example and validation to lib/environment.ts
- [X] T004 [P] Add two cursor-style fixture providers and deterministic catalog fixtures in lib/sources/fixtures/catalog.ts

**Checkpoint**: Repository, linked remote, and disposable local database agree on migration 0060; no remote repair is pending.

---

## Phase 2: Foundational Shared Infrastructure

**Purpose**: 모든 사용자 스토리가 의존하는 공용 카탈로그, 보안 경계, 멱등 수집 기반을 테스트 우선으로 만든다.

**⚠️ CRITICAL**: 이 단계가 끝나기 전 사용자 스토리 구현을 시작하지 않는다.

- [X] T005 [P] Write pgTAP schema, fail-closed RLS/grant, anonymous SELECT denial, operator-table denial, and service-role-only RPC tests for the shared catalog in supabase/tests/automatic_discovery_core.test.sql
- [X] T006 Create additive source_providers, canonical_jobs, source_postings, collection_runs, and provider_daily_usage tables plus indexes, ENABLE/FORCE RLS, and default-deny revokes in one transaction in supabase/migrations/20260808000100_automatic_discovery_core.sql
- [X] T007 Implement authenticated catalog read policies plus service-role-only claim-run, atomic-quota, idempotent-ingest, provider-disable, and retention-purge RPCs in supabase/migrations/20260808000200_automatic_discovery_security.sql
- [X] T008 Regenerate shared catalog and RPC types in lib/supabase/database.types.ts after the foundational migrations
- [X] T009 [P] Define provider capabilities, compliance, opaque cursor, normalized posting, and stable error types in lib/sources/provider-adapter.ts
- [X] T010 [P] Add Zod validation for provider configuration, collection request, and normalized postings in lib/validation/collection.ts
- [X] T011 [P] Add secret/URL-query redaction and operator allowlist denial regression tests in tests/unit/collector-secret-leakage.test.ts and tests/unit/operator-sources.test.ts
- [X] T012 Implement database-backed run lease and atomic daily quota clients in lib/collection/quota.ts
- [X] T013 Implement source fact/provenance normalization without raw-payload persistence in lib/collection/normalize.ts
- [X] T014 [P] Add regression tests proving existing manual jobs, backup v1, account deletion, and source refresh remain unchanged in tests/unit/automatic-discovery-legacy-regression.test.ts
- [X] T015 Add fail-closed discovery/collector configuration, requireOperator allowlist checks, operator-only provider status/disable page and action, and health signals in lib/environment.ts, lib/auth.ts, app/(dashboard)/settings/sources/page.tsx, app/(dashboard)/settings/sources/actions.ts, and app/api/health/route.ts

**Checkpoint**: Fresh database reset and foundational pgTAP tests pass; browser roles cannot mutate shared catalog; legacy behavior remains green.

---

## Phase 3: User Story 1 - 자동으로 모인 공고 둘러보기 (Priority: P1) 🎯 MVP

**Goal**: 신규 로그인 사용자가 직접 등록하지 않고 두 fixture 출처의 공고를 첫 화면에서 보고 원문과 출처를 확인한다.

**Independent Test**: 빈 개인 계정으로 로그인해 100개 이상의 fixture 공고가 보이고, 출처 하나가 실패해도 다른 공고와 cached data가 유지되며 모든 원문·귀속표시를 확인한다.

### Tests for User Story 1

- [X] T016 [P] [US1] Write provider contract tests for page cursors, normalization, quota cost, partial snapshots, and stable errors in tests/unit/provider-adapter.test.ts
- [X] T017 [P] [US1] Write collector tests for lease idempotency, bounded retry, hourly no-op before six-hour due time, freshness latency timestamps, provider isolation, threshold degradation, and missing/wrong CRON_SECRET, disabled collector, unsupported method, and zero admin/provider calls on rejection in tests/unit/catalog-collector.test.ts and tests/unit/collector-route.test.ts
- [X] T018 [P] [US1] Write pgTAP ingestion tests for upsert identity, conflicting source-value/provenance preservation, partial-run preservation, two-complete-run closure, permission-withdrawal/retention purge, forbidden-field removal, and personal-state survival in supabase/tests/automatic_discovery_ingest.test.sql
- [X] T019 [P] [US1] Replace manual-first E2E assertions with a no-input feed journey covering unauthenticated /jobs and detail redirects, preparing/ready-empty/partial/failed/degraded fixtures, cached-feed retention, threshold branding removal, and operator warning in tests/e2e/job-discovery.spec.ts
- [ ] T020 [P] [US1] Extend attribution tests for Saramin cards and details without depending on US4 merge behavior in tests/e2e/provider-attribution.spec.ts and tests/unit/provider-attribution.test.ts

### Implementation for User Story 1

- [X] T021 [P] [US1] Implement both deterministic fixture adapters against lib/sources/provider-adapter.ts in lib/sources/fixtures/adapters.ts
- [X] T022 [P] [US1] Extend the Saramin adapter from ID preview to paged catalog discovery with SARAMIN_API_KEY, count 110, safe timeout, and redacted errors in lib/sources/saramin.ts
- [X] T023 [US1] Implement six-hour due-provider claim under hourly invocation, fetch-page loop, transactional upsert, freshness timestamps, retry, closure, and idempotent retention-purge orchestration in lib/collection/collect.ts
- [X] T024 [US1] Implement CRON_SECRET-protected bounded POST collection in app/api/cron/collect/route.ts
- [X] T025 [US1] Add the shared catalog read path without personal_job_states, compute provider/job-count threshold health, and return feed health in app/(dashboard)/jobs/queries.ts
- [X] T026 [US1] Render automatic catalog cards, source freshness, original links, preparing/ready-empty/partial/failed/degraded states, cached-feed banners, degraded branding removal, and 44px navigation/job-link controls in components/job-list.tsx, components/provider-attribution.tsx, components/feed-status.tsx, components/app-shell.tsx, app/(dashboard)/jobs/loading.tsx, app/(dashboard)/jobs/error.tsx, and app/globals.css
- [X] T027 [US1] Make /jobs the authenticated default automatic feed while keeping /jobs/new as a secondary path in app/(dashboard)/jobs/page.tsx and components/app-shell.tsx

**Checkpoint**: US1 works with fixture providers and without any real external key; direct job creation is not required.

---

## Phase 4: User Story 2 - 원하는 조건으로 좁히기 (Priority: P2)

**Goal**: 사용자가 URL에 유지되는 검색·필터·정렬과 30개 단위 더 보기로 공고를 빠르게 좁힌다.

**Independent Test**: 1,000개 fixture에서 조합 필터, 결측값 수, 결정적 정렬, 30→60 더 보기, 전체 초기화, 상세 복귀 초점이 재현 가능하게 동작한다.

### Tests for User Story 2

- [X] T028 [P] [US2] Write parser tests for defaults, allowed filters, take multiples/cap, and filter-reset behavior in tests/unit/feed-query.test.ts
- [X] T029 [P] [US2] Write pgTAP tests for database filtering, missing-value exclusion, deterministic ordering, and user-independent sort in supabase/tests/automatic_discovery_feed.test.sql
- [X] T030 [P] [US2] Add E2E coverage for combined filters, URL persistence, 30→60 results, zero state, and detail-return focus in tests/e2e/job-discovery.spec.ts
- [X] T031 [P] [US2] Add repeated representative 1,000-row search/filter runs with warm-up exclusion and calculated p95 under two seconds in tests/e2e/performance.spec.ts

### Implementation for User Story 2

- [X] T032 [P] [US2] Implement validated q, region, role, career, employment, deadline, source, sort, includeExcluded, saved, and take parsing in lib/validation/feed.ts
- [X] T033 [US2] Add indexed catalog feed query/RPC with total, missing counts, and stable ordering in supabase/migrations/20260808000300_automatic_discovery_feed.sql
- [X] T034 [US2] Replace in-memory filtering with database range/filter queries in app/(dashboard)/jobs/queries.ts
- [X] T035 [US2] Implement shared desktop/mobile GET filter form, applied chips, count, reset, and 44px controls in components/filters.tsx and app/(dashboard)/jobs/page.module.css
- [X] T036 [US2] Implement explicit more-results links, hash-based return focus, and 44px more/back controls in components/job-list.tsx, components/job-focus-restorer.tsx, app/(dashboard)/jobs/[id]/page.tsx, and app/globals.css

**Checkpoint**: US2 can be verified against fixture data without enabling a real provider.

---

## Phase 5: User Story 3 - 관심 공고와 지원 진행 관리 (Priority: P3)

**Goal**: 공용 공고를 복제하지 않고 사용자별 저장·제외·지원상태·메모를 안전하게 관리하고 백업한다.

**Independent Test**: 한 사용자의 상태가 다른 사용자에게 보이지 않고, 공고 종료·출처 실패·재로그인·백업 복원 후에도 메모와 지원상태가 유지된다.

### Tests for User Story 3

- [X] T037 [P] [US3] Write owner-RLS, closed-source preservation, and account-deletion pgTAP tests in supabase/tests/personal_job_states.test.sql
- [X] T038 [P] [US3] Write Server Action validation and failed-write recovery tests in tests/unit/personal-job-state.test.ts
- [X] T039 [P] [US3] Add save-to-saved-only-view, exclude/restore, status, memo, failed-write feedback, cross-user, and source-closure E2E cases in tests/e2e/application-tracking.spec.ts
- [X] T040 [P] [US3] Add backup v1 compatibility and idempotent v2 restore tests in tests/unit/backup.test.ts and supabase/tests/backup_restore_v2.test.sql

### Implementation for User Story 3

- [X] T041 [US3] Add personal_job_states with owner RLS and state-preserving constraints in supabase/migrations/20260808000400_personal_job_states.sql
- [X] T042 [US3] Regenerate personal state types in lib/supabase/database.types.ts
- [X] T043 [P] [US3] Add personal-state input validation in lib/validation/personal-job-state.ts
- [X] T044 [US3] Implement save, exclude/restore, status, memo, and next-action Server Actions in app/(dashboard)/jobs/personal-actions.ts
- [X] T045 [US3] Overlay sparse personal state and saved-only filtering without changing the common deterministic feed sort in app/(dashboard)/jobs/queries.ts and app/(dashboard)/jobs/[id]/page.tsx
- [X] T046 [US3] Add personal controls, status badges, saved-only view/count, failure feedback, excluded-job management, and 44px save/restore controls in components/job-detail.tsx, components/job-list.tsx, components/filters.tsx, app/(dashboard)/jobs/page.tsx, and app/globals.css
- [ ] T047 [US3] After T051, T060, and T063, implement backup v2 personal-state export/validate/transactional restore while retaining v1 import in lib/domain/backup.ts, lib/validation/backup.ts, app/api/export/route.ts, app/api/import/validate/route.ts, app/api/import/commit/route.ts, and the immutable supabase/migrations/20260808000700_backup_v2.sql

**Checkpoint**: US3 personal data is isolated, recoverable, and independent of shared posting lifecycle.

---

## Phase 6: User Story 4 - 중복과 출처 확인하기 (Priority: P4)

**Goal**: 교차 출처 유사 공고를 후보로만 제시하고 사용자가 개인 화면에서 병합·분리하며 모든 출처와 상태를 보존한다.

**Independent Test**: 동일 채용 fixture가 후보로 나타나고 자동 병합되지 않으며, 사용자 병합·되돌리기 후 원문과 개인 상태 손실이 0건이다.

### Tests for User Story 4

- [ ] T048 [P] [US4] Write candidate scoring, ordered-pair identity, and no-auto-merge tests in tests/unit/catalog-duplicates.test.ts
- [ ] T049 [P] [US4] Write owner-RLS, decision history, and reversible merge pgTAP tests in supabase/tests/catalog_duplicate_decisions.test.sql
- [ ] T050 [P] [US4] Add candidate, merge, separate, undo, merged-group attribution, conflicting deadline/location provenance with observed times, issue-report feedback, and state-preservation E2E coverage in tests/e2e/duplicates.spec.ts

### Implementation for User Story 4

- [ ] T051 [US4] Add duplicate_candidates, personal_duplicate_decisions, and source_issue_reports with grants/RLS in supabase/migrations/20260808000500_duplicate_decisions.sql
- [ ] T052 [US4] Regenerate duplicate and issue-report types in lib/supabase/database.types.ts
- [ ] T053 [P] [US4] Implement explainable candidate scoring without automatic grouping in lib/domain/catalog-duplicates.ts
- [ ] T054 [US4] Generate/update candidates after successful source upserts in lib/collection/collect.ts
- [ ] T055 [US4] Implement decide, separate, revert, and source-issue Server Actions in app/(dashboard)/jobs/duplicate-actions.ts
- [ ] T056 [US4] Render candidate reasons, all provider attributions, field-level source/observed-time conflicts, merge choice, undo history, and source-issue report form with success/failure feedback in components/duplicate-panel.tsx, components/job-detail.tsx, and app/(dashboard)/jobs/[id]/page.tsx

**Checkpoint**: Cross-provider automation stops at candidate generation and every user decision is reversible.

---

## Phase 7: User Story 5 - 자동 범위 밖 공고 보완하기 (Priority: P5)

**Goal**: 자동 피드에 없는 URL을 보조적으로 등록하고, 나중에 일치하는 자동 공고와 개인 상태 손실 없이 연결한다.

**Independent Test**: 수동 공고를 추가·보완한 후 정확히 일치하는 provider identity를 연결하고 해제해도 기존 메모·상태가 유지되며 주 피드가 수동 입력을 요구하지 않는다.

### Tests for User Story 5

- [ ] T057 [P] [US5] Write legacy bridge constraints, owner RLS, and unlink preservation tests in supabase/tests/legacy_job_links.test.sql
- [ ] T058 [P] [US5] Add secondary manual-registration, failed preview recovery, exact-link, and unlink E2E coverage in tests/e2e/job-registration.spec.ts
- [ ] T059 [P] [US5] Add backup v2 manual-link portability tests in tests/unit/backup.test.ts

### Implementation for User Story 5

- [ ] T060 [US5] Add legacy_job_links and exact-provider link/unlink RPCs in the new immutable supabase/migrations/20260808000600_legacy_links.sql before the backup v2 restore migration
- [ ] T061 [US5] Regenerate legacy bridge types in lib/supabase/database.types.ts
- [ ] T062 [US5] Connect existing manual jobs to exact automatic source identities in app/(dashboard)/jobs/actions.ts and app/(dashboard)/jobs/queries.ts
- [ ] T063 [US5] Preserve personal status during link/unlink and v2 restore in lib/domain/backup.ts and app/(dashboard)/jobs/personal-actions.ts
- [ ] T064 [US5] Move manual registration to a secondary navigation action and explain its fallback role in components/app-shell.tsx and app/(dashboard)/jobs/new/page.tsx

**Checkpoint**: Manual URL registration complements but never gates automatic discovery.

---

## Phase 8: Operations, Second Source, and Cross-Cutting Quality

**Purpose**: 실제 허용 출처, 예약 실행, 접근성, Linux, 운영·출시 게이트를 완성한다.

- [X] U5 Add a restricted source-provider approval record and server-side activation resolver that fails closed before Saramin preview, refresh, and catalog fetches; document evidence without credentials in `supabase/migrations/20260809001000_source_activation_gate.sql`, `lib/sources/activation.ts`, and `docs/operations/source-approvals.md`
- [ ] T065 After T003 and T024, add a hosted-only hourly Supabase Cron/pg_net schedule with Vault URL/CRON_SECRET preflight, six-hour provider due checks, local-reset no-op guard, and rollback instructions in supabase/migrations/20260808000800_schedule_collection.sql and docs/operations/deploy.md
- [ ] T066 [P] Add cron invocation, lease expiry, quota exhaustion, provider disable, stale hiding, and rollback procedures in docs/operations/incident-response.md and docs/operations/rollback.md
- [ ] T067 [P] Verify Work24 access eligibility and written permission, and record only the approval or denial reference, terms, attribution, and retention decision in docs/operations/source-approvals.md without implementing or enabling an unapproved connector
- [ ] T068 After T067 approval, implement and contract-test the Work24 adapter in lib/sources/work24.ts and tests/unit/provider-adapter.test.ts, then add two-provider, 100-active-job, attribution, freshness, and unauthorized-access gates in docs/operations/launch-checklist.md
- [ ] T069 [P] Extend accessibility E2E for WCAG 2.2 AA, keyboard completion, live status, 360px no-overflow, and 44px nav/job/more/save/restore/back/filter controls in tests/e2e/accessibility.spec.ts
- [ ] T070 [P] Add source-outage, partial-run, permission-withdrawal purge, forbidden-field removal with personal-state survival, 24-hour stale hiding, threshold degradation, all feed states, and cached-feed operational E2E coverage in tests/e2e/operational-safety.spec.ts
- [ ] T071 [P] Add Ubuntu Node 24 fresh Supabase reset, pgTAP, build, and Chromium E2E gates while retaining Windows checks in .github/workflows/ci.yml
- [ ] T072 Regenerate and verify Linux case-sensitive imports, generated database types, and OS-neutral scripts through package.json and specs/004-automatic-job-discovery/validation.md
- [ ] T073 Run npm run lint, npm run typecheck, npm run test:unit, npx supabase test db, npm run build, and npm run test:e2e and record exact results in specs/004-automatic-job-discovery/validation.md
- [ ] T074 Run the complete Windows/Ubuntu quickstart plus a privacy-safe representative-user trial of at least 10 participants, and record two-minute success rate and deviations in specs/004-automatic-job-discovery/validation.md
- [ ] T075 Verify actual approved Saramin and Work24 identities, at least 100 active rows, attribution, request-log redaction, and repeated discovery-to-feed freshness p95 without recording keys in tests/e2e/provider-attribution.spec.ts and specs/004-automatic-job-discovery/validation.md
- [ ] T076 Obtain Saramin cache/retention/free-service confirmation, confirm both provider approvals and operator disable recovery, record only approval references in docs/operations/source-approvals.md, and sign off docs/operations/launch-checklist.md before Production enablement

**Checkpoint**: The feature is service-ready only after actual two-source permission and all launch gates pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: starts immediately; T001 precedes T002 and all new migrations.
- **Phase 2 Foundation**: depends on Phase 1; blocks all user stories.
- **US1**: depends on Foundation and produces the MVP automatic feed without personal-state table dependencies.
- **US2**: depends on the US1 catalog read path; filter tests and validation can start after Foundation.
- **US3**: depends on Foundation and catalog IDs; can run in parallel with US2 after US1 query shape stabilizes.
- **US4**: depends on US1 source postings and US3 personal state.
- **US5**: depends on US1 catalog identity and US3 backup/personal state.
- **Operations**: scheduler design can begin after Foundation, but T065 waits for T003, T024, hosted Vault preflight, and an explicit non-local activation guard; production activation waits for actual approvals.

### User Story Dependency Graph

~~~text
Setup → Foundation → US1 ─┬→ US2
                          ├→ US3 ─┬→ US4
                          │       └→ US5
                          └────────→ Operations
US2 + US3 + US4 + US5 ────────────→ Final launch gate
~~~

### Within Each User Story

- Tests marked for the story are written first and must fail for the missing behavior.
- Schema/types precede queries and actions.
- Services precede route/UI integration.
- Story checkpoint must pass before its implementation is treated as complete.
- No real provider is enabled before permission, attribution, retention, and secret gates are recorded.

## Parallel Opportunities

### Setup

- T003 environment contract and T004 fixtures can run in parallel after T001 starts.
- T002 local reset waits for T001.

### Foundation

- T005, T009, T010, T011, and T014 touch separate test/type files and can run in parallel.
- T006 → T007 → T008 is the schema chain.
- T012 and T013 begin after T007/T009 contracts stabilize.

### US1 Example

~~~text
Parallel first:
- T016 provider contract tests
- T017 collector tests
- T018 pgTAP ingest tests
- T019 automatic-feed E2E
- T020 attribution tests
- T021 fixture adapters
- T022 Saramin catalog adapter

Then:
T023 collection coordinator → T024 cron route
T025 feed query → T026 feed UI → T027 default navigation
~~~

### US2 Example

~~~text
Parallel first: T028, T029, T030, T031, T032
Then: T033 → T034 → T035 and T036
~~~

### US3 Example

~~~text
Parallel first: T037, T038, T039, T040, T043
Then: T041 → T042 → T044/T045 → T046; defer T047 until T051 → T060 → T063 are complete
~~~

### US4 and US5

- After US3, US4 tests T048~T050 run in parallel with US5 tests T057~T059.
- US4 domain scoring T053 can run parallel to migration T051.
- Operations documentation, permission research, and Linux CI tasks marked [P] can run while UI stories finish; T065 and T068 remain dependency-gated.

## Implementation Strategy

### MVP First

1. Phase 1 migration history safety
2. Phase 2 shared foundation
3. US1 fixture-based automatic feed
4. Stop and validate US1 independently
5. Deploy behind AUTOMATIC_DISCOVERY_ENABLED=false
6. Enable only in staging after one permitted source is available

### Incremental Delivery

1. US1: automatic feed and source transparency
2. US2: search/filter/load-more
3. US3: personal state and backup
4. US4: user-controlled duplicate handling
5. US5: manual fallback bridge
6. Operations: real second source, scheduler, Linux, launch gate

### Subagent Execution Strategy

- Agent A: schema, RLS, migration and pgTAP chain
- Agent B: provider adapter, collector, quota and scheduler
- Agent C: feed UI, accessibility and Playwright
- Root agent: contracts, integration, migration safety, conflict review and final verification

Agents must not edit the same file concurrently. Schema-generated database.types.ts and shared job-list/query files are serialized integration points.

## Notes

- Every checklist item includes an ID and concrete file path.
- [P] indicates file-safe parallel work, not permission to bypass dependencies.
- The linked remote already has 0060; do not run linked migration repair.
- Actual Saramin key remains server-only as SARAMIN_API_KEY.
- Work24 implementation and activation are conditional on T067 permission evidence; denial triggers selection of another permitted second provider and blocks only the public two-source launch, not fixture-based MVP.
- Commit after each migration or coherent story checkpoint.
