# Implementation Plan: 개인용 통합 채용공고 허브

**Branch**: `002-job-posting-hub` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-job-posting-hub/spec.md`

## Summary

Build one Next.js web application that lets a Google-authenticated user save, normalize, search, deduplicate, and track job postings across devices. Supabase supplies Google login, Postgres, RLS, revisions, and Realtime. Saramin and JobKorea integrations use only approved official APIs; until approval, those sources fall back to URL storage and manual entry. The application stores structured fields, provenance, and short deterministic summaries, never full source bodies.

## Technical Context

**Language/Version**: TypeScript strict mode on Node.js 24 LTS

**Primary Dependencies**: Current stable Next.js App Router and React; `@supabase/supabase-js`; `@supabase/ssr`; Zod 4; no ORM

**Storage**: Supabase Postgres with SQL migrations, RLS, triggers, and Realtime publication

**Testing**: Vitest; Supabase pgTAP; Playwright Chromium; sanitized official-API fixtures

**Target Platform**: Modern desktop and mobile web browsers; Node-compatible server deployment, initially Vercel-compatible

**Project Type**: Single full-stack web application

**Performance Goals**: Saved detail visible within 2 seconds; approved-source refresh result visible within 10 seconds for 95% of test cases; filtered search across 100 jobs completed within 1 second; cross-device updates visible within 10 seconds

**Constraints**: Google social login; account-isolated data; official approved source APIs only; Saramin 500-request daily ceiling; JobKorea approval and registered IP/call URL; no full-body copy; reversible changes; versioned export/restore; no credentials in the repository; no offline edit queue—failed writes require reconnection and explicit retry

**Scale/Scope**: Personal-use MVP, tens to low thousands of jobs per account, five primary user journeys, two conditional official source connectors, no collaboration or admin console

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Personal Value**: PASS — one user can register a URL, review normalized data, search, manage status, and recover records without public-service features.
- **Source Compliance & Traceability**: PASS — only approved Saramin/JobKorea APIs are allowed; connectors are disabled before approval; manual fallback remains; source, URL, external ID, connector mode, and observation times are stored.
- **Data Truthfulness**: PASS — normalized columns carry per-field provenance; deterministic summaries are labeled; unknown, not-applicable, failed, source, normalized, and user values remain distinct.
- **User Control & Recovery**: PASS — no automatic merge, revision triggers preserve overwritten values, restore is reversible, source failure cannot delete user records, and versioned export/restore is mandatory.
- **Simplicity & Verification**: PASS — one application and one managed backend; no scraper, separate API service, ORM, Redis, queue, CRDT, or LLM; Vitest, pgTAP, and Playwright cover distinct high-risk boundaries.

**Gate Result Before Research**: PASS. Direct HTML extraction would fail the gate and is explicitly prohibited; the approved-API/manual design passes.

**Gate Result After Design**: PASS. Phase 1 contracts retain approval gates, RLS ownership, provenance, reversible revisions, validated restore, and no full-body storage.

## Phase 0: Research Decisions

Research is recorded in [research.md](./research.md). All technical unknowns are resolved. Source approval is an external enablement prerequisite, not an unresolved design choice: a source remains `manual` until approved credentials exist.

## Phase 1: Design

- Data entities, constraints, relationships, state transitions, RLS boundaries, and revision behavior are defined in [data-model.md](./data-model.md).
- User-visible actions and server boundaries are defined in [contracts/http-api.md](./contracts/http-api.md).
- Source connector capabilities and compliance behavior are defined in [contracts/source-connectors.md](./contracts/source-connectors.md).
- Backup portability is defined by [contracts/export-schema.json](./contracts/export-schema.json).
- End-to-end validation is defined in [quickstart.md](./quickstart.md).

## Project Structure

### Documentation (this feature)

```text
specs/002-job-posting-hub/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── source-connectors.md
│   └── export-schema.json
└── tasks.md                 # created by speckit-tasks
```

### Source Code (repository root)

```text
app/
├── (auth)/login/page.tsx
├── auth/callback/route.ts
├── (dashboard)/jobs/
│   ├── page.tsx
│   ├── new/page.tsx
│   └── [id]/page.tsx
├── api/
│   ├── jobs/preview/route.ts
│   ├── jobs/[id]/refresh/route.ts
│   ├── export/route.ts
│   └── import/
│       ├── validate/route.ts
│       └── commit/route.ts
└── layout.tsx
components/
├── job-form.tsx
├── job-list.tsx
├── job-detail.tsx
├── filters.tsx
└── source-status.tsx
lib/
├── auth.ts
├── supabase/
│   ├── client.ts
│   ├── server.ts
│   └── database.types.ts
├── sources/
│   ├── connector.ts
│   ├── manual.ts
│   ├── saramin.ts
│   └── jobkorea.ts
├── domain/
│   ├── deadlines.ts
│   ├── duplicates.ts
│   ├── provenance.ts
│   └── backup.ts
└── validation/
    ├── jobs.ts
    └── backup.ts
supabase/
├── migrations/
└── tests/
tests/
├── fixtures/sources/
├── unit/
└── e2e/
```

**Structure Decision**: Use the standard single Next.js application layout. Route handlers exist only for secrets-bearing source calls and transactional export/restore. Normal authenticated job reads and writes use server actions or the Supabase client under RLS; no duplicate REST CRUD layer is introduced.

## Delivery Boundaries

1. Authentication and RLS foundation
2. Manual URL registration and structured job management
3. Search, filter, deadlines, status, notes, and duplicate decisions
4. Revisions, cross-device sync, export, validate, and restore
5. Saramin connector enabled only after approval
6. JobKorea connector enabled only after approval

A connector's missing approval does not block the personal workflow because manual entry remains complete and testable.

## Complexity Tracking

No constitutional violation is accepted. The three test tools are retained because they cover non-overlapping boundaries: TypeScript domain behavior, database security/transaction behavior, and browser workflows. Supabase Realtime is retained solely to meet the specified 10-second active cross-device update target.
