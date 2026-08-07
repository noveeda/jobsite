# Data Model: 자동 통합 채용공고 탐색

## Design Rules

- 공용 출처 사실과 사용자 개인 상태를 서로 다른 테이블에 저장한다.
- 출처가 허용한 최소 필드만 저장하며 전체 응답 원문은 영구 저장하지 않는다.
- 브라우저 사용자는 공용 카탈로그를 읽을 수 있지만 수정할 수 없다.
- 수집 쓰기는 service-role 전용 RPC로만 수행한다.
- 교차 출처 유사 공고는 자동 병합하지 않고 후보와 사용자 결정을 분리한다.
- 기존 jobs/job_sources는 수동·legacy 흐름으로 유지한다.

## Entity: source_providers

출처의 운영·준수 설정이다. 비밀키 값은 포함하지 않는다.

| Field | Type | Rules |
|---|---|---|
| code | text PK | 소문자 안정 식별자, 예: saramin |
| display_name | text | 사용자 표시명 |
| enabled | boolean | 허가와 필수 설정이 모두 확인된 경우만 true |
| access_mode | text | approved_api, public_feed 등 허용 방식 |
| terms_url | text | 적용 이용조건 |
| approval_reference | text nullable | 승인 번호·내부 증빙 참조, 비밀값 금지 |
| refresh_interval_minutes | integer | 출처 제한 이상, 목표 360분 |
| daily_limit | integer nullable | 사람인은 500 |
| page_limit | integer nullable | 사람인은 110 |
| attribution | jsonb | 필수 문구, href, 목록·상세 표시 규칙 |
| retention_policy | jsonb | 저장 가능 필드·기간·종료 처리 |
| capabilities | jsonb | incremental, complete_snapshot, explicit_close, opaque_cursor |
| last_success_at | timestamptz nullable | 마지막 완전 또는 증분 성공 |
| last_error_code | text nullable | 비밀정보 없는 안정 오류코드 |
| disabled_reason | text nullable | 운영 중단 근거 |
| created_at/updated_at | timestamptz | UTC |

Validation:
- enabled=true이면 access_mode, terms_url, attribution, retention_policy가 모두 유효해야 한다.
- credential이나 access key를 이 테이블에 저장하지 않는다.
- authenticated/anon 쓰기와 일반 authenticated 읽기를 허용하지 않고 운영 서버만 접근한다. 운영자 화면은 서버에서 OPERATOR_USER_IDS allowlist를 확인한 뒤 service-role 조회·중단 action을 사용한다.

## Entity: canonical_jobs

통합 탐색에서 사용하는 공용 정규화 공고다. 같은 출처 식별자의 재수집은 동일 row를 갱신하지만, 교차 출처 병합은 사용자 결정 전 자동 수행하지 않는다.

| Field | Type | Rules |
|---|---|---|
| id | uuid PK | 서버 생성 |
| title | text | 정규화 표시값 |
| company_name | text | 정규화 표시값 |
| role_name | text nullable | 확인된 값만 |
| locations | text[] | 확인된 값만, 빈 배열은 정보 없음 |
| employment_types | text[] | 확인된 값만 |
| career_min_years/max_years | integer nullable | 범위 검증 |
| experience_text | text nullable | 출처 표현 |
| education_text | text nullable | 출처 표현 |
| industry | text nullable | 출처 표현 |
| job_categories | text[] | 확인된 값만 |
| salary_text | text nullable | 해당 출처 표시 허가가 있을 때만 |
| posted_at | timestamptz nullable | 출처 게시 시각 |
| deadline_kind | text | fixed, rolling, until_hired, unknown |
| deadline_at | timestamptz nullable | fixed일 때 필요 |
| lifecycle_status | text | active, stale, closed, withdrawn |
| last_observed_at | timestamptz | 최신 성공 관찰 |
| field_provenance | jsonb | 필드별 source_posting, origin, observedAt |
| created_at/updated_at | timestamptz | UTC |

Indexes:
- 결정적 정렬용 posted_at desc, last_observed_at desc, id
- active 피드용 lifecycle_status partial index
- location, employment type, category 필터용 적절한 배열 index
- 제목·회사·직무 검색용 database-native search index

RLS:
- consent를 완료한 authenticated 사용자는 활성·허용된 범위의 row를 SELECT할 수 있다.
- authenticated/anon INSERT, UPDATE, DELETE는 거부한다.
- table 생성과 같은 transaction에서 RLS를 enable/force하고 public·anon·authenticated write grant를 revoke한다.
- service-role 수집 RPC만 변경한다.

## Entity: source_postings

한 출처에서 관찰한 공고와 원천 사실이다.

| Field | Type | Rules |
|---|---|---|
| id | uuid PK | 서버 생성 |
| provider_code | text FK | source_providers.code |
| canonical_job_id | uuid FK | canonical_jobs.id |
| external_id | text | provider 내부 안정 식별자 |
| original_url | text | HTTPS 원문 |
| normalized_url | text | 추적 파라미터 제거 |
| source_values | jsonb | 허용된 구조화 필드와 출처 원래 표현 |
| source_status | text | active, missing_once, closed, withdrawn, error |
| first_observed_at | timestamptz | 최초 확인 |
| last_observed_at | timestamptz | 마지막 성공 확인 |
| missing_complete_runs | smallint | 완전 수집 연속 누락 횟수 |
| last_collection_run_id | uuid nullable FK | 성공 관찰 run |
| content_fingerprint | text | 변경 감지용, 원문 본문 아님 |
| created_at/updated_at | timestamptz | UTC |

Constraints:
- unique(provider_code, external_id)
- normalized_url은 provider 범위 보조 unique
- original_url은 HTTPS
- partial/failed collection run은 missing_complete_runs를 증가시키지 않는다.
- active=0 또는 완전 수집 2회 연속 누락이면 closed 후보가 된다.
- 종료 후 retention_policy가 허용하지 않는 source_values 필드는 제거한다.

## Entity: collection_runs

예약 수집의 lease, cursor, 결과를 기록한다.

| Field | Type | Rules |
|---|---|---|
| id | uuid PK | 서버 생성 |
| provider_code | text FK | source_providers.code |
| schedule_bucket | timestamptz | UTC 기준 멱등 구간 |
| run_kind | text | incremental, reconciliation, bootstrap |
| status | text | pending, running, partial, succeeded, failed, cancelled |
| cursor | jsonb nullable | provider opaque cursor |
| snapshot_complete | boolean | 전체 범위를 끝까지 성공한 경우만 true |
| lease_until | timestamptz nullable | 중복 worker 방지 |
| attempt_count | integer | 제한된 재시도 |
| next_retry_at | timestamptz nullable | 다음 due 시각 |
| fetched_count/upserted_count/closed_count | integer | 비음수 |
| quota_used | integer | 실제 호출 수 |
| started_at/finished_at | timestamptz nullable | UTC |
| error_code | text nullable | 비밀 없는 안정 코드 |
| error_summary | text nullable | access-key, URL query, 개인 데이터 제거 |

Constraints:
- unique(provider_code, schedule_bucket, run_kind)
- 살아 있는 lease는 재claim할 수 없다.
- snapshot_complete=true는 status=succeeded에서만 가능하다.
- 부분 run의 성공 page upsert는 허용하지만 종료 판정은 금지한다.

## Retention Purge Operation

service-role 전용 purge RPC는 provider의 enabled/retention_policy와 현재 시각을 기준으로 대상 source_postings를 잠근 뒤 다음을 한 transaction에서 수행한다.

- 허용되지 않은 source_values와 canonical 파생 필드를 null 또는 빈 값으로 축소한다.
- provider_code, external_id, original_url, source_status와 개인 상태 연결키는 보존한다.
- personal_job_states, 개인 메모, 지원 상태는 변경하지 않는다.
- 처리 건수, provider, reason, executed_at을 collection_runs 또는 운영 감사 필드에 남긴다.
- 실패하면 부분 삭제를 커밋하지 않는다.

pgTAP은 허가 철회, 보존기간 만료, 개인 상태 보존, idempotent 재실행을 검증한다.

## Entity: provider_daily_usage

출처별 일일 호출량의 원자 카운터다.

| Field | Type | Rules |
|---|---|---|
| provider_code | text FK | 복합 PK |
| usage_date | date | UTC 날짜, 복합 PK |
| scheduled_calls | integer | 정기 예산 |
| reserve_calls | integer | 재시도·운영 예산 |
| updated_at | timestamptz | UTC |

RPC는 row lock 또는 원자 update로 호출 전에 예산을 소비한다. 사람인은 scheduled 400, total hard limit 500을 넘길 수 없다. 기존 process-memory dailyBudget은 운영 판정에 사용하지 않는다.

## Entity: personal_job_states

공용 공고에 대한 사용자별 sparse overlay다.

| Field | Type | Rules |
|---|---|---|
| user_id | uuid FK auth.users | 복합 PK |
| canonical_job_id | uuid FK | 복합 PK |
| saved | boolean | 기본 false |
| excluded | boolean | 기본 false |
| application_status | text | unreviewed, planned, applied, interviewing, offered, rejected, withdrawn |
| memo | text | 길이 제한, 개인 데이터 |
| next_action_at | timestamptz nullable | 개인 일정 |
| created_at/updated_at | timestamptz | UTC |

RLS:
- auth.uid()=user_id인 사용자만 SELECT/INSERT/UPDATE/DELETE.
- row가 없으면 미저장, 미제외, unreviewed로 해석한다.
- 개인 상태는 공용 정렬키와 canonical 값을 바꾸지 않는다.
- 공고가 closed/withdrawn이어도 row는 유지한다.

## Entity: duplicate_candidates

교차 출처 유사도 후보이며 자동 병합 결과가 아니다.

| Field | Type | Rules |
|---|---|---|
| id | uuid PK | 서버 생성 |
| left_job_id/right_job_id | uuid FK | 정렬된 쌍, 서로 달라야 함 |
| score | numeric | 0..1 |
| reasons | jsonb | 회사·직무·지역·기간 등 근거 |
| candidate_status | text | active, superseded |
| created_at/updated_at | timestamptz | UTC |

Constraint: unique(least job id, greatest job id). 후보 생성은 service-role만 한다.

## Entity: personal_duplicate_decisions

사용자가 후보를 개인 화면에서 병합·분리한 결정이다.

| Field | Type | Rules |
|---|---|---|
| user_id | uuid FK | 복합 PK |
| candidate_id | uuid FK | 복합 PK |
| decision | text | merged, separate, undecided |
| representative_job_id | uuid nullable | merged일 때 pair 중 하나 |
| decided_at | timestamptz | UTC |
| reverted_at | timestamptz nullable | 되돌리기 이력 |

RLS는 owner 전용이다. 결정 취소 시 원본 공고와 모든 개인 상태를 복구한다.

## Entity: source_issue_reports

| Field | Type | Rules |
|---|---|---|
| id | uuid PK | 서버 생성 |
| user_id | uuid FK | 신고자 |
| canonical_job_id | uuid FK | 대상 |
| issue_type | text | incorrect, duplicate, broken_link, attribution, other |
| detail | text nullable | 길이 제한 |
| status | text | open, reviewing, resolved, dismissed |
| created_at/resolved_at | timestamptz nullable | UTC |

사용자는 자신의 신고를 만들고 조회할 수 있으며 운영 상태 변경은 서버 전용이다.

## Entity: legacy_job_links

기존 수동 공고를 자동 공고와 선택적으로 연결한다.

| Field | Type | Rules |
|---|---|---|
| legacy_job_id | uuid PK FK jobs | 기존 사용자 공고 |
| canonical_job_id | uuid FK | 자동 공고 |
| user_id | uuid FK | 기존 소유자 |
| linked_at | timestamptz | UTC |
| link_reason | text | user_confirmed 또는 exact_provider_identity |

기존 row를 삭제하거나 이동하지 않는다. owner RLS를 적용한다.

## State Transitions

### Source Posting

~~~text
active
  ├─ explicit close ───────────────→ closed
  ├─ complete run missing once ───→ missing_once
  ├─ approval withdrawn ──────────→ withdrawn
  └─ partial/failed run ──────────→ active (unchanged)

missing_once
  ├─ observed again ──────────────→ active
  ├─ second complete-run missing ─→ closed
  └─ partial/failed run ──────────→ missing_once (unchanged)
~~~

### Collection Run

~~~text
pending → running → succeeded
                  ├→ partial
                  └→ failed → pending retry (lease expired and retry due)
~~~

### Personal State

공고 lifecycle과 독립적으로 유지된다. 저장·제외·지원 상태 변경은 revision 또는 백업 v2로 복구 가능해야 한다.

## Migration and Compatibility

1. 0060 rename을 먼저 Git 이력에 확정하고 linked remote에는 repair를 실행하지 않는다.
2. 새 migration은 UTC 14자리 버전을 사용한다.
3. Migration A(20260808000100)는 core catalog와 같은 transaction의 fail-closed RLS/revoke를 추가한다.
4. 20260808000200은 claim/quota/ingest/purge RPC, 00300은 feed query, 00400은 personal state, 00500은 duplicate/issue, 00600은 legacy bridge, 00700은 backup v2, 00800은 hosted scheduler를 각각 별도 파일로 추가한다.
5. 기존 tables, enum, RPC, backup v1, realtime publication은 제거하지 않는다.
6. 자동 탐색 플래그가 꺼져 있으면 기존 /jobs 동작이 유지된다.
7. rollback은 scheduler와 기능 플래그를 끄며 새 데이터는 조사·복구를 위해 보존한다.