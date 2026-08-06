# Source Connector Contract

## Purpose

Define the only allowed boundary for external job information. Connectors normalize approved structured data and never scrape or archive full pages.

## Connector capabilities

```text
manual
approved_api
```

A provider starts in `manual`. It becomes `approved_api` only when deployment configuration confirms approval and credentials.

## Required operations

### `recognize(url)`

- Parses the URL using the standard URL parser.
- Returns provider and external ID when the URL matches documented public patterns.
- Performs no network request.

### `preview(reference)`

- Requires an enabled approved API connector.
- Calls only the documented provider API host.
- Returns permitted structured fields plus field-level provenance.
- Returns a typed failure that always permits manual entry.

### `refresh(source)`

- Applies the 30-minute per-source TTL.
- Rechecks status and structured fields through the approved API.
- Never overwrites fields whose current provenance is `user`.
- Records a source check and last success/failure time.

## Normalized result

```ts
type SourceResult = {
  provider: 'saramin' | 'jobkorea'
  externalId: string
  originalUrl: string
  observedAt: string
  status: 'active' | 'closed' | 'unknown'
  values: Partial<{
    title: string
    companyName: string
    roleName: string
    employmentTypes: string[]
    locations: string[]
    careerMinYears: number
    careerMaxYears: number
    educationText: string
    salaryText: string
    skills: string[]
    postedAt: string
    deadlineAt: string
    deadlineKind: 'fixed' | 'rolling' | 'until_hired' | 'unknown'
  }>
  provenance: Record<string, {
    origin: 'source' | 'normalized' | 'missing' | 'not_applicable' | 'failed'
    observedAt: string
  }>
}
```

This type describes a contract, not an instruction to store source bodies.

## Saramin adapter

- Endpoint family: official Saramin employment API only.
- Enablement: approved application plus server-side access key.
- Budget: maximum 500 requests per day; the implementation must reject calls after the local conservative budget is exhausted.
- Store: API-permitted structured fields, external ID, detail URL, status, timestamps.
- Do not store: access key, full description HTML, images, or undocumented fields.

## JobKorea adapter

- Endpoint family: unique call URL issued after official approval.
- Enablement: approval, registered server IP, and issued URL.
- Store: company, title, job/industry, location, qualifications, salary, detail URL, and other explicitly supplied structured fields.
- Detail content and applications remain on the original JobKorea link.
- If approval is absent or revoked, connector capability becomes `manual` immediately.

## Manual adapter

- Accepts any valid HTTPS original URL.
- Performs no server-side fetch.
- Marks user-entered fields as `user` and unavailable fields as `missing` or `failed` only when the user explicitly records that distinction.

## Forbidden behavior

- HTML crawling or browser automation as a fallback
- Login/session reuse against a job provider
- CAPTCHA, robots, rate-limit, or access-control bypass
- Private endpoint discovery or undocumented API calls
- Full-body, image, review, salary-database, or interview-content copying
- Enabling a provider without approval evidence and deployment credentials

## Failure codes

`MANUAL_ONLY | CONNECTOR_DISABLED | SOURCE_ID_NOT_FOUND | SOURCE_RATE_LIMITED | SOURCE_UNAVAILABLE | SOURCE_RESPONSE_INVALID | SOURCE_CLOSED`

All failures preserve the URL and allow manual entry. Errors stored in the database are sanitized codes, not raw provider responses.

## Compliance switch

Each provider has one server-side enable/disable switch. Disabling prevents new network calls but preserves stored structured data, original links, user edits, notes, statuses, and history. Provider terms and API conditions must be reviewed before public or paid deployment.
