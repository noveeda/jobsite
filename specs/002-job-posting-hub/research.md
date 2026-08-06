# Phase 0 Research: 개인용 통합 채용공고 허브

**Date**: 2026-08-06
**Feature**: `002-job-posting-hub`

## 1. Runtime and application shape

**Decision**: Node.js 24 LTS, current stable Next.js App Router, React, TypeScript strict mode, and one npm workspace.

**Rationale**: Node.js 24 is the current LTS line. Next.js supplies server-rendered UI, server actions, and route handlers in one application, so a separate frontend/backend split is unnecessary. TypeScript strict mode catches source-normalization and import/export shape errors early.

**Alternatives considered**:

- Separate SPA and API service: rejected because it duplicates authentication, deployment, and types for a personal MVP.
- Node.js 26: rejected because it is Current rather than LTS as of the planning date.
- Monorepo: rejected because there is only one deployable application.

**Official references**:

- https://nodejs.org/en/about/previous-releases
- https://nextjs.org/docs/app
- https://nextjs.org/docs/app/getting-started/route-handlers

## 2. Authentication, storage, and cross-device sync

**Decision**: Supabase Google social login, Postgres, Row Level Security (RLS), and Realtime within the existing Supabase client.

**Rationale**: One managed service satisfies Google login, relational storage, account isolation, and open-client synchronization. Every user-owned table carries `user_id`; RLS policies enforce `auth.uid() = user_id` for select, insert, update, and delete. Google provider tokens are not stored because the application does not call Google APIs.

**Alternatives considered**:

- Firebase Auth and Firestore: rejected because duplicate groups, source records, revisions, and atomic restore are relational.
- Auth.js or Clerk plus a separate database: rejected because it adds identity-to-database integration without adding MVP value.
- Custom authentication server: rejected for security and maintenance cost.
- No Realtime: simpler, but does not reliably satisfy visible cross-device updates within 10 seconds while both clients remain open.

**Official references**:

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/realtime/subscribing-to-database-changes

## 3. Source integration and compliance

**Decision**: Use only approved official APIs. Implement `manual`, `saramin_api`, and `jobkorea_api` connectors behind capability checks. A connector remains disabled until its approval and credentials are present. HTML scraping, browser automation, private endpoint use, and access-control bypass are prohibited.

**Rationale**: The project constitution requires allowed access and traceability. Saramin provides an approval-based API with an access key and a documented daily limit. JobKorea provides an approval-based API, but individuals and ordinary businesses may be denied. Both APIs provide structured fields and original detail URLs, matching the requirement not to copy full job descriptions.

**Operational rules**:

- Saramin: enable only after API approval and key issuance; enforce a conservative limit of 500 requests per day.
- JobKorea: enable only after explicit approval, registered server IP, and issued call URL.
- Before approval or when disabled: store the URL and use manual entry.
- Store source name, original URL, external ID, connector mode, observed time, and last successful check.
- Opening details may refresh only when the connector is enabled and the last check exceeds a 30-minute TTL.
- A connector can be disabled immediately without hiding previously saved user records.

**Alternatives considered**:

- Direct HTML parsing with Cheerio: rejected because robots rules do not grant reuse rights and current terms/official API paths make unapproved copying unsafe.
- Playwright/Puppeteer collection: rejected because it increases access risk and violates the no-bypass rule.
- Treating robots.txt as permission: rejected because crawl directives are not an API or content-use license.

**Official references**:

- https://oapi.saramin.co.kr/guide/info
- https://oapi.saramin.co.kr/guide/job-search-id
- https://oapi.saramin.co.kr/caution
- https://www.jobkorea.co.kr/service/api
- https://www.jobkorea.co.kr/robots.txt
- https://www.saramin.co.kr/zf_user/help/terms-of-service

## 4. Data access and schema changes

**Decision**: Use Supabase migrations, generated database types, and the Supabase client directly; do not add an ORM.

**Rationale**: The data model is relational but small. Database constraints, RLS, triggers, and generated types cover the required safety without another abstraction layer.

**Alternatives considered**:

- Prisma or Drizzle: deferred until direct queries measurably become difficult.
- Repository interfaces: rejected because there is one database implementation.

## 5. Truthfulness and provenance

**Decision**: Store queryable normalized columns plus a `field_provenance` JSON object mapping each field to `source`, `normalized`, `user`, `missing`, `not_applicable`, or `failed`. Store a short summary only; never store the full source body.

**Rationale**: This keeps filters simple while satisfying the constitution's fact/inference separation. User edits remain distinguishable from source observations.

**Alternatives considered**:

- One row per field value: rejected as excessive joins and UI complexity for a fixed MVP field set.
- One opaque JSON document: rejected because filtering and validation become harder.
- LLM summary: rejected; a deterministic template from approved structured fields is sufficient for MVP.

## 6. Duplicate detection

**Decision**: Use deterministic normalization and a weighted score over company, title/role, location, and overlapping dates. Create suggestions only; confirmed and rejected pairs are user decisions.

**Rationale**: It is explainable, testable with fixtures, and requires no embeddings or model service.

**Alternatives considered**:

- Embeddings/AI matching: deferred until measured false-negative cases justify it.
- Automatic merge: rejected by the constitution and specification.

## 7. Conflict history and restore

**Decision**: Postgres assigns server timestamps, last committed update becomes current, and a trigger records the prior row in `job_revisions` before update or delete. Restoring a revision performs a normal update and creates another revision.

**Rationale**: This implements reversible last-write-wins in one transaction. Clients patch only changed fields to reduce unrelated overwrites.

**Alternatives considered**:

- Client timestamps: rejected because clocks can drift or be manipulated.
- Field-level CRDT: rejected as unnecessary for one user's personal records.

## 8. Export and restore

**Decision**: Versioned UTF-8 JSON containing jobs, sources, duplicate decisions, revisions needed for user recovery, notes, status, and next actions. Restore uses validate-then-commit in one transaction.

**Rationale**: JSON preserves structure and provenance and can be validated before any write. A schema version enables future migrations.

**Alternatives considered**:

- CSV only: rejected because nested sources, provenance, and history do not round-trip safely.
- Direct database dump: rejected because it exposes implementation details and is unsafe for account-scoped restore.

## 9. Testing

**Decision**: Vitest for pure domain and connector fixtures, pgTAP for constraints/RLS/triggers, and Playwright for the smallest critical end-to-end flows. Live source APIs are not called in CI.

**Rationale**: Each tool covers a distinct constitutional risk: normalization/duplicates, account isolation/data recovery, and visible user workflows. Official API responses are stored as sanitized fixtures.

**Alternatives considered**:

- Playwright only: rejected because database policies and pure matching rules need faster focused checks.
- Live API tests in CI: rejected because approvals, quotas, and external availability make them nondeterministic.

**Official references**:

- https://supabase.com/docs/guides/database/testing
- https://nextjs.org/docs/app/guides/testing
- https://playwright.dev/docs/test-webserver

## 10. Deferred decisions

- Account deletion and retention policy: required before public release; not needed to validate the personal MVP workflow.
- Paid or public redistribution: requires fresh source agreements and a separate specification.
- Additional sources: each requires a separate allowed-access review and connector decision.
