# Validation Evidence

**Feature**: 002-job-posting-hub
**Last updated**: 2026-08-07 (Asia/Seoul)

## Backup and restore — T077

- npx vitest run tests/unit/backup.test.ts: PASS — 11 tests. Covered schema v1, 10 MiB limit, references, duplicate IDs, enums, hostile/secret/full-body keys, and bounded errors.
- npx supabase test db: PASS — 7 files, 56 tests. backup_restore.test.sql covered mutation-free preview, account binding, prior-state revisions, source/history restoration, and full rollback after a mid-transaction source failure.
- npx playwright test tests/e2e/backup-restore.spec.ts: PASS — 2 tests. Covered portable download, absence of account/credential/raw-body fields, conflict preview, explicit overwrite confirmation, round-trip preservation of jobs, sources, duplicate decisions, revisions, memo, and next action, plus corrupt-file rejection.
- npm run verify: PASS — ESLint, TypeScript, 26 unit tests, and Next.js 16.3.0 production build.

Live provider APIs were not called. All source behavior used deterministic fixtures, as required by the project constitution.
## Accessibility and responsive behavior — T078

- Playwright accessibility checks: PASS — 2 tests.
- Keyboard: Google login button receives visible keyboard focus; a global focus-visible outline is present.
- Labels: search/filter, tracking, backup file, confirmation, memo, and schedule controls have accessible names.
- Announcements: save, refresh, validation, restore success, and failures use status/alert live semantics.
- Responsive: jobs and detail workflows were checked at 375 × 812 with no horizontal overflow; desktop layout remains covered by the default Chromium viewport.
- Loading/error states remained keyboard-operable and visible.

## Performance — T079

Windows Chromium, deterministic 100-job fixture, one Playwright worker:

- 100-job search including excluded records: 871 ms (target < 1,000 ms) — PASS.
- Stored detail display: 196 ms (target < 2,000 ms) — PASS.
- Fixture source refresh: 1,032 ms (target < 10,000 ms) — PASS.
- Cross-context sync: 354 ms (target < 10,000 ms) — PASS.

## Ubuntu/Node 24 compatibility — T080/T081

- Added .github/workflows/ci.yml for ubuntu-latest and Node.js 24. It runs npm ci, Playwright Chromium installation, local Supabase start/reset, lint, typecheck, unit tests, production build, pgTAP, and complete Playwright tests. Live provider switches remain false.
- Local Linux-equivalent check: PASS in official node:24-bookworm image digest sha256:934240a162082fd8b8a2f90cd5114446443f1eba1c5378f6687167ca405e6584, Node.js 24.19.0.
- Linux commands passed: npm ci, ESLint, TypeScript, 26 unit tests, and Next.js production build.
- This proves case-sensitive imports, Linux paths, LF-readable sources, environment loading, and production compilation.
- Workflow static validation: PASS with rhysd/actionlint container image digest sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667.
- GitHub connector identity: noveeda. Accessible repositories owned by this account: 0.
- Actual GitHub Actions run: NOT AVAILABLE. This repository has no HEAD commit or Git remote, and no existing account repository can be reused. Stage, commit, remote creation, and push also require explicit authorization. Therefore there is no exact commit SHA or Ubuntu CI job URL/result to record yet. T081 remains open.

## Windows quickstart — T082

Environment: Windows, Node.js 24.18.0, npm 11.16.0, Docker engine 29.6.2, local Supabase.

- Supabase start/reset and all seven migrations: PASS.
- pgTAP: PASS — 7 files, 56 tests, including RLS, revisions, source checks, duplicates, backup preview/rollback.
- Playwright: PASS — 18 critical journey tests using one deterministic worker.
- Static/build: PASS — ESLint, strict TypeScript, 26 unit tests, Next.js 16.3.0 production build.
- Journeys covered: manual URL fallback, 100-job discovery, excluded visibility, duplicate decisions, every application status, memo/schedule, logout, offline retry, two-context and actual Supabase Realtime sync, revision restore, non-blocking source refresh/cache/failure, export/validation/restore, accessibility, mobile layout, and timing targets.
- Interactive Google OAuth was not manually exercised because no Google/Supabase production credentials were supplied. OAuth callback, session guards, logout redirect, and account isolation are covered by implementation, E2E, and RLS tests.
- Optional live Saramin/JobKorea smoke checks were intentionally not run without documented approval and credentials.

## Final Constitution check — T083

- Approved access only: PASS. Saramin and JobKorea calls require explicit server-side enable flags and credentials/issued URL; defaults are false.
- Manual fallback: PASS. Disabled, unsupported, or missing-ID sources perform no provider call and remain manually registerable.
- Credential exposure: PASS. Environment files are ignored except the empty example; provider secrets have no NEXT_PUBLIC prefix; no service-role key is in application code.
- Account isolation: PASS. RLS is enabled for all six user-owned tables; pgTAP proves cross-account denial; security-definer RPCs re-check auth.uid ownership.
- Source attribution/original link: PASS. List/detail keep provider and HTTPS original URL visible.
- No full-body storage: PASS. Schema contains bounded structured fields and source_values only; connectors persist normalized permitted values, and backup validation/export reject raw/full-body and secret keys.
- User control/recovery: PASS. No automatic duplicate merge; status corrections, overwritten values, delete snapshots, revision restore, and atomic backup rollback are tested.
- Source failure safety: PASS. Failure changes only source status/check metadata and preserves memo, schedule, application status, and last successful data.
