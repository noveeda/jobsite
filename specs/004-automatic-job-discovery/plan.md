# Implementation Plan: 자동 통합 채용공고 탐색

**Branch**: 004-automatic-job-discovery | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from specs/004-automatic-job-discovery/spec.md

## Summary

현재 사용자별 북마크 구조를 유지하면서, 허용된 출처의 공고를 공용 카탈로그로 수집하는 추가형 모델을 도입한다. 출처 어댑터가 구조화 데이터를 공통 Source Posting으로 정규화하고, 공용 Canonical Job과 사용자별 Personal Job State를 분리한다. Supabase Cron이 매시간 CRON_SECRET으로 보호된 Next.js 수집 경로를 호출하고 각 출처는 6시간 due 간격을 적용하며, PostgreSQL lease·멱등 키·원자적 호출량 카운터가 중복 실행과 서버리스 재시도를 통제한다. 기존 수동 공고와 백업 v1은 유지하고 기능 플래그로 자동 피드를 단계적으로 전환한다.

## Technical Context

**Language/Version**: TypeScript 5, Node.js 24, SQL/PLpgSQL on PostgreSQL 17

**Primary Dependencies**: Next.js 16.3 App Router, React 19.2.8, Supabase JS/SSR 2.x, Zod 4; 새 런타임 의존성 없음

**Storage**: Supabase PostgreSQL, Row Level Security, Vault와 pg_cron/pg_net을 이용한 예약 호출

**Testing**: Vitest, Supabase pgTAP, Playwright, axe-core, ESLint, TypeScript compiler

**Target Platform**: Windows 11 로컬 개발, Vercel Linux Node runtime 운영, Supabase hosted PostgreSQL

**Project Type**: 단일 Next.js 웹 애플리케이션과 관리형 PostgreSQL

**Performance Goals**: 대표 공고 1,000개 이상에서 검색·필터 결과의 95%를 2초 이내 표시; 화면당 최초 30개; 출처 정상 시 신규·변경의 95%를 6시간 이내 반영

**Constraints**: 로그인 사용자만 공고 데이터 조회; Vercel Hobby Cron은 하루 1회이므로 수집 예약에 사용하지 않음; Supabase Cron은 매시간 호출하되 provider due 간격은 6시간; 사람인 하루 500회·요청당 최대 110건; 출처별 허가·귀속표시·보존정책 우선; 서버 전용 비밀키; 교차 출처 자동 병합 금지

**Scale/Scope**: 공개 베타 게이트는 독립 제공자 2개와 활성 공고 총 100개 이상; 초기 검증 범위 1,000~11,000개 공고, 개인 사용자 중심

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Personal Value**: 신규 사용자가 직접 등록 없이 공고를 탐색하고 저장하는 P1~P3 흐름이 각각 독립 검증 가능하다.
- **Source Compliance & Traceability**: 출처별 허가, 원문 URL, 최초·마지막 확인 시각, 지정 귀속표시, 보존정책을 Source Provider와 Source Posting에 기록한다. 허가가 없으면 수집기를 활성화하지 않는다.
- **Data Truthfulness**: 원천 값은 Source Posting의 source_values에, 선택된 정규화 값과 provenance는 Canonical Job에, 사용자 입력은 Personal Job State에 분리한다. 부분 수집 누락은 종료 근거로 쓰지 않는다.
- **User Control & Recovery**: 교차 출처 중복은 후보만 제시하고 사용자가 병합·분리하며 이력을 보존한다. 공고 종료 후에도 개인 상태와 메모를 보존하고 백업 v1 호환 및 v2 복원을 제공한다.
- **Simplicity & Verification**: 기존 Next.js·Supabase·표준 fetch만 사용한다. ORM, Redis, queue, 별도 worker, 클라이언트 상태관리 도입 없이 PostgreSQL 제약·RPC와 Server Component를 재사용한다.

**Gate Result Before Research**: PASS. 자동 병합 문구는 Clarify에서 사용자 확인·되돌리기 방식으로 정정되었고, 출처 허가 전 활성화 금지가 명시되었다.

**Gate Result After Design**: PASS. 공용/개인 데이터 분리, service-role 전용 쓰기, 보수적 보존, 단계적 기능 플래그와 독립 검증 계약이 모든 원칙을 충족한다.

## Project Structure

### Documentation (this feature)

~~~text
specs/004-automatic-job-discovery/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── provider-adapter.md
│   ├── feed-and-collector.md
│   └── backup-v2.schema.json
└── tasks.md
~~~

### Source Code (repository root)

~~~text
app/
├── (dashboard)/jobs/
│   ├── page.tsx
│   ├── loading.tsx
│   ├── error.tsx
│   ├── queries.ts
│   └── [id]/page.tsx
├── (dashboard)/settings/sources/
│   ├── page.tsx
│   └── actions.ts
└── api/cron/collect/route.ts

components/
├── job-list.tsx
├── filters.tsx
├── provider-attribution.tsx
└── feed-status.tsx

lib/
├── collection/
│   ├── collect.ts
│   ├── normalize.ts
│   └── quota.ts
├── sources/
│   ├── connector.ts
│   ├── saramin.ts
│   └── fixtures/
├── supabase/
│   ├── admin.ts
│   └── database.types.ts
└── validation/
    ├── feed.ts
    └── backup.ts

supabase/
├── migrations/
└── tests/

tests/
├── unit/
└── e2e/
~~~

**Structure Decision**: 현재 단일 Next.js 프로젝트를 유지한다. 수집 조정 로직만 lib/collection에 분리하고 출처별 변환은 기존 lib/sources를 확장한다. 공용 피드와 개인 상태는 동일 Server Component 쿼리에서 결합하며 별도 API·상태관리 계층을 만들지 않는다.

## Rollout Strategy

1. 내용이 동일한 006_job_history.sql → 0060_job_history.sql Git rename을 먼저 확정한다. 연결 원격은 이미 0060이고 pending migration이 없으므로 linked repair는 금지한다.
2. UTC 14자리 버전의 추가형 마이그레이션으로 공용 카탈로그를 만들며 같은 transaction에서 RLS·revoke를 적용해 fail-closed 상태로 커밋한다. 후속 migration은 RPC, feed, 개인 상태, 중복, 백업, legacy link, hosted schedule 순으로 각각 새 번호를 사용한다.
3. AUTOMATIC_DISCOVERY_ENABLED=false, COLLECTOR_ENABLED=false 상태로 호환 코드를 먼저 배포한다.
4. 모의 제공자와 사람인 비활성 어댑터로 unit·pgTAP·E2E를 통과시킨다.
5. 스테이징에서 한 출처씩 허가 기록·비밀키·귀속표시·보존정책을 검증하고 수집 플래그를 켠다.
6. 독립 제공자 2개와 활성 공고 100개 게이트를 통과한 뒤 피드를 자동 탐색 기본 화면으로 전환한다.
7. 장애 시 수집·피드 플래그만 끄고 기존 수동 흐름과 개인 기록은 유지한다. 기존 테이블 삭제는 별도 기능으로 미룬다.

## Complexity Tracking

Constitution 위반 없음. 새 테이블과 Provider Adapter는 공용 카탈로그와 서로 다른 외부 계약을 표현하기 위한 최소 경계이며, 새 서비스나 런타임 의존성은 추가하지 않는다.