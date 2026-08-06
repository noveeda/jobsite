# HTTP Contracts: 공개 베타 운영

**Audience**: application implementation, security review, and automated tests
**Base media type**: `application/json; charset=utf-8`

## Common rules

- Authenticated routes verify the Supabase session with `auth.getUser()`; decoded-but-unverified client claims are not authorization.
- Request-supplied account IDs are rejected. The account is always the verified `auth.uid()`.
- Mutation routes require an `Origin` exactly matching the configured public application origin and authentication cookies with `SameSite=Lax`, `Secure` in production, and `HttpOnly` where Supabase permits. A missing or mismatched origin returns `403 ORIGIN_NOT_ALLOWED` before parsing the body.
- JSON mutation bodies require `Content-Type: application/json`. Unsupported media types return `415 UNSUPPORTED_MEDIA_TYPE`.
- Bodies are stream-limited before buffering. Exceeding a route limit aborts reading and returns `413 PAYLOAD_TOO_LARGE`.
- Every response includes `X-Request-Id`. A syntactically valid incoming ID may be reused only if it is 8-64 ASCII letters, digits, `_`, or `-`; otherwise the server generates one.
- Responses containing account state use `Cache-Control: no-store`.
- Errors never contain tokens, cookies, provider keys, OAuth codes, stack traces, SQL text, request bodies, job content, email addresses, or evidence that an unrelated account exists.

## Error envelope

```json
{
  "code": "RATE_LIMITED",
  "message": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  "requestId": "01J4Z8MZJ6RX8C5WRD9H40M3Q9",
  "details": {
    "retryAfterSeconds": 42
  }
}
```

`code`, `message`, and `requestId` are always present. `details` contains only bounded, documented scalar metadata. Unexpected failures use `500 INTERNAL_ERROR` with the same public message regardless of internal cause.

## Rate-limit response contract

Protected operations consume one request from the authenticated account's action bucket before provider access or mutation. Accepted and rejected responses include:

```text
RateLimit-Limit: 10
RateLimit-Remaining: 7
RateLimit-Reset: 1786057260
```

`RateLimit-Reset` is the bucket reset time as Unix seconds. A rejection returns `429 RATE_LIMITED`, adds `Retry-After` in whole seconds, and performs no provider call or mutation. Failure to reach the durable limiter returns `503 RATE_LIMIT_UNAVAILABLE` and also performs no protected operation.

| Route | Action | Window / maximum |
|---|---|---:|
| `POST /api/jobs/preview` | `source_preview` | 10 / minute |
| `POST /api/jobs/{jobId}/refresh` | `source_refresh` | 30 / 30 minutes |
| `POST /api/import/validate` | `import_validate` | 10 / hour |
| `POST /api/import/commit` | `import_commit` | 3 / hour |
| `POST /api/consents` | `consent_write` | 10 / hour |
| `DELETE /api/account` | `account_delete` | 3 / hour |

Provider-wide contract quotas remain an additional server-side ceiling; a user allowance never overrides them.

## Record mandatory consent

### `POST /api/consents`

Records acceptance of the exact currently required terms and privacy versions. Authentication and same-origin checks are required. Maximum body size is 2 KiB.

**Request**

```json
{
  "termsVersion": "2026-08-07",
  "privacyVersion": "2026-08-07",
  "accepted": true
}
```

Unknown fields, `accepted` other than literal `true`, invalid version syntax, and omitted fields return `400 INVALID_CONSENT`.

**Success `200`**

```json
{
  "termsVersion": "2026-08-07",
  "privacyVersion": "2026-08-07",
  "acceptedAt": "2026-08-07T06:30:00.000Z",
  "current": true
}
```

The server supplies `acceptedAt`. Repeating the same version pair returns the existing record with `200` and does not change its timestamp.

**Errors**

- `400 INVALID_CONSENT`
- `401 AUTH_REQUIRED`
- `403 ORIGIN_NOT_ALLOWED`
- `409 CONSENT_VERSION_STALE` with only the required `termsVersion` and `privacyVersion`
- `413 PAYLOAD_TOO_LARGE`
- `429 RATE_LIMITED`
- `503 RATE_LIMIT_UNAVAILABLE`
- `503 CONSENT_STORE_UNAVAILABLE`

After either required version changes, dashboard requests redirect the authenticated user to `/consent`. Public legal pages remain accessible without consent or authentication.

## Delete the current account

### `DELETE /api/account`

Permanently deletes the verified Supabase Auth account. Existing public-table data is removed by foreign keys rooted at `auth.users(id) on delete cascade`. The route never accepts a user ID. Maximum body size is 1 KiB.

**Preconditions**

- A verified authenticated session is present.
- The session was established by a fresh provider sign-in no more than 10 minutes earlier. Refreshing an access token does not refresh this age.
- The request is same-origin and passes the `account_delete` rate limit.

**Request**

```json
{
  "confirmation": "회원탈퇴",
  "exportAcknowledged": true
}
```

`confirmation` must exactly equal `회원탈퇴`; Unicode normalization, surrounding whitespace, and case substitution are not accepted. `exportAcknowledged` must be literal `true`, confirming that export was offered and the permanent effect was shown.

**Success `204`**

- The Auth user is deleted through the server-only Supabase Admin API.
- Database cascades remove all rows owned by the account, including consent and request-usage rows.
- Authentication cookies are expired on the response.
- The body is empty and `Cache-Control: no-store` is set.
- A concurrent request that authenticated before deletion but finds the same target already absent also completes with `204`.

**Errors**

- `400 INVALID_CONFIRMATION`
- `401 AUTH_REQUIRED`
- `403 ORIGIN_NOT_ALLOWED`
- `403 REAUTH_REQUIRED` with `{ "reauthenticateAt": "/login?next=%2Fsettings%2Faccount&reauth=1" }`
- `413 PAYLOAD_TOO_LARGE`
- `429 RATE_LIMITED`
- `503 RATE_LIMIT_UNAVAILABLE`
- `503 ACCOUNT_DELETE_UNAVAILABLE`

No error identifies whether any other account exists. `ACCOUNT_DELETE_UNAVAILABLE` means success is unconfirmed; the UI keeps the user on the account page and offers retry rather than logging them out.

## Public health check

### `GET /api/health`

Unauthenticated, read-only readiness check for deployment probes. It accepts no body, performs no provider API call, and completes or times out within 2 seconds.

**Healthy `200`**

```json
{
  "status": "ok",
  "database": "ok",
  "timestamp": "2026-08-07T06:30:00.000Z",
  "version": "9b6959f"
}
```

**Unavailable `503`**

```json
{
  "status": "unavailable",
  "database": "unavailable",
  "timestamp": "2026-08-07T06:30:00.000Z",
  "version": "9b6959f"
}
```

The database probe is a bounded constant query and does not enumerate tables or users. `version` is the public deployment commit identifier, shortened to 7-40 lowercase hexadecimal characters. The response never includes environment names, hostnames, regions, connection strings, dependency versions, exception messages, latency internals, provider enablement, quota state, or credentials.

**Headers**

```text
Cache-Control: no-store
Content-Type: application/json; charset=utf-8
X-Content-Type-Options: nosniff
X-Request-Id: <request id>
```

Methods other than `GET` return `405 METHOD_NOT_ALLOWED`. Database timeout, configuration failure, and query failure all map to the same `503` representation while internal sanitized telemetry retains only the error category and request ID.

## Existing sensitive routes

The following existing contracts gain the common authentication, origin, stream-size, and durable rate-limit rules without changing their successful payloads:

- `POST /api/jobs/preview`: now requires a verified session; no anonymous caller can consume provider quota.
- `POST /api/jobs/{jobId}/refresh`: consumes the limit only when the stored 30-minute cache does not satisfy the request; the ownership check occurs before provider access.
- `POST /api/import/validate` and `POST /api/import/commit`: hard limit is 10 MiB while streaming. Commit revalidates inside the database transaction; direct RPC calls enforce the same byte and collection limits.

`GET /api/export` remains authenticated and `Cache-Control: no-store`; it is not mutation-origin checked. Legal pages and `/api/health` are the only new unauthenticated public surfaces.

## Security response policy

All application responses include:

```text
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Frame-Options: DENY
```

Production HTTPS responses additionally include `Strict-Transport-Security: max-age=31536000; includeSubDomains`. Content Security Policy permits only application assets, Supabase authentication/API connections, and the minimum Google OAuth navigation targets; it sets `frame-ancestors 'none'`, `object-src 'none'`, and `base-uri 'self'`. CSP violations never cause the policy, nonce, session, or full blocked URL to be written to application logs.

## Logging contract

One bounded structured event may contain: timestamp, request ID, route template, method, response class, duration bucket, authenticated-user keyed hash, rate-limit action, and sanitized error code. The keyed hash is for correlation only and is neither the raw UUID nor reversible without the server secret.

Logs must exclude authorization headers, cookies, OAuth codes, email, IP address, raw URLs and query strings, request/response bodies, job fields, memos, backup contents, provider responses, Supabase keys, provider keys, and stack traces in user-facing output.
