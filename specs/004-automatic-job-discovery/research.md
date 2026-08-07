# Phase 0 Research: 자동 통합 채용공고 탐색

## Decision 1: 현재 웹 스택 유지

**Decision**: Next.js 16.3, React 19, TypeScript, Node 24, Supabase PostgreSQL/RLS, Zod, Vitest, pgTAP, Playwright를 그대로 사용하고 새 ORM·queue·worker 의존성을 추가하지 않는다.

**Rationale**: 기존 코드가 서버 전용 Supabase 관리자 클라이언트, 표준 fetch, 테스트 체계를 이미 갖추고 있다. PostgreSQL의 unique constraint, lease, upsert, transaction이 초기 수집 규모의 멱등성과 동시성 요구를 충족한다.

**Alternatives considered**: Prisma/Drizzle, Redis/BullMQ, 별도 worker, Supabase Edge Function 전면 이전은 운영면과 런타임을 늘리므로 기각한다.

## Decision 2: 공용 카탈로그를 추가형 스키마로 분리

**Decision**: 기존 사용자 소유 jobs/job_sources는 수동·legacy 흐름으로 유지하고 source_providers, canonical_jobs, source_postings, collection_runs, provider_daily_usage, personal_job_states, duplicate candidates/decisions, source issue reports, legacy bridge를 추가한다.

**Rationale**: 기존 jobs는 user_id와 개인 메모·지원상태를 공고 사실과 함께 저장해 공용 피드로 재사용할 수 없다. 기존 테이블을 즉시 변경하면 RPC, 백업, realtime, 계정 삭제가 동시에 깨진다.

**Alternatives considered**: 기존 jobs의 user_id nullable 변경은 파괴 범위가 크고, 사용자마다 자동 공고를 복제하면 갱신 비용과 데이터 드리프트가 커져 기각한다.

## Decision 3: Supabase Cron이 Vercel 수집 경로 호출

**Decision**: Supabase Cron/pg_net이 매시간 POST /api/cron/collect를 호출하고, 데이터베이스의 provider due 시각이 6시간 간격의 실제 수집 여부를 결정한다. URL과 CRON_SECRET은 Supabase Vault에 보관한다. 경로는 Node runtime에서 CRON_SECRET을 검증하고 due provider의 제한된 batch를 완료한 뒤 응답한다.

**Rationale**: 2026-01-28 기준 Vercel Hobby Cron은 하루 1회만 허용해 6시간 목표를 만족하지 못한다. Supabase hosted PostgreSQL은 pg_cron과 pg_net 예약 HTTP 호출을 지원한다.

**Alternatives considered**: Vercel Pro 업그레이드는 현재 개인용 무료 운영 목표에 불필요하다. Edge Function은 Deno 런타임과 배포면을 추가한다. 외부 cron은 운영 플랫폼을 늘린다.

**Sources**:
- https://vercel.com/docs/cron-jobs/usage-and-pricing
- https://supabase.com/docs/guides/cron
- https://supabase.com/docs/guides/functions/schedule-functions

## Decision 4: 서버 전용 Provider Adapter와 공통 cursor

**Decision**: 각 출처는 capabilities, compliance, fetchPage, normalize, health/quota 계약을 구현한다. cursor는 출처 내부 표현을 감춘 opaque 값이다. 사람인은 GET https://oapi.saramin.co.kr/job-search를 SARAMIN_API_KEY로 서버에서만 호출하고 count=110, 수정일순, 증분 구간과 순환 완전 수집을 조합한다.

**Rationale**: 사람인의 page index를 모든 출처에 강제하지 않으면서 두 번째 출처를 같은 수집 파이프라인에 연결할 수 있다. 키를 브라우저와 로그에서 차단한다.

**Alternatives considered**: 클라이언트 직접 호출은 키 유출, 공고별 ID 조회만은 신규 발견 불가, 제공자별 독립 테이블은 검색·상태 결합이 어려워 기각한다.

**Sources**:
- https://oapi.saramin.co.kr/guide/job-search
- https://oapi.saramin.co.kr/guide/1

## Decision 5: 호출량·재시도·종료 판정

**Decision**: 사람인 500회/일 중 정기 수집 400회, 재시도·운영 100회를 예약한다. 데이터베이스 원자 카운터로 호출 전에 차감한다. partial run의 누락은 종료 근거가 아니며, 명시적 종료 또는 완전 수집 2회 연속 누락 후 종료한다. 신규·수정은 6시간, 종료 공개 제외는 24시간 목표다.

**Rationale**: process-memory 카운터는 서버리스 인스턴스 간 공유되지 않는다. 사람인은 진행 중 공고만 반환하므로 1회 누락 즉시 종료하면 부분 실패 때 정상 공고가 사라진다.

**Alternatives considered**: 매 회차 전체 수집은 호출 예산을 소진하고, 증분만 사용하면 종료를 찾지 못하며, 누락 1회 삭제는 데이터 손실 위험이 있다.

## Decision 6: 지정 귀속표시와 보수적 보존

**Decision**: 사람인 데이터가 보이는 목록·상세·사용자 병합 화면에는 Powered by 취업 사람인 링크를 표시한다. 원문 응답 전체는 장기 저장하지 않는다. 종료 후 개인 메모·상태와 provider/externalId/originalUrl/status만 유지하며, 더 넓은 보존은 서면 허가를 Source Provider 설정에 기록한 뒤 허용한다.

**Rationale**: 사람인 공식 문서는 지정 표시를 요구하지만 캐시·종료 후 보존기간을 명시하지 않는다. 허용을 추정하는 것보다 최소 보존이 안전하다.

**Alternatives considered**: 일반 배지만 표시하거나 전체 응답을 무기한 저장하는 방안은 제공 조건 충족을 입증할 수 없어 기각한다.

**Sources**:
- https://oapi.saramin.co.kr/introduce
- https://oapi.saramin.co.kr/caution
- https://oapi.saramin.co.kr/help

## Decision 7: 교차 출처 중복은 후보만 자동 생성

**Decision**: 같은 provider+externalId만 자동 동일성으로 취급한다. 교차 출처 유사도는 candidate만 만들고 사용자별 병합·분리 결정과 되돌리기 이력을 적용한다.

**Rationale**: Constitution IV가 자동 중복 처리를 후보 제안으로 제한하며, 사용자의 최종 결정과 복구를 요구한다.

**Alternatives considered**: 임계값 자동 병합은 헌법 위반과 상태 손실 위험이 있고, 중복 기능을 제거하면 P4를 충족하지 못한다.

## Decision 8: URL 기반 Server Component 피드

**Decision**: /jobs는 GET 검색조건과 take=30,60 방식의 더 보기를 사용한다. 데이터베이스에서 필터·결정적 정렬·범위를 적용하고 공용 공고에 현재 사용자의 sparse personal state를 결합한다. 모바일 필터는 같은 form을 native details로 접는다.

**Rationale**: 현재 전체 1,000건 메모리 필터와 전체 DOM 렌더를 제거하면서 별도 클라이언트 store나 API를 추가하지 않는다. URL이 새로고침·공유·뒤로가기 상태를 보존한다.

**Alternatives considered**: 무한스크롤, cursor 클라이언트 store, custom drawer, 별도 REST feed는 초기 1,000건 범위에 과하다.

## Decision 9: 허가 철회와 보존기간을 실행 가능한 purge로 강제

**Decision**: provider disable 또는 retention expiry 시 service-role 전용 purge RPC가 source_values와 canonical 파생 필드를 허용된 최소 식별정보로 축소한다. 개인 상태, 메모, provider/externalId/originalUrl/status는 유지하고 삭제 건수와 근거를 collection run에 남긴다.

**Rationale**: 문서와 UI 숨김만으로는 Constitution II/IV와 DT-006/SC-009의 실제 데이터 최소화를 충족하지 못한다.

**Alternatives considered**: 운영자 수동 SQL은 누락·오류 위험이 있고, provider row 전체 삭제는 개인 상태 복구를 깨뜨려 기각한다.

## Decision 10: 백업 v1 호환과 v2 확장

**Decision**: v1 import를 유지하고 v2에 personalStates, duplicate decisions, manual links를 추가한다. 공용 공고 전체 대신 portable source reference와 허용된 최소 표시 snapshot만 포함한다. 없는 canonical은 private legacy placeholder로 복구한다.

**Rationale**: UUID만 저장하면 다른 환경에서 복구되지 않고, 공용 원문 전체를 사용자 백업에 복제하면 재배포·용량 문제가 생긴다.

**Alternatives considered**: v1 즉시 폐기, canonical UUID only, 전체 공고 snapshot export는 각각 호환성·복구·권리 문제로 기각한다.

## Decision 11: Windows 개발과 Linux 운영

**Decision**: Node 24 표준 Web API와 OS 중립 npm/SQL만 사용하고 native binary 의존성을 추가하지 않는다. Windows 로컬 Supabase와 Ubuntu CI fresh reset, pgTAP, Chromium E2E를 모두 게이트로 둔다. 경로 대소문자, UTC bucket, 환경변수 URL을 검증한다.

**Rationale**: Vercel은 Linux이고 로컬은 Windows이므로 fresh database와 case-sensitive import 검증이 배포 차이를 가장 빨리 발견한다.

**Alternatives considered**: OS별 스크립트나 로컬 장기 worker는 환경 드리프트를 키워 기각한다.