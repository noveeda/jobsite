# Quickstart Validation: 자동 통합 채용공고 탐색

이 문서는 구현 완료 여부를 Windows 로컬, 스테이징, Linux CI에서 검증하는 실행 가이드다. 실제 출처 키가 없어도 fixture provider로 핵심 파이프라인을 검증할 수 있다.

## 1. Prerequisites

- Node.js 24
- npm
- Docker Desktop 또는 Podman과 Supabase CLI
- 기존 Supabase 로컬 스택
- Google OAuth는 기존 로그인 E2E 또는 승인된 테스트 계정 사용
- 실제 사람인 검증 시에만 승인된 SARAMIN_API_KEY 필요

관련 설계:
- [Data Model](./data-model.md)
- [Provider Adapter](./contracts/provider-adapter.md)
- [Feed and Collector](./contracts/feed-and-collector.md)
- [Backup v2 Schema](./contracts/backup-v2.schema.json)

## 2. Migration History Safety Gate

현재 연결 원격은 0060_job_history.sql을 적용한 상태이고 linked dry-run pending은 0이다.

1. Git에서 내용이 동일한 006_job_history.sql → 0060_job_history.sql rename을 먼저 확정한다.
2. 연결 원격에 migration repair를 실행하지 않는다.
3. 폐기 가능한 로컬 DB는 새 파일 기준으로 reset한다.
4. 로컬 데이터를 반드시 보존해야 할 때만 사전 백업 후 local ledger의 006을 reverted, 0060을 applied로 재키한다.
5. 이후 migration은 UTC 14자리 버전을 사용한다.

Expected:
- linked migration list와 repository가 0060을 표시한다.
- linked db push dry-run은 pending 0이다.
- fresh local reset이 성공한다.

## 3. Environment

로컬 비밀파일에 다음 값을 설정한다. 실제 값은 Git, 문서, 로그, 채팅에 복사하지 않는다.

~~~text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

APP_BASE_URL=http://127.0.0.1:3000
AUTOMATIC_DISCOVERY_ENABLED=false
COLLECTOR_ENABLED=false
CRON_SECRET=local-random-secret-at-least-16-characters
OPERATOR_USER_IDS=comma-separated-supabase-user-ids

SARAMIN_CONNECTOR_ENABLED=false
SARAMIN_API_KEY=
~~~

주의:
- 현재 코드와 계획의 사람인 키 이름은 SARAMIN_API_KEY다.
- NEXT_PUBLIC 접두사를 사람인 키나 service-role 키에 붙이지 않는다.
- 승인 전에는 SARAMIN_CONNECTOR_ENABLED=false를 유지한다.
- 스테이징은 fixture 또는 별도로 허가된 테스트 접근만 사용한다.

## 4. Install and Baseline

PowerShell:

~~~powershell
npm ci
npx supabase start
npx supabase db reset
npm run lint
npm run typecheck
npm run test:unit
npx supabase test db
npm run build
~~~

Expected:
- 기존 수동 등록, 개인 상태, 백업 v1 테스트가 계속 통과한다.
- 새 migration이 fresh reset에서 순서대로 적용된다.
- TypeScript database types가 schema와 일치한다.

## 5. Provider Contract Without Real Key

fixture provider로 다음을 확인한다.

1. 서로 다른 cursor 형식의 두 fixture provider가 같은 수집 계약을 통과한다.
2. 동일 provider+externalId 재수집은 source posting을 중복 생성하지 않는다.
3. partial run은 누락 공고를 종료하지 않는다.
4. 허가 철회·보존기간 만료 purge는 공유 필드를 최소화하고 개인 상태를 보존한다.
5. complete run 한 번 누락은 missing_once, 두 번째 연속 누락은 closed다.
6. quota가 소진되면 외부 요청 전에 중단한다.
7. 오류와 URL 로그에 CRON_SECRET, SARAMIN_API_KEY가 없다.
8. 교차 출처 유사 공고는 후보만 만들고 자동 병합하지 않는다.

Expected:
- 재실행 후 row 수가 안정적이다.
- 개인 상태와 메모 손실이 없다.
- provider 실패가 다른 provider run을 막지 않는다.

## 6. Collector Route

개발 서버를 실행한다.

~~~powershell
npm run dev
~~~

별도 PowerShell에서 Authorization header로 수동 호출한다. 실제 비밀값을 shell history에 남기지 않도록 현재 세션 환경변수를 사용한다.

~~~powershell
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/cron/collect' -Headers @{ Authorization = ('Bearer ' + $env:JOBHUB_CRON_SECRET) } -ContentType 'application/json' -Body '{"reason":"scheduled"}'
~~~

Expected:
- secret 없음/오류: 401
- collector flag false: 503
- enabled fixture: run ID와 안정 상태만 반환
- 원천 payload, credential, 사용자 데이터는 반환하지 않음
- 같은 schedule bucket 중복 호출은 중복 수집하지 않음

## 7. Database Security

pgTAP에서 확인:

- authenticated 사용자는 허용된 canonical_jobs/source_postings를 SELECT할 수 있다.
- 브라우저 역할은 공용 카탈로그를 INSERT/UPDATE/DELETE할 수 없다.
- personal_job_states와 personal_duplicate_decisions는 owner만 접근한다.
- collection_runs, provider_daily_usage, provider 설정은 일반 authenticated에 노출되지 않는다.
- ingest/claim/quota RPC는 anon/authenticated execute가 revoke되고 service_role만 실행한다.
- 계정 삭제는 개인 상태만 제거하고 공용 공고는 제거하지 않는다.
- 종료·출처 중단 후 개인 메모와 상태는 유지된다.

## 8. Feed End-to-End

Playwright에서 로그인·동의 완료 fixture 사용자로 검증:

1. 사전 등록 없이 공용 공고 100개 이상이 보인다.
2. 첫 화면은 30개이며 더 보기 후 60개가 된다.
3. 검색·지역·직무·경력·고용형태·마감·출처 필터가 URL에 유지된다.
4. 확인되지 않은 필드가 활성 필터에 일치하지 않고 정보 없음 건수가 보인다.
5. 저장·지원상태는 배지로 표시되지만 기본 정렬을 바꾸지 않는다.
6. 제외 공고는 기본 숨김이고 제외 포함 화면에서 복원할 수 있다.
7. 상세에서 목록으로 돌아오면 원래 카드에 초점이 복원된다.
8. partial/failed 상태에서도 마지막 유효 공고와 마지막 성공 시각이 보인다.
9. 사람인 fixture가 보이는 목록·상세·병합 화면에 Powered by 취업 사람인과 원문 링크가 있다.
10. 수동 URL 등록은 보조 메뉴에 있고 신규 사용자 첫 행동으로 요구되지 않는다.

## 9. Accessibility and Mobile

~~~powershell
npm run test:a11y
npm run test:e2e
~~~

Expected:
- 핵심 여정 axe serious/critical 0
- 키보드만으로 검색, 필터, 더 보기, 저장, 제외 복원이 가능
- 상태 변경이 스크린리더에 전달됨
- 360 CSS px에서 가로 스크롤 없음
- 주요 입력·버튼·링크가 최소 44×44 CSS px
- 모바일 details 필터에서 적용 개수와 전체 초기화 확인

## 10. Backup Compatibility

검증 순서:

1. 기존 v1 파일 validate/commit 성공
2. v2 export에 legacy, personalStates, duplicateDecisions, manualLinks 포함
3. 같은 v2 파일 두 번 복원해 중복 생성 없음
4. 다른 DB에서 source reference로 canonical 재연결
5. canonical이 없으면 private legacy placeholder로 메모·상태 복구
6. 허용되지 않은 전체 출처 payload가 export에 없음

## 11. Scheduler Staging

Vercel Hobby Cron은 하루 한 번 제한이므로 시간 단위 수집 호출 스케줄로 사용하지 않는다.

Supabase staging에서:

1. pg_cron, pg_net, Vault 사용 가능 여부 확인
2. Vault에 고정 배포 URL과 CRON_SECRET 저장
3. 매시간 HTTP POST job을 생성하고 provider next_due_at은 6시간 간격으로 설정
4. collector/feed flags는 처음 false
5. fixture provider 한 개로 run/lease/quota/log 확인
6. 허가된 실제 provider를 한 개씩 활성화
7. 독립 provider 2개, 활성 공고 100개, 귀속표시, 반복 측정 freshness p95 게이트 통과 후 자동 피드를 기본화

Expected:
- cron run history와 collection_runs가 대응한다.
- 중복 cron invocation이 한 schedule bucket에서 한 run만 수행한다.
- rollback은 cron과 두 feature flag disable로 완료되고 기존 개인 기록은 유지된다.

## 12. Linux Compatibility Gate

Ubuntu CI 또는 Linux runner에서 다음을 fresh checkout 기준으로 실행한다.

~~~bash
npm ci
npx supabase start
npx supabase db reset
npx supabase test db
npm run verify
npm run test:e2e
~~~

확인:
- 대소문자 다른 import 0건
- OS 전용 path/명령 의존 없음
- UTC schedule bucket과 날짜별 quota가 Windows 결과와 동일
- Chromium 핵심 E2E 통과
- native binary 신규 의존성 없음

## 13. Real Saramin Activation Gate

승인 후에만:

1. Vercel Production에 SARAMIN_API_KEY와 SARAMIN_CONNECTOR_ENABLED=true 등록
2. Preview에는 별도 허가 없으면 키를 넣지 않음
3. 승인 URL, 약관, attribution, 보존 허용 범위를 source_providers에 기록
4. 목록·상세의 지정 표시를 실제 응답으로 확인
5. 400 scheduled/100 reserve quota와 URL redaction 확인
6. 공개 서비스 전 캐시·종료 후 최소 필드 보존 범위를 api@saramin.co.kr에 서면 확인

실패 시 사람인 connector만 disable하며 크롤링으로 대체하지 않는다.
## 14. Representative User Acceptance

출시 전 최소 10명의 대표 구직자에게 설명 없이 공고 찾기와 저장을 수행하게 한다. 각 참여자의 완료 여부와 시간을 익명 집계하고 2분 이내 성공률 90% 이상을 validation.md에 기록한다. 이메일·메모·지원 이력 등 개인 데이터는 기록하지 않는다.