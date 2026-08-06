# Tasks: 공개 베타 준비

**Input**: `specs/003-public-beta-readiness/spec.md`, `specs/003-public-beta-readiness/quickstart.md`, 기존 `specs/002-job-posting-hub/` 설계와 구현

**Tests**: 동의 우회, 계정 삭제, 요청 제한, 비밀 마스킹, 출처 표기는 구현 전에 실패하는 자동 테스트를 작성한다. 실제 사람인 API는 자동 테스트에서 호출하지 않는다.

**Organization**: 각 사용자 스토리는 독립적으로 검증 가능한 단계이며, 모든 작업은 명시된 파일만 변경한다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 아직 완료되지 않은 작업과 파일 충돌 없이 병렬 실행 가능
- **[Story]**: `spec.md`의 사용자 스토리 연결

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 공개 베타 테스트와 운영 설정의 공통 기반을 준비한다.

- [x] T001 Add `@axe-core/playwright` as a development dependency and add `test:a11y` and `verify:beta` scripts without changing existing verification commands in `package.json` and `package-lock.json`
- [x] T002 [P] Extend the documented environment contract with public policy metadata, server-only service role credentials, base URL, and disabled-by-default connectors in `.env.example`
- [x] T003 [P] Add deterministic test environment values for policy metadata and connector gates while keeping live provider calls disabled in `playwright.config.ts`
- [x] T004 Update the Ubuntu job to run the public-beta unit, build, pgTAP, E2E, and accessibility gates with connector calls disabled in `.github/workflows/ci.yml`

**Checkpoint**: 로컬과 CI가 동일한 공개 베타 검증 명령을 실행할 수 있다.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 모든 스토리가 공유하는 환경 검증, 데이터 기반과 안전한 로그를 테스트 우선으로 만든다.

**⚠️ CRITICAL**: 이 단계가 끝나기 전에는 사용자 스토리 구현을 시작하지 않는다.

### Tests

- [x] T005 [P] Write failing unit tests for required production values, HTTPS base URL, server-only secret separation, connector credential dependencies, and production rejection of `E2E_BYPASS_AUTH` in `tests/unit/environment.test.ts`
- [x] T006 [P] Write failing unit tests proving structured logs allow request ID, category, outcome, and timing but redact authorization, cookies, keys, tokens, URLs with credentials, memo, and job body fields in `tests/unit/safe-logger.test.ts`
- [x] T007 [P] Write failing pgTAP tests for owner-isolated consent rows, atomic per-user request windows, authenticated-only mutation, cascade deletion, and restricted grants in `supabase/tests/public_beta_foundation.test.sql`

### Implementation

- [x] T008 Create consent and request-usage tables, indexes, RLS policies, cascade ownership, and an atomic fail-closed `consume_rate_limit` RPC in `supabase/migrations/008_public_beta_foundation.sql`
- [x] T009 Regenerate the consent and request-usage database types after applying migration T008 in `lib/supabase/database.types.ts`
- [x] T010 Implement a Zod-based server environment contract that rejects missing or contradictory production configuration without returning secret values in `lib/environment.ts`
- [x] T011 Register production environment validation at Node server startup and leave Edge and build-time execution deterministic in `instrumentation.ts`
- [x] T012 [P] Implement an allowlist-based JSON logger with recursive redaction and request-ID generation in `lib/observability/safe-logger.ts`
- [x] T013 Implement the typed database-backed rate-limit client with fail-closed results and `Retry-After` metadata in `lib/security/rate-limit.ts`

**Checkpoint**: 잘못된 운영 설정은 시작 전에 실패하고, 공통 데이터·로그·제한 기반은 자동 테스트를 통과한다.

---

## Phase 3: User Story 1 - 고지에 동의하고 시작 (Priority: P1) 🎯 MVP

**Goal**: 고지를 공개하고 최신 버전의 명시적 동의를 기록한 사용자만 개인 화면에 진입시킨다.

**Independent Test**: 새 계정은 공개 고지를 읽고 두 필수 동의를 제출해야 대시보드에 들어가며, 버전 변경 후에는 다시 동의해야 한다.

### Tests for User Story 1

> 테스트를 먼저 작성하고 구현 전 실패를 확인한다.

- [x] T014 [P] [US1] Write failing unit tests for current policy version comparison and complete consent detection in `tests/unit/consent.test.ts`
- [ ] T015 [P] [US1] Write failing E2E tests for public legal routes, unchecked submission rejection, consent persistence, dashboard gating, reconnect retry, and forced re-consent after a version change in `tests/e2e/legal-consent.spec.ts`
- [x] T016 [P] [US1] Write failing accessibility tests for legal-page landmarks, login consent names, skip navigation, keyboard order, and serious or critical axe violations in `tests/e2e/accessibility.spec.ts`

### Implementation for User Story 1

- [x] T017 [P] [US1] Define immutable current terms and privacy versions plus policy effective-date parsing in `lib/legal/policy.ts`
- [x] T018 [P] [US1] Render the public terms with account rules, prohibited use, external-source limitations, termination, changes, liability boundaries, and operator contact from validated configuration in `app/(legal)/terms/page.tsx`
- [x] T019 [P] [US1] Render the public privacy notice with processed fields, purposes, retention, deletion, Google/Supabase/hosting processors, cross-border handling, safeguards, user rights, and contact from validated configuration in `app/(legal)/privacy/page.tsx`
- [x] T020 [P] [US1] Render the public source policy with manual-mode behavior, original-source priority, provider attribution, API failure behavior, and no-affiliation wording in `app/(legal)/sources/page.tsx`
- [x] T021 [US1] Implement latest-version consent lookup and authenticated idempotent consent recording against T008 in `lib/consent.ts` and `app/(auth)/consent/actions.ts`
- [x] T022 [US1] Build the two-document explicit consent form with separate unchecked controls, inline errors, pending state, retry behavior, and links to all public notices in `app/(auth)/consent/page.tsx`
- [x] T023 [US1] Route a successful OAuth callback to consent evaluation and preserve sanitized OAuth failure feedback in `app/auth/callback/route.ts` and `app/(auth)/login/page.tsx`
- [x] T024 [US1] Enforce latest consent before rendering any private route while avoiding redirect loops for public legal and consent routes in `app/(dashboard)/layout.tsx`
- [x] T025 [US1] Add keyboard-visible skip navigation and authenticated legal links in `components/app-shell.tsx` and `app/globals.css`
- [x] T026 [US1] Add unauthenticated legal links and accurate account-isolation wording without unverifiable security claims in `app/(auth)/login/page.tsx`

**Checkpoint**: US1은 공개 고지, 동의 기록, 버전 갱신과 개인 화면 차단을 독립적으로 증명한다.

---

## Phase 4: User Story 2 - 계정과 데이터 삭제 (Priority: P1)

**Goal**: 인증된 사용자가 내보내기 경로와 비가역 범위를 확인한 뒤 자신의 계정과 모든 소유 데이터를 삭제한다.

**Independent Test**: 데이터가 있는 계정에서 잘못된 확인 문구는 무변경이고, 올바른 탈퇴는 인증 계정·세션·모든 사용자 행을 제거하며 실패는 재시도 가능하다.

### Tests for User Story 2

> 테스트를 먼저 작성하고 구현 전 실패를 확인한다.

- [x] T027 [P] [US2] Write failing unit tests for exact confirmation normalization, authenticated-user binding, idempotent repeated deletion, and sanitized admin failures in `tests/unit/account-deletion.test.ts`
- [x] T028 [P] [US2] Write failing pgTAP tests proving deletion of an auth user cascades through jobs, sources, source checks, duplicate groups, duplicate pairs, revisions, consents, and request usage without touching a second owner in `supabase/tests/account_deletion.test.sql`
- [ ] T029 [P] [US2] Write failing E2E tests for export-before-delete, incorrect confirmation preservation, destructive warning, successful sign-out redirect, double submission, failure retry, and keyboard-accessible confirmation in `tests/e2e/account-deletion.spec.ts`

### Implementation for User Story 2

- [x] T030 [P] [US2] Create a server-only Supabase admin client that validates service-role presence and cannot be imported by client components in `lib/supabase/admin.ts`
- [x] T031 [US2] Implement a DELETE-only account deletion endpoint that re-resolves the authenticated user, validates the exact confirmation, applies a strict rate limit, calls admin deletion only for that user ID, emits a redacted audit event, and returns idempotent sanitized outcomes in `app/api/account/route.ts`
- [x] T032 [US2] Build an account danger-zone component with export link, deletion scope, irreversible warning, exact confirmation input, disabled/pending states, duplicate-submit prevention, success redirect, and failure retry in `components/account-deletion.tsx`
- [x] T033 [US2] Integrate the danger zone after backup and restore while keeping status and errors announced in `app/(dashboard)/settings/data/page.tsx`
- [x] T034 [US2] Clear the local session and auth cookies after successful deletion and prevent a deleted session from returning to private routes in `app/api/account/route.ts` and `proxy.ts`

**Checkpoint**: US2는 사용자 통제, 소유자 격리, 실패 시 무변경과 완전 삭제를 독립적으로 증명한다.

---

## Phase 5: User Story 3 - 신뢰할 수 있는 베타 운영 (Priority: P1)

**Goal**: 비밀 없는 상태 확인, 사용자별 남용 방어, 안전한 로그와 보안 응답 정책으로 공개 베타를 운영한다.

**Independent Test**: 준비·비준비 상태, 계정별 제한 100건, 제한 저장소 장애, 비밀 카나리 로그와 응답 헤더를 자동 검증한다.

### Tests for User Story 3

> 테스트를 먼저 작성하고 구현 전 실패를 확인한다.

- [x] T035 [P] [US3] Write failing route tests for a two-second health deadline, ready and degraded status codes, database reachability, and absence of configuration values in `tests/unit/health-route.test.ts`
- [x] T036 [P] [US3] Write failing integration tests for atomic per-user limits, operation isolation, exact `429` and `Retry-After`, 100-request enforcement, and fail-closed storage errors in `tests/unit/rate-limit-integration.test.ts`
- [x] T037 [P] [US3] Write failing tests for clickjacking, MIME sniffing, referrer, permissions, CSP, cache, and request-ID headers without exposing server-only values in `tests/unit/security-headers.test.ts`
- [ ] T038 [P] [US3] Write failing E2E tests proving preview, refresh, import commit, account deletion, and write actions enforce scoped limits while preserving existing user records after rejection in `tests/e2e/operational-safety.spec.ts`
- [x] T039 [P] [US3] Write a failing canary test that injects representative keys, bearer tokens, cookies, memo, and job body text and asserts none appear in captured logs or error responses in `tests/unit/secret-leakage.test.ts`

### Implementation for User Story 3

- [x] T040 [US3] Implement a public no-store health route with bounded database readiness probing, two-second timeout, request ID, stable component states, and no configuration values in `app/api/health/route.ts`
- [x] T041 [US3] Apply request IDs and production security headers including CSP frame protection, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and conditional HSTS in `next.config.ts` and `proxy.ts`
- [x] T042 [US3] Apply per-user preview limits before connector execution and return exact retry metadata without making a provider call when denied in `app/api/jobs/preview/route.ts`
- [x] T043 [P] [US3] Apply per-user refresh limits before connector execution while preserving the stored job and last success state when denied or unavailable in `app/api/jobs/[id]/refresh/route.ts`
- [x] T044 [P] [US3] Apply separate validation and destructive-commit limits without echoing uploaded JSON in `app/api/import/validate/route.ts` and `app/api/import/commit/route.ts`
- [x] T045 [US3] Apply scoped mutation limits and sanitized structured events to create, tracking, duplicate decision, restore, and delete server actions in `app/(dashboard)/jobs/actions.ts`, `app/(dashboard)/jobs/tracking-actions.ts`, and `app/(dashboard)/jobs/duplicate-actions.ts`
- [x] T046 [US3] Replace raw or swallowed operational failures on protected routes with request-ID-correlated safe logger events and stable user messages in `app/api/export/route.ts`, `app/api/import/validate/route.ts`, `app/api/import/commit/route.ts`, `app/api/jobs/preview/route.ts`, and `app/api/jobs/[id]/refresh/route.ts`
- [x] T047 [US3] Add cleanup of expired request windows with a bounded database function and document its scheduled invocation contract in `supabase/migrations/009_request_usage_retention.sql`

**Checkpoint**: US3은 운영 상태, 남용 격리, 장애 시 안전한 실패와 비밀 비노출을 독립적으로 증명한다.

---

## Phase 6: User Story 4 - 외부 출처를 오인 없이 확인 (Priority: P2)

**Goal**: API 제공 정보와 수동 저장을 구분하고 사람인 필수 표기, 원문 링크와 원문 우선 안내를 표시한다.

**Independent Test**: fixture 기반 사람인 API 공고에는 공식 표기와 원문이 보이고, 수동 사람인 URL과 기타 출처는 API 제공으로 오인되지 않으며 실제 네트워크를 호출하지 않는다.

### Tests for User Story 4

> 테스트를 먼저 작성하고 구현 전 실패를 확인한다.

- [x] T048 [P] [US4] Write failing unit tests for attribution decisions across provider and connector-mode combinations and exact secure Saramin destination in `tests/unit/provider-attribution.test.ts`
- [x] T049 [P] [US4] Write failing E2E tests for list and detail attribution, original links, manual-mode labels, source failure preservation, no-affiliation wording, and no live provider calls in `tests/e2e/provider-attribution.spec.ts`

### Implementation for User Story 4

- [x] T050 [P] [US4] Implement a reusable provider attribution component that shows `Powered by 취업 사람인` only for approved-API Saramin data, identifies manual mode, opens the canonical provider securely, and states original-source priority in `components/provider-attribution.tsx`
- [x] T051 [US4] Include connector mode and observation metadata in list query results and render attribution plus original links without losing filter performance in `app/(dashboard)/jobs/queries.ts` and `components/job-list.tsx`
- [x] T052 [US4] Render every source's provider, connector mode, observation state, official attribution, secure original link, and last-success status in `app/(dashboard)/jobs/[id]/page.tsx`
- [x] T053 [US4] Keep approved connectors disabled unless both gate and server credential pass validation, and preserve URL-only manual fallback on all typed failures in `lib/sources/connector.ts`, `lib/sources/saramin.ts`, and `lib/sources/jobkorea.ts`

**Checkpoint**: US4는 승인 API와 수동 저장을 오인 없이 구분하고 출처 실패에도 사용자 기록을 보존한다.

---

## Phase 7: Operations, Accessibility, and Full Verification

**Purpose**: 공개 배포 절차를 실행 가능하게 만들고 모든 사용자 스토리의 출시 게이트를 증명한다.

- [x] T054 [P] Write an exact staging and production deployment runbook covering environment scopes, OAuth redirects, migration dry-run, health gate, connector gates, and smoke tests in `docs/operations/deploy.md`
- [x] T055 [P] Write database backup cadence, retention, encryption, restore-to-empty-project drill, ownership checks, and evidence recording in `docs/operations/backup-restore.md`
- [x] T056 [P] Write request-ID triage, secret exposure response, provider disablement, rate-limit outage, user notification decision, and escalation steps in `docs/operations/incident-response.md`
- [x] T057 [P] Write application and migration rollback criteria, reversible deployment order, data-preserving rollback commands, and post-rollback verification in `docs/operations/rollback.md`
- [x] T058 [P] Write a no-placeholder launch checklist requiring operator identity, privacy contact, policy effective date, legal review, Google OAuth, Supabase backups, secrets, free Saramin conditions, and named evidence links in `docs/operations/launch-checklist.md`
- [x] T059 Add native or focus-managed confirmation behavior with initial focus, Tab containment, Escape close, and trigger-focus restoration to destructive dialogs in `components/job-detail.tsx` and `components/account-deletion.tsx`
- [x] T060 Run axe over login, consent, terms, privacy, sources, jobs, new job, detail, and settings pages and resolve all serious or critical violations in `tests/e2e/accessibility.spec.ts`, `components/`, and `app/`
- [x] T061 Run `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run build`, `npx supabase test db`, `npm run test:e2e`, and `npm run test:a11y` on Windows and record exact results in `specs/003-public-beta-readiness/validation.md`
- [ ] T062 Run the same full suite in the Ubuntu CI job with live provider calls disabled and record the exact commit, run URL, job result, and Linux case-sensitive path evidence in `specs/003-public-beta-readiness/validation.md`
- [ ] T063 Execute the staging acceptance journey from Google login through consent, first save, export, rate-limit observation, Saramin/manual attribution, account deletion, and failed re-login; record timestamps and sanitized evidence in `specs/003-public-beta-readiness/validation.md`
- [ ] T064 Perform a restore-to-empty-staging-project drill and a rollback drill, verify user ownership and record counts, and record recovery time plus sanitized evidence in `specs/003-public-beta-readiness/validation.md`
- [x] T065 Search tracked files, built output samples, HTTP responses, and captured logs for registered secret canaries; confirm zero matches and document the commands and results in `specs/003-public-beta-readiness/validation.md`
- [ ] T066 Verify all requirements FR-001–FR-011, DT-001–DT-004, UR-001–UR-003 and success criteria SC-001–SC-006 against direct evidence and close the launch checklist in `specs/003-public-beta-readiness/validation.md` and `docs/operations/launch-checklist.md`

**Checkpoint**: 공개 베타는 문서화된 배포·복구 절차와 Windows, Ubuntu, 스테이징의 직접 증거가 모두 있을 때만 출시 가능하다.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**: 즉시 시작 가능
- **Phase 2 Foundational**: Phase 1 완료 후 진행하며 모든 사용자 스토리를 차단
- **US1**: Phase 2 완료 후 시작, 다른 스토리에 의존하지 않음
- **US2**: Phase 2 완료 후 시작, US1과 독립 구현 가능하지만 공개 출시에는 둘 다 필수
- **US3**: Phase 2 완료 후 시작, T031의 탈퇴 제한 통합 전에 T013 필요
- **US4**: Phase 2 완료 후 시작, 다른 스토리와 독립 구현 가능
- **Phase 7**: 선택된 모든 스토리 완료 후 시작하며 T061–T066은 순서대로 증거를 누적

### Within Each User Story

1. 해당 스토리의 테스트를 작성한다.
2. 구현 전 테스트가 요구된 이유로 실패하는지 확인한다.
3. 데이터 구조와 공통 로직을 먼저 구현한다.
4. 서버 경계와 UI를 연결한다.
5. 독립 테스트와 회귀 테스트를 모두 통과시킨다.

### Parallel Opportunities

- T002와 T003은 서로 다른 설정 파일에서 병렬 가능하다.
- T005–T007은 환경, 로그, 데이터베이스 테스트로 분리되어 병렬 가능하다.
- Phase 2 후 US1, US2, US3, US4의 테스트 작성은 서로 다른 파일에서 병렬 가능하다.
- T018–T020은 서로 다른 공개 고지 페이지라 병렬 가능하다.
- T027–T029, T035–T039, T048–T049는 각 스토리 안에서 병렬 테스트 작성이 가능하다.
- T043과 T044는 서로 다른 API 경계에서 병렬 가능하다.
- T054–T058은 서로 다른 운영 런북이라 병렬 가능하다.

## Parallel Execution Examples

```text
US1: T014 consent unit test | T015 consent E2E | T016 accessibility
US2: T027 deletion unit test | T028 deletion pgTAP | T029 deletion E2E
US3: T035 health | T036 rate limit | T037 headers | T038 operational E2E | T039 secret canary
US4: T048 attribution unit test | T049 attribution E2E
Operations: T054 deploy | T055 backup/restore | T056 incident | T057 rollback | T058 launch checklist
```

## Implementation Strategy

### Public-Beta Critical Path

1. Phase 1과 Phase 2로 테스트·환경·데이터 기반을 고정한다.
2. US1을 완료해 공개 고지와 개인 화면 진입 통제를 검증한다.
3. US2를 완료해 내보내기와 완전 탈퇴를 검증한다.
4. US3을 완료해 상태, 제한, 로그와 보안 응답을 검증한다.
5. US4를 완료해 사람인 조건과 수동 fallback을 검증한다.
6. Phase 7에서 Windows, Ubuntu, 스테이징, 복구 훈련의 직접 증거를 남긴다.

### Completion Rule

- 체크박스는 명시된 자동 또는 수동 검증 증거가 있을 때만 완료한다.
- 승인받지 않은 실제 외부 API 호출로 테스트를 통과시키지 않는다.
- 운영자 정보, 법적 문안, 자격 증명이나 배포 주소에 가짜 값을 넣어 출시 판정을 통과시키지 않는다.
- SC-001–SC-006 중 하나라도 직접 증거가 없으면 공개 베타 준비 완료로 표시하지 않는다.
