# Engineering Lessons

짧은 형식만 유지한다: **증상 → 근본 원인 → 예방 규칙 → 증명**. 비밀값과 일회성 로그는 기록하지 않는다.

## PostgreSQL JSON 타입 가드

- 증상: purge 중 scalar/object JSON이 배열 함수에 전달되면 전체 transaction이 rollback될 수 있다.
- 근본 원인: `AND`의 좌→우 평가에 의존했다. PostgreSQL은 boolean predicate를 재정렬할 수 있다.
- 예방 규칙: `jsonb_array_length/elements` 입력은 항상 `CASE jsonb_typeof(...) WHEN 'array' THEN value ELSE '[]'::jsonb END`로 먼저 타입을 고정한다.
- 증명: `npx supabase test db supabase/tests/automatic_discovery_purge_hardening.test.sql`

## 개인 필터와 pagination 순서

- 증상: 앞쪽 결과가 제외 상태면 페이지가 덜 차고 `total`·`hasMore`가 실제보다 작아진다.
- 근본 원인: 공용 결과를 limit한 뒤 개인 상태 필터를 적용했다.
- 예방 규칙: owner overlay와 excluded/saved 조건은 count·정렬·limit보다 먼저 DB 후보 집합에 적용한다.
- 증명: `npx supabase test db supabase/tests/personal_job_feed.test.sql`

## `datetime-local` 시간대 왕복

- 증상: 저장된 UTC 시각을 다시 저장하면 한국 시간 기준 9시간 이동한다.
- 근본 원인: UTC ISO 문자열을 `.slice(0, 16)` 해 로컬 wall time으로 오해했다.
- 예방 규칙: 표시할 때 브라우저 로컬 구성요소로 포맷하고 제출할 때만 `toISOString()`으로 UTC 변환한다.
- 증명: 관련 시간대 단위 테스트와 `tests/e2e/application-tracking.spec.ts`

## Playwright와 Next E2E 상태

- 증상: setup API는 성공하지만 페이지가 fixture cookie/state를 보지 못하거나 Server Action 이후 RSC가 이전 상태를 읽는다.
- 근본 원인: 독립 `request` fixture의 cookie jar와 브라우저 context가 다르고, dev module graph의 메모리 상태 공유를 가정했다.
- 예방 규칙: setup은 `page.context().request`를 사용하고, 비운영 E2E 상태는 production에서 닫힌 HttpOnly cookie로 전달한다.
- 증명: `npx playwright test tests/e2e/application-tracking.spec.ts tests/e2e/job-discovery.spec.ts --project=chromium`

## pgTAP 선행 계약 TODO

- 증상: 후속 구현을 위한 RED 계약 때문에 전체 DB suite가 실패하거나, 이미 통과하는 assertion까지 TODO로 묶인다.
- 근본 원인: 의존성 게이트보다 먼저 작성한 계약의 TODO 개수·범위를 실제 assertion과 다르게 지정했다.
- 예방 규칙: 이미 가능한 호환성 검사는 실제 GREEN으로 유지하고, 미구현 기능 assertion만 정확한 개수로 나눠 TODO 처리한다.
- 증명: `npx supabase test db`

## Windows sandbox 실행 실패

- 증상: 안전한 읽기·검증 명령도 `CreateProcessAsUserW failed: 5`로 시작되지 않는다.
- 근본 원인: 명령 자체가 아니라 Windows sandbox process 생성 권한이 거부됐다.
- 예방 규칙: 같은 명령을 우회 작성하지 말고 즉시 승인된 escalated 실행으로 한 번만 재시도한다.
