# Contract: Feed and Collector

## Authenticated Feed

### Route

GET /jobs

공개되지 않은 Server Component 화면이다. (dashboard) layout의 인증·동의 gate와 데이터 계층의 authenticated query/RLS를 모두 통과해야 한다.

### Query Parameters

| Parameter | Rules |
|---|---|
| q | 길이 제한된 검색어 |
| region | 허용 목록 또는 정규화 값 |
| role | 허용 목록 또는 정규화 값 |
| career | 검증된 경력 범위 |
| employment | 허용 고용 형태 |
| deadline | active, closingSoon, unknown |
| source | enabled provider code |
| sort | posted 기본, deadline 선택 |
| includeExcluded | true일 때만 제외 공고 포함 |
| saved | true일 때 현재 사용자의 저장 공고만 표시 |
| take | 기본 30, 30의 배수, 최대 1020 |

알 수 없거나 잘못된 값은 안전한 기본값으로 정규화하고 오류 stack을 사용자에게 노출하지 않는다. 필터가 바뀌면 take는 30으로 초기화한다.

### Query Result

| Field | Meaning |
|---|---|
| items | 공용 공고와 현재 사용자의 sparse state overlay |
| total | 필터와 제외 정책을 적용한 전체 수 |
| missingCounts | 활성 필터 속성이 정보 없음인 공고 수 |
| hasMore | take보다 결과가 많은지 |
| health | ready, preparing, partial, failed, degraded |
| providerHealth | 출처, lastSuccessAt, stable error code |

기본 정렬:
1. 확인 가능한 postedAt descending
2. lastObservedAt descending
3. canonical job id ascending

개인 saved/status는 배지로만 표시하고 공용 정렬에 사용하지 않는다. excluded는 기본 숨김이다.

### More Results

더 보기는 현재 GET 조건을 보존하고 take를 30 증가시킨다. 무한스크롤과 별도 client store를 사용하지 않는다.

### Detail Return

목록 링크는 검증된 내부 returnTo와 #job-{id} anchor를 전달한다. 상세의 목록 복귀는 이 경로를 사용하고, 목록은 anchor 대상에 초점을 복원한다. 외부 URL은 returnTo로 허용하지 않는다.

### UI States

- preparing: loading.tsx skeleton, 초기 수집 설명, live status
- ready with zero: 적용 조건, 정보 없음 수, 전체 초기화
- partial: 정상·cached 공고 유지, 실패 출처와 마지막 성공을 status banner로 표시
- failed: 마지막 유효 공고가 있으면 유지하고 재시도·운영 상태를 alert로 표시
- degraded: 출처 수 또는 활성 공고가 공개 게이트 아래로 감소하면 복수 출처 branding을 제거하고 운영 경고 표시
- unexpected exception: error.tsx error boundary와 retry

장애를 정상 빈 결과로 표현하지 않는다.

## Personal State Mutations

Server Actions:
- save/unsave
- exclude/restore
- update application status
- update memo/next action
- decide/revert duplicate

모든 action은 현재 user를 서버에서 다시 확인하고 owner RLS를 통과해야 한다. 성공 후 /jobs와 관련 상세를 revalidate한다. 실패를 성공처럼 표시하지 않는다.

## Scheduled Collector

### Route

POST /api/cron/collect

### Authentication

- Authorization: Bearer {CRON_SECRET}
- secret이 없거나 일치하지 않으면 401
- production에서 COLLECTOR_ENABLED=true인데 CRON_SECRET이 없으면 fail-closed
- request/response/log에 secret을 포함하지 않음
- browser session이나 user JWT는 사용하지 않음

### Request

~~~json
{
  "provider": "optional-provider-code",
  "reason": "scheduled"
}
~~~

provider가 없으면 due 상태인 enabled provider를 제한된 수만 claim한다. schedule bucket과 database lease가 중복 호출을 no-op으로 만든다.

### Success Response

~~~json
{
  "requestId": "opaque-id",
  "runs": [
    {
      "runId": "uuid",
      "provider": "saramin",
      "status": "succeeded-or-partial",
      "fetched": 0,
      "upserted": 0,
      "closed": 0,
      "nextRetryAt": null
    }
  ]
}
~~~

credential, 원천 payload, 사용자 데이터는 반환하지 않는다.

### Status Codes

| Code | Meaning |
|---|---|
| 200 | 처리 또는 멱등 no-op 완료 |
| 400 | 알 수 없는 provider/invalid request |
| 401 | cron authentication 실패 |
| 409 | 다른 유효 lease가 처리 중; 안전한 no-op body 허용 |
| 503 | collector disabled 또는 필수 운영 설정 누락 |
| 500 | 예상 밖 서버 오류, requestId만 노출 |

### Scheduler Binding

Supabase Cron/pg_net이 매시간 이 경로를 호출한다. 경로는 provider next_due_at을 확인해 6시간 주기가 되지 않은 출처를 quota 소비 없이 no-op 처리한다. 배포 URL과 CRON_SECRET은 Supabase Vault에 보관한다. 로컬에서는 예약 실행 대신 같은 header로 수동 호출한다.

## Provider Attribution

사람인 source posting이 한 건이라도 표시되는 카드·상세·개인 병합 묶음에는 Powered by 취업 사람인 링크와 원문 링크를 모두 표시한다. attribution은 접힌 영역 안에만 숨기지 않는다.
## Operator Source Control

- /settings/sources는 OPERATOR_USER_IDS에 포함된 로그인 사용자만 접근한다.
- 서버 page는 service-role로 provider enabled, last success/failure, fetched/upserted/closed counts, stable error를 조회한다.
- disable action은 operator를 다시 확인하고 provider.enabled=false 및 disabled_reason을 기록한다.
- 일반 authenticated 사용자는 provider 운영 테이블이나 action을 직접 호출할 수 없다.
- unit/E2E는 비운영자 거부, 운영자 조회, disable 후 외부 호출 0회를 검증한다.

## Field Provenance and Conflict Display

- 상세 화면은 정규화 값마다 출처와 observedAt을 표시한다.
- 두 출처 값이 충돌하면 어느 하나를 숨겨 확정하지 않고 출처별 값을 나란히 표시한다.
- 사용자 입력은 source fact와 다른 표식으로 구분한다.
- duplicate/issue E2E fixture는 서로 다른 마감일·근무지를 저장부터 화면까지 검증한다.