# Public Beta Validation Evidence

**Feature**: 003-public-beta-readiness
**Validation date**: 2026-08-07, Asia/Seoul
**Launch decision**: BLOCKED — local suite passed; external gates remain
**Launch checklist**: [launch-checklist.md](../../docs/operations/launch-checklist.md)

## 1. Evidence rules

- PASS requires a command result, deployed response, database assertion, provider/console record, or named drill evidence that directly covers the requirement.
- A source file or test file existing is implementation evidence, not proof that the runtime behavior passed.
- Prior feature 002 results are regression baseline only and do not prove the uncommitted beta changes.
- Actual credential values, emails, account IDs, URLs containing private data, provider payloads and user content are never recorded.
- NOT RUN and NOT VERIFIED are launch blockers, not implicit passes.

## 2. Repository state

| Item | Result | Evidence |
|---|---|---|
| Branch | OBSERVED | codex/initial-implementation |
| HEAD | OBSERVED | 9b6959fbdaea7c9688c35c74f142ad1a7c6715cc |
| Beta commit | NOT AVAILABLE | Current 003 implementation and operations files are uncommitted; HEAD does not identify this beta code |
| Task completion | NOT COMPLETE | tasks.md currently has 0 completed and 66 unchecked tasks |
| Ubuntu beta CI | NOT AVAILABLE | No committed beta SHA, Actions run URL, or Ubuntu result exists for the current worktree |
| Provider mode in repository defaults | VERIFIED | SARAMIN_CONNECTOR_ENABLED=false and JOBKOREA_CONNECTOR_ENABLED=false |
| Production credentials | NOT VERIFIED | No staging/production Supabase, Google OAuth, Vercel or provider credential evidence was supplied to this validation run |

The current uncommitted worktree contains changes from multiple implementation tasks. This document does not treat file presence as task completion.

## 3. Direct Windows command results

Commands were executed in the current uncommitted worktree on 2026-08-07 with both external connectors disabled.

| Gate | Result | Direct result |
|---|---|---|
| npm run verify:beta | PASS | Complete public-beta suite finished in 43.8 seconds |
| npm run lint | PASS | ESLint exited 0 |
| npm run typecheck | PASS | tsc --noEmit exited 0 |
| npm run test:unit | PASS | Vitest: 19 files, 86 tests passed |
| npm run build | PASS | Next.js 16.3.0 production build completed with deterministic CI/local configuration |
| npx supabase test db | PASS | pgTAP: 10 files, 114 tests passed |
| npm run test:e2e | PASS | Playwright Chromium: 24 of 24 tests passed |
| Accessibility coverage | PASS | Nine public/private routes audited; serious and critical axe violations: 0 |
| git diff --check | PASS | No whitespace errors |
| Representative tracked-file secret pattern scan | PASS | 0 matches; this is not a production credential or captured-log scan |

The build and tests used deterministic local Supabase data and disabled provider connectors. They did not use or prove production credentials, real Google OAuth, a real Saramin/JobKorea call, or a deployed Vercel environment.
## 4. Prior 002 regression baseline

[002 validation.md](../002-job-posting-hub/validation.md) records the pre-beta implementation baseline:

- Windows lint, typecheck, 26 unit tests and production build passed.
- pgTAP recorded 56 passing tests.
- Playwright recorded 18 critical journey tests.
- Backup/export, RLS, revisions, attribution foundations, accessibility and performance had direct evidence.

These results predate feature 003 and do not cover new consent, account deletion, durable rate limits, security headers, health, legal pages, production environment validation or operational drills. They cannot close T061–T066.

## 5. Artifact evidence

The following artifacts were inspected and exist in the current worktree.

### Implementation and test artifacts

- Production environment validation and production E2E bypass rejection
- Consent migration, RLS model, policy versions, public legal pages and dashboard gate
- Server-only admin client, deletion route and danger-zone UI
- Database-backed rate-limit migration and helper
- Safe logger and request security helpers
- Health route and security-header configuration
- Provider attribution component and related unit tests
- Unit tests for environment, consent, deletion, health, rate limits, request security, logs, headers and attribution

The complete Windows result proves the current local database policies, 86 unit tests, production build, 24 fixture-based browser journeys and nine-route axe audit pass. It does not prove actual Auth administration, Vercel behavior, provider credentials or staging integrations.

### Operations artifacts

- [deploy.md](../../docs/operations/deploy.md): environment, OAuth, migration, health, smoke and promotion gates
- [backup-restore.md](../../docs/operations/backup-restore.md): RPO/RTO, cadence, retention, encryption and empty-project drill
- [incident-response.md](../../docs/operations/incident-response.md): request-ID triage, secret/provider/limiter incidents and notification
- [rollback.md](../../docs/operations/rollback.md): app/environment/migration/data rollback criteria and verification
- [launch-checklist.md](../../docs/operations/launch-checklist.md): final no-assumption launch gate

Document existence verifies FR-011's procedures are written. It does not verify that a real operator executed them successfully.

## 6. Requirement audit

Status meanings:

- PASS: direct evidence covers the requirement.
- PARTIAL: implementation or narrower tests exist, but a required boundary is unverified.
- NOT VERIFIED: direct evidence is absent.
- FAIL: observed result contradicts the release gate.

| Requirement | Status | Evidence and remaining gate |
|---|---|---|
| FR-001 consent before private access | PASS locally | Consent unit and Playwright gates pass; real Google OAuth remains a staging gate |
| FR-002 version and acceptance time | PASS locally | Unit, pgTAP and browser persistence gates pass |
| FR-003 public legal pages | PASS locally | Production build and unauthenticated Playwright routes pass |
| FR-004 delete Auth account and owned data | PARTIAL | Unit, cascade pgTAP and E2E pass; actual staging service-role deletion is unverified |
| FR-005 authenticated owner-only deletion and visible failure | PARTIAL | Local boundaries pass; real fresh-auth, repeated deletion and failure behavior require staging |
| FR-006 public service/storage health | PARTIAL | Unit/build/browser gates pass; deployed p95 and real storage readiness are unmeasured |
| FR-007 per-user limits on risky operations | PASS locally | Unit, pgTAP and E2E fail-closed/action-isolation gates pass; deployed concurrency remains unverified |
| FR-008 safe logs | PARTIAL | Canary unit tests and representative tracked-file scan pass; built output, HTTP and captured Vercel logs remain unverified |
| FR-009 security response policy | PARTIAL | Header tests, build and local browser suite pass; deployed CSP/OAuth compatibility is unverified |
| FR-010 invalid production settings fail startup | PARTIAL | Environment tests and production build pass with deterministic values; actual Vercel failure smoke is unverified |
| FR-011 operating procedures | PASS for documentation | Four runbooks and launch checklist exist; restore/rollback/incident drills remain unverified |
| DT-001 source, URL, observation and mode | PASS locally | Current fixture E2E regression passes |
| DT-002 provenance distinction | PASS locally | Production build and current fixture browser regression pass |
| DT-003 Saramin attribution and original-first notice | PASS in fixtures | Unit and Playwright attribution gates pass; actual approved service is not enabled or tested |
| DT-004 no call without approval/credentials | PARTIAL | Repository defaults are false and validation code exists; actual Vercel values and captured network evidence are absent |
| UR-001 export before deletion | PASS locally | Production build and fixture browser journey pass |
| UR-002 irreversible notice and exact phrase | PARTIAL | Unit/browser confirmation gates pass; real staging deletion remains unverified |
| UR-003 failures/limits preserve records | PASS locally | Unit, pgTAP and fixture E2E preservation gates pass |

FR-001–FR-010, DT-001–DT-004 and UR-001–UR-003 are not all PASS. T066 cannot be closed.

## 7. Success criteria audit

| Criterion | Status | Missing direct evidence |
|---|---|---|
| SC-001 consent to first dashboard within 2 minutes | NOT VERIFIED | Real Google login and timed staging journey |
| SC-002 deletion within 1 minute and failed re-login | NOT VERIFIED | Service-role deletion in staging, row counts, session/re-login check |
| SC-003 95% health responses within 2 seconds | NOT VERIFIED | Deployed repeated measurements and database probe behavior |
| SC-004 100-request limit and account isolation | PARTIAL | Local rate-limit unit, pgTAP and E2E pass; deployed concurrency/100-request evidence is not separately recorded |
| SC-005 no registered secret values in response/log | PARTIAL | Canary unit tests and representative tracked-file scan pass; build output, HTTP and captured platform logs remain unverified |
| SC-006 Windows and Ubuntu critical journeys | PARTIAL | Windows full suite passes; current Ubuntu CI and staging evidence are absent |

No success criterion is closed for public beta.

## 8. Credential and staging-only gates

The following cannot be validated from source code or fixture mode and remain mandatory.

- Final operator identity, monitored privacy contact, policy effective date and legal approval
- Separate staging/production Supabase and Vercel projects
- Matching Supabase URL, publishable key and server-only service-role key in each environment
- Environment-specific Google OAuth client, Supabase callback, Site URL and exact app callback
- Proof that E2E_BYPASS_AUTH is absent from Preview and Production
- Actual connector enable flags; if Saramin is enabled, approved service URL, access-key, free-use conditions, quota and required attribution
- Managed backup success, retention evidence and encrypted logical backup
- Restore-to-empty-project count/ownership/RLS drill
- Previous-deployment rollback drill
- Real login, consent, save, export, rate-limit, attribution, deletion and failed re-login journey
- Vercel captured-log and HTTP secret-canary scan

No credential value should be added to this file when those checks are performed. Record only environment, evidence ID, timestamp, request ID, SHA and PASS/FAIL.

## 9. Required next evidence

1. Commit the current beta work so one exact SHA identifies the validated implementation.
2. Run that SHA through the Ubuntu Node 24 CI workflow and record the Actions URL and job result.
3. Provision actual staging Supabase, Vercel and Google OAuth configuration and verify E2E_BYPASS_AUTH is absent.
4. Execute real Google login, consent, save, export, rate-limit, attribution, account deletion and failed re-login.
5. Scan production build output, deployed HTTP responses and captured platform logs with registered canaries.
6. Perform restore-to-empty-project and previous-deployment rollback drills with ownership/count evidence.
7. Complete final operator identity, privacy contact, policy date and legal review.
8. Re-audit every requirement and success criterion, then close the launch checklist.
## 10. Final decision

**NO-GO**.

Reason: the Windows public-beta suite is fully green, but the validated work is still uncommitted and has no Ubuntu CI result. Actual Google OAuth, staging account deletion and failed re-login, restore-to-empty, rollback, deployed canary scans and final legal review remain unverified external gates.
