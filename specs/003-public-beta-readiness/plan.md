# Implementation Plan: 공개 베타 준비

**Branch**: 003-public-beta-readiness | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from /specs/003-public-beta-readiness/spec.md

## Summary

기존 Next.js 16 채용공고 허브에 버전별 필수 동의, 본인 계정과 소유 데이터 삭제, 사용자별 요청 제한, 상태 확인, 보안 응답 정책, 안전한 구조화 로그, 출처 표기, 배포·백업·복구 절차를 추가한다. Node.js 24/Next.js/Supabase 단일 애플리케이션과 직접 SQL/RLS 구조를 유지하고 새 의존성은 추가하지 않는다. 동의와 요청 제한은 Postgres에서 원자적으로 처리하며 인증 계정 삭제만 서버 전용 service-role 클라이언트가 수행한다.

## Technical Context

**Language/Version**: TypeScript strict mode on Node.js 24 LTS; PostgreSQL SQL/PLpgSQL

**Primary Dependencies**: Next.js 16.3 App Router, React 19, @supabase/supabase-js, @supabase/ssr, Zod 4; no new dependency

**Storage**: Supabase Postgres migrations, RLS, security-definer RPCs, Auth, and existing Realtime

**Testing**: Vitest; Supabase pgTAP; Playwright Chromium; sanitized provider fixtures

**Target Platform**: Modern desktop/mobile browsers; HTTPS Node-compatible deployment, initially Vercel-compatible; Ubuntu CI and Windows development

**Project Type**: Single full-stack web application

**Performance Goals**: 95% of healthy /api/health requests finish within 2 seconds; consent unlocks the dashboard in one navigation; account deletion prevents login and removes owned rows within 1 minute

**Constraints**: Google OAuth; account-isolated data; no client-visible service-role key; no secrets or user content in logs; limiter failure fails closed for risky operations; approved official APIs only; export remains available before deletion; no Redis, monitoring SDK, queue, ORM, or separate service

**Scale/Scope**: Free beta for tens to hundreds of users and up to a few thousand jobs per account; no admin console or large-scale traffic optimization

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after design.*

- **Personal Value**: PASS — existing job management remains intact while informed entry, self-service deletion, and predictable recovery make public use safe; each slice is independently testable.
- **Source Compliance & Traceability**: PASS — source, original URL, observation time, connector mode, and provenance remain; Saramin gains required attribution and original-first notice; unapproved connectors stay manual.
- **Data Truthfulness**: PASS — sourced values are not rewritten; operational events contain categories rather than job content.
- **User Control & Recovery**: PASS — export precedes separately confirmed irreversible deletion; deletion is authenticated and idempotent; provider failures and limits never alter records.
- **Simplicity & Verification**: PASS — existing Supabase supplies consent, atomic counters, cascades, and Auth administration; platform logs supply monitoring; no new dependency or service is introduced.

**Gate Result Before Research**: PASS. These controls are required by the constitution before public deployment and fit the existing application boundary without weakening source, provenance, or recovery guarantees.

**Gate Result After Design**: PASS. Postgres owns consent and limit truth, service-role access is confined to account deletion, risky operations fail closed, logs are allowlisted, and recovery is documented and exercised.

## Phase 0: Research Decisions

Research is recorded in [research.md](./research.md). Operator identity, privacy contact, effective date, production URL, and credentials are deployment inputs, not unresolved design choices.

## Design

### Consent and public notices

- Store immutable account-owned consent records with terms, privacy, and source-notice versions plus a server acceptance time under RLS.
- Keep current required versions in validated server environment variables; a version change automatically requires re-consent.
- Publish terms, privacy, and source notices without authentication. The authenticated dashboard layout checks consent before rendering private content.
- A failed consent write leaves the dashboard locked and presents a retryable error.

### Account deletion

- Show export access, irreversible-deletion notice, and an exact confirmation phrase in data settings.
- An authenticated server-only handler revalidates the session and phrase, consumes a strict request allowance, and calls an account-bound database deletion function.
- A server-only Supabase admin client using SUPABASE_SERVICE_ROLE_KEY then deletes the matching Auth user; the key never reaches client code or responses.
- Repeated deletion is safe. If Auth deletion fails after owned rows are removed, never report success; sign out where possible, return a retry/support state, and emit a sanitized reconciliation event covered by the runbook.

### Request limiting

- Store fixed-window Postgres counters keyed by verified user, operation, and window start. One atomic security-definer RPC returns allowed, remaining, and retry_after_seconds.
- Limit source preview/refresh, job mutations, backup validate/commit, export, consent, and deletion; use stricter policies for provider and destructive operations.
- Authenticate first, never accept a caller-supplied account key, and do not log raw IDs. Limiter failure rejects provider calls, imports, and deletion instead of bypassing protection.
- Prune expired windows opportunistically in bounded batches; no queue or scheduler is needed at beta scale.

### Environment, health, headers, and logs

- Add one server-only Zod environment parser. Production rejects missing Supabase/application/notice settings, E2E_BYPASS_AUTH=true, non-HTTPS public URLs, and enabled connectors without credentials.
- Add public GET /api/health with Cache-Control: no-store, a bounded sub-two-second storage probe, generic service/storage state, timestamp, and request ID only.
- Apply production HSTS, MIME-sniff prevention, frame denial, strict referrer policy, and restrictive permissions policy. Add CSP only in a Next.js-compatible form verified with Supabase HTTPS/WSS browser flows.
- Emit allowlisted one-line JSON containing timestamp, request ID, operation, outcome, duration, status, and bounded error category. Never serialize request data, headers, cookies, tokens, keys, identity, URLs, memos, job content, backups, or raw exceptions. Use platform log search and alerts.

### Source attribution

- Preserve provider, original HTTPS URL, observation time, connector mode, and field provenance.
- Show Saramin provider attribution and original-posting-first notice on API-backed list/detail records. Disabled sources visibly remain manual.
- Provider errors and throttling update no user-authored data.

### Operations and verification

- Create an operations runbook for environment provisioning, OAuth redirects, migration order, pre-deploy backup, health smoke, rollback, managed daily backup, restore drill, incident triage, Auth-deletion reconciliation, secret rotation, and connector disablement.
- CI runs lint, strict typecheck, unit tests, production build, pgTAP, and Playwright on Ubuntu Node 24 with provider connectors disabled.
- Before opening beta access, record a production-like smoke for real login/consent, dashboard access, export, deletion, health, headers, and account isolation.

## Project Structure

### Documentation (this feature)

~~~text
specs/003-public-beta-readiness/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
docs/operations.md
~~~

### Source Code (repository root)

~~~text
app/
├── (public)/{terms,privacy,sources}/page.tsx
├── (auth)/consent/page.tsx
├── (dashboard)/layout.tsx
├── (dashboard)/settings/data/page.tsx
└── api/{health,account}/route.ts
components/{app-shell,source-status}.tsx
lib/
├── env.ts
├── logging.ts
├── rate-limit.ts
├── auth.ts
└── supabase/{admin,client,server}.ts
supabase/{migrations,tests}/
tests/{unit,e2e}/
next.config.ts
proxy.ts
~~~

**Structure Decision**: Extend the existing single Next.js application and Supabase schema in place. Public notices and health are App Router routes; consent gates the authenticated layout; privileged deletion stays server-only; database-enforced consent, limits, and deletion use migrations and pgTAP. No parallel service, worker, or cache tier is introduced.

## Delivery Boundaries

1. Environment validation, safe logs, health, and security headers
2. Public notices, versioned consent, and dashboard gate
3. Database-backed limits on risky operations
4. Export-first confirmed account/data deletion
5. Provider attribution and original-first notices
6. Runbook, cross-platform tests, and production-like smoke evidence

## Complexity Tracking

No constitution violation or complexity exception is accepted. The service-role client exists only because ordinary clients cannot delete Auth users; application data remains governed by RLS and account-bound database functions.
