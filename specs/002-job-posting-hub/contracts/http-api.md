# HTTP and User Action Contracts

**Audience**: application implementation and tests
**Authentication**: all routes except login callback require a verified Supabase session

## Contract conventions

- JSON request and response bodies use UTF-8.
- Errors use `{ "code": string, "message": string, "details"?: object }` and never expose secrets or raw provider bodies.
- Request-supplied `userId` is ignored/rejected; ownership comes from the verified session.
- Mutations accept `deviceId` for revision display but never for authorization.
- Source calls return a stored preview or failure state without blocking manual entry.

## Authentication

### `GET /auth/callback`

Exchanges the Google OAuth PKCE code for a Supabase session and redirects to `/jobs`.

- Success: `303 /jobs`
- Invalid/expired code: `303 /login?error=oauth_callback`

No Google provider access or refresh token is stored by the application.

## Source preview

### `POST /api/jobs/preview`

Creates a review-only draft from a URL. It does not persist a job.

**Request**

```json
{
  "url": "https://example.com/job/123"
}
```

**Success `200`**

```json
{
  "source": {
    "provider": "saramin",
    "connectorMode": "approved_api",
    "originalUrl": "https://example.com/job/123",
    "externalId": "123",
    "observedAt": "2026-08-06T10:00:00Z"
  },
  "draft": {
    "title": "...",
    "companyName": "...",
    "roleName": "...",
    "summary": "...",
    "fieldProvenance": {}
  },
  "warnings": []
}
```

**Manual fallback `200`**

```json
{
  "source": {
    "provider": "other",
    "connectorMode": "manual",
    "originalUrl": "https://example.com/job/123",
    "observedAt": null
  },
  "draft": null,
  "warnings": ["SOURCE_MANUAL_ONLY"]
}
```

**Errors**

- `400 INVALID_URL`
- `400 UNSUPPORTED_SCHEME`
- `401 AUTH_REQUIRED`
- `413 SOURCE_RESPONSE_TOO_LARGE`
- `422 SOURCE_ID_NOT_FOUND`
- `429 SOURCE_RATE_LIMITED` with manual fallback information
- `502 SOURCE_UNAVAILABLE` with manual fallback information

Only HTTPS URLs and provider-approved hosts are eligible for API preview. No arbitrary server-side URL fetch is performed.

## Persist and edit jobs

Normal job list/detail operations are authenticated server actions backed by RLS rather than a duplicate public CRUD API.

### `createJob(input)`

Requires title, company name, at least one source URL, deadline kind, and valid provenance. Returns the created job and any duplicate suggestions.

### `updateJob(jobId, patch, deviceId)`

Accepts only changed fields. The database records the old snapshot and server timestamp before applying the patch.

### `setApplicationStatus(jobId, status, deviceId)`

Allows any valid status correction and records a revision.

### `decideDuplicate(pairId, decision)`

Accepts `confirmed` or `rejected`; group changes occur transactionally and preserve both jobs.

### `restoreRevision(jobId, revisionId, deviceId)`

Verifies account ownership, restores the snapshot, and records the state it replaced.

## Refresh one source

### `POST /api/jobs/{jobId}/refresh`

Starts when a supported job detail is opened. The UI displays stored data first.

**Request**

```json
{ "sourceId": "uuid" }
```

**Response `200`**

```json
{
  "status": "active",
  "checkedAt": "2026-08-06T10:00:00Z",
  "changedFields": ["deadlineAt"],
  "job": {}
}
```

**Cached response `200`**

If `lastCheckedAt` is within 30 minutes, return the stored result with `"cached": true` and make no provider call.

**Non-blocking failure `200`**

```json
{
  "status": "unreachable",
  "checkedAt": "2026-08-06T10:00:00Z",
  "errorCode": "SOURCE_UNAVAILABLE",
  "job": {}
}
```

The response always retains the last stored job. An unsupported/manual source returns `"status": "unsupported"` without a network request.

## Export

### `GET /api/export`

Returns an attachment named `job-hub-export-YYYYMMDD.json` conforming to [export-schema.json](./export-schema.json).

- `200 application/json`
- `401 AUTH_REQUIRED`
- Provider keys, auth tokens, and raw full bodies are never included.

## Restore validation

### `POST /api/import/validate`

Accepts a JSON file up to 10 MiB and performs no database mutations.

**Response `200`**

```json
{
  "valid": true,
  "schemaVersion": 1,
  "counts": {
    "jobs": 42,
    "sources": 50,
    "duplicatePairs": 3,
    "revisions": 80
  },
  "conflicts": 2,
  "warnings": []
}
```

Invalid files return `422 INVALID_BACKUP` with bounded field-level errors.

## Restore commit

### `POST /api/import/commit`

Accepts the same JSON payload, repeats full validation, and applies it in one transaction.

- Payload user IDs are not accepted; all rows bind to the current account.
- Existing IDs are replaced only after their prior states are revised.
- Any validation or database error rolls back the entire import.
- Success returns inserted, updated, and revision counts.

## Realtime contract

Authenticated clients subscribe only to their own `jobs`, `job_sources`, `duplicate_pairs`, and `job_revisions` changes. RLS remains authoritative. A received change triggers a scoped refetch; the event payload is not treated as trusted complete state.
