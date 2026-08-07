# Contract: Provider Adapter

## Purpose

허용된 출처를 공통 수집 파이프라인에 연결하면서 출처별 페이지 방식, 호출량, 표시·보존 의무를 격리한다. 브라우저에서 이 계약을 호출하지 않는다.

## Provider Configuration

필수 속성:

| Name | Meaning |
|---|---|
| code | 안정적인 출처 식별자 |
| capabilities | incremental, completeSnapshot, explicitClose, cursor 방식 |
| compliance | 승인상태, 약관 URL, 귀속표시, 호출 제한, 보존정책, 수익화 제한 |
| enabled | 필수 승인·비밀키·표시·보존 설정이 모두 유효할 때만 true |

비밀키 값은 configuration object, database row, client response에 포함하지 않고 서버 환경변수로만 읽는다.

## fetchPage Input

| Field | Type | Rules |
|---|---|---|
| cursor | opaque or null | adapter 밖에서 해석하지 않음 |
| changedSince | UTC timestamp or null | 증분 지원 시 사용 |
| scope | normalized object | 허용된 직무·지역 범위 |
| runId | UUID | 로그·upsert 추적 |
| signal | AbortSignal | timeout/cancellation |

## fetchPage Output

| Field | Type | Rules |
|---|---|---|
| items | provider records | normalize 전 임시 메모리 값, 영구 raw 저장 금지 |
| nextCursor | opaque or null | 다음 page |
| total | integer or null | 출처가 제공할 때만 |
| snapshotComplete | boolean | 허용 범위 전체 성공 시만 true |
| quotaCost | positive integer | 원자 카운터와 일치 |
| fetchedAt | UTC timestamp | 응답 관찰 시각 |

## normalize Output: SourcePostingInput

필수:
- providerCode
- externalId
- originalUrl
- sourceStatus
- fetchedAt
- allowed sourceValues
- normalized candidate values
- fieldProvenance

선택:
- company URL
- location/category code와 표시값
- posted/modified/open/expiration timestamp
- close type
- salary text: 출처가 표시를 허용할 때만

금지:
- 크롤링으로 보완한 본문
- 출처가 제공하지 않은 추정값을 source fact로 표시
- credential 또는 요청 access-key
- 허가되지 않은 전체 raw response 영구 저장

## Error Contract

| Stable Code | Retry | Provider State |
|---|---|---|
| CONNECTOR_DISABLED | no | disabled 유지 |
| SOURCE_AUTH_INVALID | no | 자동 중단+운영 경고 |
| SOURCE_REQUEST_INVALID | no | 배포 오류 |
| SOURCE_RATE_LIMITED | next reset/retryAfter | 기존 data freshness 적용 |
| SOURCE_TIMEOUT | bounded | partial/failed |
| SOURCE_UNAVAILABLE | bounded | partial/failed |
| SOURCE_RESPONSE_INVALID | no for same payload | 운영 검토 |
| SOURCE_TERMS_BLOCKED | no | 즉시 중단 |

오류와 로그에는 URL query, access-key, 사용자 메모를 포함하지 않는다.

## Quota Contract

- 호출 전에 provider_daily_usage의 원자 RPC로 quota를 소비한다.
- 사람인: hard limit 500/day, scheduled budget 400, reserve 100.
- quota 소비 실패 시 외부 요청을 보내지 않는다.
- preview와 scheduled collection이 같은 hard limit을 공유한다.
- in-memory counter는 테스트 보조 외 운영 판정에 사용하지 않는다.

## Snapshot and Closure

- 성공한 page는 run이 나중에 partial이 되어도 멱등 upsert할 수 있다.
- completeSnapshot=false이면 누락 공고의 missing counter를 바꾸지 않는다.
- completeSnapshot=true인 reconciliation에서만 누락 횟수를 증가시킨다.
- 명시적 종료 또는 완전 수집 2회 연속 누락 후 공개 피드에서 closed 처리한다.
- 종료 후 retention policy가 허용하지 않는 sourceValues를 service-role purge RPC로 제거한다.
- provider 허가 철회 또는 retention 만료 시 purge는 개인 상태를 유지하고 최소 provider/externalId/originalUrl/status만 남긴다.
- purge는 transaction과 idempotency를 보장하고 삭제 건수·근거를 비밀정보 없이 기록한다.

## Saramin Binding

- Endpoint: GET https://oapi.saramin.co.kr/job-search
- Secret environment: SARAMIN_API_KEY
- Enable flag: SARAMIN_CONNECTOR_ENABLED
- Maximum count: 110
- Server-only access; access-key query는 logger에서 제거
- Attribution: Powered by 취업 사람인 with https://www.saramin.co.kr
- 진행 중 공고만 반환하는 특성 때문에 증분 조회와 순환 완전 수집을 함께 사용