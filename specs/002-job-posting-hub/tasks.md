# Tasks: 개인용 통합 채용공고 허브

**Input**: Design documents from `/specs/002-job-posting-hub/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Constitution이 요구하는 데이터 격리, 출처 실패 복구, 중복 판단, 변경 이력, 동기화 충돌, 내보내기·복원 검증은 구현보다 먼저 작성한다. 외부 제공자의 실제 API는 자동 테스트에서 호출하지 않는다.

**Organization**: 작업은 사용자 스토리별로 묶으며, 각 스토리는 해당 단계까지 완료했을 때 독립적으로 검증 가능해야 한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 미완료 작업과 파일 충돌 없이 병렬 수행 가능
- **[Story]**: 명세의 사용자 스토리 (`US1`–`US5`)
- 모든 작업은 구현 또는 검증 대상의 정확한 파일 경로를 포함한다.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 단일 Next.js 애플리케이션과 운영체제 독립적인 개발 기반 구성

- [X] T001 Initialize a single Next.js App Router project with React, TypeScript strict mode, Node.js 24 LTS, and npm metadata in `package.json`, `tsconfig.json`, and `.nvmrc`
- [X] T002 Install only the planned runtime dependencies (`@supabase/supabase-js`, `@supabase/ssr`, Zod 4) and test dependencies (Vitest, Playwright) in `package.json`
- [X] T003 [P] Configure lint, typecheck, unit, E2E, build, and aggregate verification scripts using cross-platform npm commands in `package.json`, `eslint.config.mjs`, and `vitest.config.ts`
- [X] T004 [P] Create the planned application directories and shared root layout in `app/layout.tsx`, `components/`, `lib/`, `supabase/migrations/`, `supabase/tests/`, `tests/unit/`, `tests/e2e/`, and `tests/fixtures/sources/`
- [X] T005 [P] Document public and server-only configuration with disabled source connectors by default in `.env.example` and exclude local secrets in `.gitignore`
- [X] T006 [P] Configure Playwright Chromium and a local Next.js test server without live provider access in `playwright.config.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 사용자 스토리에 필요한 인증, 데이터 소유권, 검증 및 공통 UI 기반

**⚠️ CRITICAL**: 이 단계가 완료되기 전에는 사용자 스토리 구현을 시작하지 않는다.

### Tests for Foundational Security and Data Rules ⚠️

- [X] T007 [P] Write pgTAP tests proving account A cannot select, insert under, update, group, restore, or delete account B records in `supabase/tests/rls_isolation.test.sql`
- [X] T008 [P] Write pgTAP tests for job constraints, provenance values, HTTPS source URLs, canonical source uniqueness, and child ownership in `supabase/tests/schema_constraints.test.sql`
- [X] T009 [P] Write unit tests for job input boundaries and field provenance transitions in `tests/unit/jobs-validation.test.ts` and `tests/unit/provenance.test.ts`

### Implementation for Foundational Infrastructure

- [X] T010 Create database enums, `jobs`, `job_sources`, `source_checks`, `duplicate_groups`, `duplicate_pairs`, and `job_revisions` with indexes and constraints in `supabase/migrations/001_initial_schema.sql`
- [X] T011 Add `updated_at`, immutable revision snapshot, and child ownership database functions and triggers in `supabase/migrations/002_functions_and_triggers.sql`
- [X] T012 Enable RLS and account-scoped policies on every user-owned table, including referenced-parent ownership checks, in `supabase/migrations/003_rls_policies.sql`
- [X] T013 Configure Realtime publication only for account-scoped job, source, duplicate, and revision tables in `supabase/migrations/004_realtime.sql`
- [X] T014 [P] Create browser and server Supabase clients and generated-type placeholder workflow in `lib/supabase/client.ts`, `lib/supabase/server.ts`, and `lib/supabase/database.types.ts`
- [X] T015 Implement verified-session helpers and ownership-derived mutation context without accepting request `userId` in `lib/auth.ts`
- [X] T016 Implement Google OAuth login, PKCE callback, logout, and protected dashboard routing in `app/(auth)/login/page.tsx`, `app/auth/callback/route.ts`, and `proxy.ts`
- [X] T017 [P] Define Zod schemas for job fields, source metadata, provenance states, status values, and bounded arrays/text in `lib/validation/jobs.ts`
- [X] T018 [P] Create reusable accessible navigation, loading, empty, and sanitized error states in `app/(dashboard)/layout.tsx` and `components/app-shell.tsx`
- [X] T019 Run the local Supabase reset, generate database types, and make foundational pgTAP, lint, and typecheck pass using `package.json` and `lib/supabase/database.types.ts`

**Checkpoint**: Google 로그인과 데이터베이스 격리가 검증되어 사용자 스토리 구현을 시작할 수 있다.

---

## Phase 3: User Story 1 - 발견한 공고 통합 저장 (Priority: P1) 🎯 MVP

**Goal**: URL을 등록해 승인된 API 미리보기 또는 완전한 수동 입력으로 공고를 저장하고 출처·원문·값의 근거를 확인한다.

**Independent Test**: 커넥터를 끈 상태에서 임의 HTTPS URL을 수동 저장하고, fixture 모드에서 사람인·잡코리아 미리보기를 수정 후 저장하며, 동일 URL은 새 레코드 생성 전에 차단되는지 검증한다.

### Tests for User Story 1 ⚠️

- [X] T020 [P] [US1] Write unit tests for HTTPS validation, URL canonicalization, provider recognition, disabled-connector manual fallback, and no arbitrary fetch behavior in `tests/unit/source-recognition.test.ts`
- [X] T021 [P] [US1] Write contract tests over sanitized fixtures obtained from approved Saramin and JobKorea API responses, asserting at least 90% accuracy for company, title, provider, and original URL plus deterministic summaries, bounded responses, and typed failures in `tests/unit/source-connectors.test.ts`
- [X] T022 [P] [US1] Write E2E tests for manual URL registration, preview review/edit/save, provenance display, original-link retention, and same-URL prevention in `tests/e2e/job-registration.spec.ts`
- [X] T023 [P] [US1] Write pgTAP tests proving user-origin fields survive source updates and source failure cannot delete job records in `supabase/tests/source_preservation.test.sql`

### Implementation for User Story 1

- [X] T024 [P] [US1] Define the minimal connector contract, capability gate, normalized result, and sanitized failure codes in `lib/sources/connector.ts`
- [X] T025 [P] [US1] Implement URL-only manual recognition with no network request in `lib/sources/manual.ts`
- [X] T026 [P] [US1] Implement fixture-injectable Saramin approved-API adapter with allowlisted host, disabled-by-default gate, and 500-call conservative daily budget in `lib/sources/saramin.ts`
- [X] T027 [P] [US1] Implement fixture-injectable JobKorea approved-API adapter with issued-URL and enablement checks in `lib/sources/jobkorea.ts`
- [X] T028 [US1] Implement preview routing that rejects non-HTTPS/arbitrary fetches and returns review-only drafts or manual fallback in `app/api/jobs/preview/route.ts`
- [X] T029 [P] [US1] Implement deterministic short summaries and safe provenance updates without full-body fields in `lib/domain/provenance.ts`
- [X] T030 [US1] Implement account-scoped create and edit server actions with canonical URL duplicate checks in `app/(dashboard)/jobs/actions.ts`
- [X] T031 [US1] Build URL entry, preview review, full manual fields, provenance labels, validation errors, and source disclaimer in `components/job-form.tsx`
- [X] T032 [US1] Build the new-job flow with original-source navigation and manual fallback in `app/(dashboard)/jobs/new/page.tsx`
- [X] T033 [US1] Make US1 unit, pgTAP, and Playwright tests pass using only sanitized fixtures and no live source calls in `tests/unit/`, `supabase/tests/`, and `tests/e2e/job-registration.spec.ts`

**Checkpoint**: US1 alone delivers a usable personal MVP for collecting postings without approved provider credentials.

---

## Phase 4: User Story 2 - 조건에 맞는 공고 탐색 (Priority: P1)

**Goal**: 저장한 공고를 공통 항목으로 비교하고 검색·필터·정렬해 목표 공고와 원문을 빠르게 찾는다.

**Independent Test**: 100개 fixture 공고에서 회사·제목·직무 검색과 지역·경력·고용형태·상태·출처·마감 필터, 세 정렬 방식, 초기화를 조합해 1초 이내에 목표 결과를 표시한다.

### Tests for User Story 2

- [X] T034 [P] [US2] Write unit tests for fixed, expired, rolling, until-hired, and unknown deadline states in `tests/unit/deadlines.test.ts`
- [X] T035 [P] [US2] Write E2E tests with 100 seeded jobs for combined search, filters, sorting, excluded-default behavior, reset, provenance-empty states, and original links in `tests/e2e/job-discovery.spec.ts`

### Implementation for User Story 2

- [X] T036 [P] [US2] Implement deterministic deadline-state calculation using server dates in `lib/domain/deadlines.ts`
- [X] T037 [US2] Implement account-scoped search, combined filters, safe sort options, and excluded-by-default query handling in `app/(dashboard)/jobs/queries.ts`
- [X] T038 [P] [US2] Build URL-driven accessible search, filter, sort, and reset controls in `components/filters.tsx`
- [X] T039 [US2] Build a responsive comparison list with distinct missing, not-applicable, and failed states in `components/job-list.tsx`
- [X] T040 [US2] Compose the authenticated unified list, result count, empty state, and pagination in `app/(dashboard)/jobs/page.tsx`
- [X] T041 [US2] Make the 100-job discovery E2E scenario pass within the planned query and interaction limits in `tests/e2e/job-discovery.spec.ts`

**Checkpoint**: US2 independently proves that aggregated records reduce repeated platform searching.

---

## Phase 5: User Story 3 - 유사·중복 공고 정리 (Priority: P1)

**Goal**: 설명 가능한 유사 후보를 제안하고 사용자가 확정·거절·분리하되 공고와 기록은 삭제하지 않는다.

**Independent Test**: 유사 fixture 두 건은 근거와 함께 제안되고 자동 병합되지 않으며, 확정 후 모든 출처를 보고 다시 분리할 수 있고 거절한 변경 없는 쌍은 재제안되지 않는다.

### Tests for User Story 3 ⚠️

- [X] T042 [P] [US3] Write unit tests for deterministic normalization, weighted score reasons, threshold behavior, canonical pair order, and false-positive fixtures in `tests/unit/duplicates.test.ts`
- [X] T043 [P] [US3] Write pgTAP tests for transactional confirm/reject/split, reversible decisions, group cleanup, and preservation of jobs, sources, notes, statuses, and revisions in `supabase/tests/duplicate_decisions.test.sql`
- [X] T044 [P] [US3] Write E2E tests for suggestion reasons, explicit confirmation, all-source display, rejection, and split reversal in `tests/e2e/duplicates.spec.ts`

### Implementation for User Story 3

- [X] T045 [US3] Implement the minimal deterministic weighted duplicate scorer and human-readable reasons in `lib/domain/duplicates.ts`
- [X] T046 [US3] Generate or update suggestions after job creation without auto-merging and without recreating unchanged rejected pairs in `app/(dashboard)/jobs/actions.ts`
- [X] T047 [US3] Add transactional database functions for confirm, reject, regroup, and split operations in `supabase/migrations/005_duplicate_decisions.sql`
- [X] T048 [US3] Implement account-scoped duplicate decision server actions in `app/(dashboard)/jobs/duplicate-actions.ts`
- [X] T049 [US3] Build suggestion reason, confirm, reject, grouped-source, and split controls in `components/duplicate-panel.tsx`
- [X] T050 [US3] Integrate duplicate decisions and all retained original URLs into `app/(dashboard)/jobs/[id]/page.tsx`
- [X] T051 [US3] Make duplicate unit, pgTAP, and reversal E2E tests pass without AI matching or automatic merge in `tests/unit/duplicates.test.ts`, `supabase/tests/duplicate_decisions.test.sql`, and `tests/e2e/duplicates.spec.ts`

**Checkpoint**: US3 can be enabled without risking irreversible loss from a wrong match.

---

## Phase 6: User Story 4 - 지원 진행 상태 관리 (Priority: P1)

**Goal**: 상태·메모·다음 행동을 여러 기기에서 관리하고 최근 서버 커밋을 현재값으로 사용하되 모든 이전 값과 복구 경로를 보존한다.

**Independent Test**: 두 브라우저 컨텍스트에서 같은 필드를 다르게 수정해 10초 이내 최근 서버 커밋이 보이고, 이전 스냅샷을 복구하면 복구 전 값도 새 이력으로 남는지 검증한다.

### Tests for User Story 4 ⚠️

- [X] T052 [P] [US4] Write pgTAP tests for pre-update/delete revisions, server timestamps, immutable history, owned restore, and restore-of-restore behavior in `supabase/tests/job_revisions.test.sql`
- [X] T053 [P] [US4] Write E2E tests for all status corrections, memo and next action persistence, excluded visibility, logout, and revision restore in `tests/e2e/application-tracking.spec.ts`
- [X] T054 [P] [US4] Write two-context E2E tests for scoped Realtime refetch, last-server-commit-wins, prior device/value history, 10-second convergence, and an offline save that leaves server state unchanged until explicit retry after reconnection in `tests/e2e/cross-device-sync.spec.ts`

### Implementation for User Story 4

- [X] T055 [US4] Add account-scoped update, status, memo, next-action, delete, and revision-restore database functions with server timestamps in `supabase/migrations/006_job_history.sql`
- [X] T056 [US4] Implement patch-only tracking mutations with stable per-browser `deviceId`, no client timestamp authority, and explicit network-failure results without pretending an uncommitted edit was saved in `app/(dashboard)/jobs/tracking-actions.ts`
- [X] T057 [P] [US4] Implement authenticated account-scoped Realtime subscriptions that trigger bounded refetches in `lib/supabase/realtime.ts`
- [X] T058 [US4] Build status, memo, next-action, revision history, restore confirmation, non-destructive delete controls, and a network-save failure message with explicit retry in `components/job-detail.tsx`
- [X] T059 [US4] Integrate tracking data, revision history, and Realtime updates into `app/(dashboard)/jobs/[id]/page.tsx`
- [X] T060 [US4] Make history, tracking, and cross-device tests pass while preserving overwritten values and account isolation in `supabase/tests/job_revisions.test.sql` and `tests/e2e/`

**Checkpoint**: US4 provides a durable personal application tracker across devices with reversible conflicts.

---

## Phase 7: User Story 5 - 마감과 원문 상태 확인 (Priority: P2)

**Goal**: 저장된 상세를 즉시 보여준 뒤 승인된 출처만 비차단 갱신하고 마감·종료·실패·마지막 성공 상태를 구분한다.

**Independent Test**: 저장 상세가 2초 이내 표시되고 fixture 갱신 결과가 10초 이내 추가되며, 실패 시 저장값과 사용자 기록을 유지하고 30분 내 재진입은 제공자 호출 없이 캐시 결과를 사용한다.

### Tests for User Story 5 ⚠️

- [X] T061 [P] [US5] Write unit tests for 30-minute source TTL, user-origin overwrite protection, disabled/manual no-call behavior, sanitized failures, and Saramin daily budget exhaustion in `tests/unit/source-refresh.test.ts`
- [X] T062 [P] [US5] Write pgTAP tests for append-only source checks, latest-100 pruning safety, last-success preservation, and source-only status transitions in `supabase/tests/source_checks.test.sql`
- [X] T063 [P] [US5] Write E2E tests for stored-first detail rendering, visible refresh progress, success/failure states, 30-minute cache, and timing targets in `tests/e2e/source-refresh.spec.ts`

### Implementation for User Story 5

- [X] T064 [US5] Implement connector refresh orchestration with TTL, approved capability checks, user-field protection, and persisted sanitized check results in `lib/sources/connector.ts`
- [X] T065 [US5] Implement authenticated non-blocking refresh responses that always return the stored job on unsupported or failed sources in `app/api/jobs/[id]/refresh/route.ts`
- [X] T066 [P] [US5] Build active, closed, unreachable, unsupported, unknown, checking, cached, and last-success UI states in `components/source-status.tsx`
- [X] T067 [US5] Render stored detail first and trigger refresh after initial display in `app/(dashboard)/jobs/[id]/page.tsx`
- [X] T068 [US5] Make source refresh unit, pgTAP, and E2E tests pass within the 2-second stored-content and 10-second refresh targets in `tests/unit/source-refresh.test.ts`, `supabase/tests/source_checks.test.sql`, and `tests/e2e/source-refresh.spec.ts`

**Checkpoint**: 모든 사용자 스토리가 독립적으로 동작하며 출처 장애가 개인 기록을 훼손하지 않는다.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 전체 데이터 복구, 성능, 보안, 문서화 및 Windows 개발→Linux 배포 호환성 검증

### Tests for Cross-Cutting Recovery ⚠️

- [X] T069 [P] Write unit tests against the versioned JSON contract for size limits, references, enums, hostile fields, secret/full-body exclusion, and bounded errors in `tests/unit/backup.test.ts`
- [X] T070 [P] Write pgTAP tests proving restore validation performs no writes and commit is atomic with revisions and full rollback on failure in `supabase/tests/backup_restore.test.sql`
- [X] T071 [P] Write E2E tests for export, corrupt-file rejection, conflict preview, valid round-trip, and preservation of jobs, sources, decisions, history, notes, and schedules in `tests/e2e/backup-restore.spec.ts`

### Implementation and Final Verification

- [X] T072 Implement Zod validation matching `specs/002-job-posting-hub/contracts/export-schema.json` and version dispatch in `lib/validation/backup.ts`
- [X] T073 Implement account-scoped portable export with no user IDs, credentials, tokens, raw provider bodies, or auth records in `lib/domain/backup.ts` and `app/api/export/route.ts`
- [X] T074 Implement mutation-free import validation with conflict counts and bounded errors in `app/api/import/validate/route.ts`
- [X] T075 Implement revalidated single-transaction import, current-account rebinding, revisions, and rollback in `supabase/migrations/007_backup_restore.sql` and `app/api/import/commit/route.ts`
- [X] T076 [P] Add accessible export, validation preview, explicit restore confirmation, success, and rollback error controls in `app/(dashboard)/settings/data/page.tsx`
- [X] T077 Run the full backup unit, pgTAP, and E2E round-trip suite and record pass results in `specs/002-job-posting-hub/validation.md`
- [X] T078 [P] Verify keyboard operation, labels, focus, responsive mobile/desktop layouts, and loading/error announcements across `components/` and document findings in `specs/002-job-posting-hub/validation.md`
- [X] T079 Seed and measure 100-job search under 1 second, stored detail under 2 seconds, and fixture refresh/sync under 10 seconds in `tests/e2e/performance.spec.ts` and record results in `specs/002-job-posting-hub/validation.md`
- [X] T080 [P] Add an Ubuntu Node.js 24 CI job that runs `npm ci`, lint, typecheck, unit tests, production build, pgTAP, and Playwright without PowerShell-only commands or live provider calls in `.github/workflows/ci.yml`
- [ ] T081 Verify Linux case-sensitive imports, path handling, line endings, environment loading, production build, and test commands by passing the Ubuntu CI job; record the exact commit and result in `specs/002-job-posting-hub/validation.md`
- [X] T082 Run the Windows quickstart commands and the complete critical journeys from `specs/002-job-posting-hub/quickstart.md`, then record pass/fail evidence and any manual checks in `specs/002-job-posting-hub/validation.md`
- [X] T083 Review connector approval switches, credential exposure, RLS coverage, source attribution, original-link visibility, no-full-body storage, and manual fallback against `specs/002-job-posting-hub/quickstart.md`, then record the final Constitution check in `specs/002-job-posting-hub/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 즉시 시작 가능
- **Foundational (Phase 2)**: Setup 완료 후 진행하며 모든 사용자 스토리를 차단
- **US1 (Phase 3)**: Foundational 이후 진행; 수동 등록만으로 독립 배포 가능한 MVP
- **US2 (Phase 4)**: Foundational 이후 시작 가능하지만 실제 목록 데이터 검증은 US1 fixture 또는 seed 필요
- **US3 (Phase 5)**: Foundational 이후 시작 가능하지만 생성 시 제안 통합은 US1의 저장 동작에 연결
- **US4 (Phase 6)**: Foundational 이후 시작 가능하며 저장된 fixture 하나로 독립 검증 가능
- **US5 (Phase 7)**: US1의 출처 레코드와 connector contract 이후 진행
- **Polish (Phase 8)**: 출시 대상 스토리 완료 후 진행; 백업·복원은 전체 모델을 다루므로 US1–US5 이후 최종 검증

### User Story Dependency Graph

```text
Setup → Foundational → US1 (MVP)
                   ├→ US2
                   ├→ US3 (US1 저장 동작에 연결)
                   ├→ US4
                   └→ US5 (US1 connector/source 사용)
US1–US5 → Backup/Recovery → Windows + Ubuntu Linux verification
```

### Within Each User Story

- 위험 흐름의 테스트를 먼저 작성하고 실패를 확인한 뒤 구현한다.
- 데이터베이스 제약/함수 → 도메인 로직 → 서버 경계 → UI 통합 순으로 진행한다.
- 외부 출처는 fixture로 검증하며 승인과 자격 증명 없이는 항상 `manual`이다.
- 각 체크포인트에서 해당 스토리 테스트를 독립 실행하고 통과해야 다음 우선순위로 넘어간다.

### Parallel Opportunities

- `[P]`가 붙은 Setup 구성, 테스트 파일, 서로 다른 도메인 모듈과 UI 컴포넌트는 병렬 수행할 수 있다.
- Foundational 완료 후 US2와 US4는 US1 구현과 병렬 진행할 수 있으나 통합 검증은 명시된 의존성을 따른다.
- 각 스토리의 Vitest, pgTAP, Playwright 테스트 초안은 서로 다른 파일이므로 병렬 작성 가능하다.
- T080 Ubuntu CI 구성은 기능 구현과 병렬 작성할 수 있지만 T081의 실제 Linux 통과 판정은 전체 구현 뒤 수행한다.

## Parallel Execution Examples

### User Story 1

```text
T020 URL/recognition tests
T021 connector fixture tests
T022 registration E2E tests
T023 source-preservation pgTAP tests
```

### User Story 2

```text
T034 deadline unit tests
T035 discovery E2E tests
T036 deadline domain logic
T038 filter UI
```

### User Story 3

```text
T042 duplicate scoring tests
T043 duplicate transaction tests
T044 duplicate E2E tests
```

### User Story 4

```text
T052 revision pgTAP tests
T053 tracking E2E tests
T054 cross-device E2E tests
T057 Realtime client
```

### User Story 5

```text
T061 refresh unit tests
T062 source-check pgTAP tests
T063 refresh E2E tests
T066 source status UI
```

## Implementation Strategy

### MVP First

1. Phase 1 Setup 완료
2. Phase 2 Foundational 완료 및 RLS 검증
3. Phase 3 US1 완료
4. 커넥터를 끈 상태로 수동 URL 등록 흐름을 독립 검증
5. 실제 사용을 시작하고 다음 스토리는 검증된 불편 순서로 추가

### Incremental Delivery

1. **US1**: URL 수집과 수동/승인 API 검토 저장
2. **US2**: 통합 검색·필터·비교
3. **US3**: 설명 가능한 중복 후보와 되돌리기
4. **US4**: 지원 기록·동기화·이력 복구
5. **US5**: 비차단 원문 상태 갱신
6. **Recovery/Compatibility**: 내보내기·복원, Windows quickstart, Ubuntu Linux CI 통과

## Notes

- 승인 전 사람인·잡코리아 커넥터의 네트워크 호출은 구현·테스트·CI에서 금지한다.
- Docker는 배포 필수 요소로 추가하지 않는다. Linux 호환성은 우선 Ubuntu CI의 실제 production build와 테스트로 검증하고, 특정 Linux 서버가 정해질 때만 이미지화를 결정한다.
- 별도 백엔드, ORM, Redis, 큐, CRDT, LLM 요약, 스크레이퍼, 선제적 확장 인터페이스는 만들지 않는다.
- 각 작업 또는 논리적 작업 묶음 후 커밋하고, 각 체크포인트에서 독립 검증한다.
