# Quickstart Validation Guide

**Feature**: `002-job-posting-hub`
**Purpose**: prove the planned MVP works end to end without relying on unapproved or live provider calls in automated tests

## Prerequisites

- Node.js 24 LTS and npm
- Docker-compatible runtime for local Supabase
- Supabase CLI
- A Supabase project or local stack
- Google social login configured in Supabase for interactive login validation
- Optional: approved Saramin API key
- Optional: approved JobKorea call URL and registered server IP

Source approval is not required for manual-entry validation. A connector must remain disabled when its approval or credentials are absent.

## Environment

Create `.env.local` from the implementation's `.env.example` and set only the values relevant to the environment:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

SARAMIN_CONNECTOR_ENABLED=false
SARAMIN_API_KEY=

JOBKOREA_CONNECTOR_ENABLED=false
JOBKOREA_API_URL=
```


Provider secrets and issued URLs are server-only and must never use a `NEXT_PUBLIC_` prefix or enter the repository.

## Local setup

After implementation tasks create the application:

```powershell
npm install
npx supabase start
npx supabase db reset
npm run dev
```

Open `http://localhost:3000`.

## Automated verification

Run the smallest complete verification set:

```powershell
npm run lint
npm run typecheck
npm run test:unit
npx supabase test db
npm run test:e2e
```

Expected results:

- TypeScript strict checks and lint pass.
- Unit tests pass for URL recognition, provenance, deadline state, duplicate scoring, deterministic summary, backup validation, and sanitized source fixtures.
- pgTAP proves constraints, transaction rollback, revision creation/restore, and cross-account RLS denial.
- Playwright passes the critical user journeys below.
- Automated tests make no request to live Saramin or JobKorea endpoints.

## Critical user journeys

### 1. Google login and account isolation

1. Sign in with a Google test account.
2. Confirm `/jobs` is accessible and logout returns to `/login`.
3. Create one job under account A.
4. Use an isolated account B test session and attempt direct read/update/delete by account A's job ID.
5. Confirm every cross-account operation is denied and account A's job remains unchanged.

### 2. Manual URL registration

1. Keep both provider connectors disabled.
2. Paste a JobPlanet or arbitrary HTTPS job URL.
3. Confirm the system performs no server-side fetch and opens a manual structured form.
4. Enter company, title, location, deadline, and memo.
5. Confirm fields are marked `user`, the source URL is retained, and the job appears in the unified list.

### 3. Approved source preview using fixtures

1. Use sanitized Saramin and JobKorea API fixtures in unit/E2E mode.
2. Paste a recognized provider URL.
3. Confirm preview fields, source, original URL, external ID, observation time, and provenance appear before save.
4. Edit one preview field and save.
5. Confirm the edited field is `user` and later fixture refresh does not silently overwrite it.

### 4. Search, filter, and deadline state

1. Seed at least 100 fixture jobs.
2. Search company/title/role and combine region, career, employment, status, source, and deadline filters.
3. Confirm excluded jobs remain hidden until the excluded filter is selected.
4. Confirm fixed, expired, rolling, until-hired, and unknown deadlines are distinct.
5. Confirm the target result is found within the specification's time limit.

### 5. Duplicate suggestion and reversal

1. Add two fixtures with similar company, role, location, and overlapping dates.
2. Confirm a suggestion shows its weighted reasons and neither job is automatically merged.
3. Confirm the pair, verify both source URLs remain, then split it.
4. Confirm both jobs, notes, statuses, and revisions remain.
5. Reject a similar but distinct pair and confirm it is not re-suggested unchanged.

### 6. Status, sync conflict, and revision restore

1. Open the same account in two browser contexts with different device IDs.
2. Change the same job field to different values.
3. Confirm the last server-committed value becomes current within 10 seconds.
4. Open history and restore the prior value.
5. Confirm the restore itself creates another revision and can be reversed.

### 7. Non-blocking detail refresh

1. Open a saved supported-source detail page.
2. Confirm stored content appears within 2 seconds while refresh status is visible.
3. Run one fixture response that changes the deadline and confirm the result appears within 10 seconds.
4. Run one timeout/error fixture and confirm stored content remains visible with sanitized failure state and last success time.
5. Reopen within 30 minutes and confirm the cached result prevents another provider call.

### 8. Export, validate, and restore

1. Create jobs with multiple sources, duplicate decisions, notes, statuses, provenance, and revisions.
2. Export and validate the file against `contracts/export-schema.json`.
3. Confirm it contains no auth token, Google token, source credential, user ID, or full source body.
4. Submit a corrupted export to validation and confirm the database is unchanged.
5. Import a valid export and confirm all user-owned records round-trip.
6. Force a database error during commit and confirm the entire restore rolls back.

## Optional live-source smoke validation

Perform only after documented approval and credentials are available.

### Saramin

- Enable only the Saramin connector.
- Preview one active approved-API job and one closed job.
- Confirm request-budget accounting stays below 500 calls per day.
- Confirm only documented structured fields and the original URL are stored.

### JobKorea

- Enable only after JobKorea approval, registered IP, and issued call URL are confirmed.
- Preview one approved-API result.
- Confirm detail content remains on the original JobKorea link.
- Disable the connector and confirm manual entry still works without data loss.

## Constitution re-check

Validation is incomplete if any of the following occurs:

- a source is called without approval;
- a full job body or provider credential is stored;
- one account can access another account's row;
- a source failure removes user-authored data;
- duplicate decisions or overwritten values cannot be reversed;
- invalid restore data mutates existing records;
- manual entry stops working when a connector is disabled.
