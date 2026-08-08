# 공개 베타 장애 대응 Runbook

이 문서는 공개 베타에서 장애를 탐지한 시점부터 격리, 진단, 복구, 사용자 알림, 사후 검토까지 수행하는 절차다. 사용자 데이터 보존과 비밀 노출 최소화가 복구 속도보다 우선한다.

## 1. 공통 원칙

- 사용자에게 받은 request ID, 발생 시각, 화면 경로 템플릿, 보이는 오류 코드만 수집한다.
- 이메일, 사용자 UUID, 공고 URL·내용, 메모, backup 내용, OAuth code, cookie, token, key를 티켓·로그·채팅에 복사하지 않는다.
- production database에서 임의 UPDATE, DELETE, TRUNCATE, db reset을 실행하지 않는다.
- 요청 제한 저장소가 실패하면 provider 호출, import commit, consent write, account delete는 우회하지 않고 fail-closed 상태를 유지한다.
- 승인되지 않은 provider connector는 장애 대응 중에도 켜지 않는다.
- 데이터 손상 가능성이 있으면 쓰기 복구보다 먼저 새 배포와 migration을 중단하고 관리형 backup 시점을 확보한다.
- 모든 시각은 UTC ISO 8601로 기록한다.
- 수집 이상 시 provider를 재시도하기 전에 production collection schedule을 먼저 disable한다. cron command, Vault 값, Authorization header는 조회·복사·기록하지 않는다.

## 2. 심각도와 최초 대응 시간

| 등급 | 조건 | 최초 대응 | 내부 escalation |
|---|---|---:|---:|
| SEV-1 | 계정 간 데이터 노출, service-role/OAuth/provider secret 노출, 광범위 데이터 삭제·변조 | 15분 | 즉시 |
| SEV-2 | 로그인·DB·탈퇴·export 전면 장애, health 503 지속, rate limiter 장애로 위험 작업 전면 차단 | 30분 | 30분 |
| SEV-3 | 특정 provider 또는 일부 기능 장애, 데이터 보존됨 | 4시간 | 같은 영업일 |
| SEV-4 | UI 결함·성능 저하·단일 사용자 재현 불가 문의 | 1영업일 | 필요 시 |

SEV-1/2는 한 명이 실행하고 다른 한 명이 변경·복구 결과를 검토한다. 검토자가 없으면 파괴적 DB 조작 대신 읽기 전용 진단과 connector 비활성화까지만 수행한다.

## 3. 사고 기록 시작

민감정보 없는 incident ID를 만들고 다음만 기록한다.

- incident ID와 심각도
- 탐지·최초 대응 UTC
- 영향받은 route template과 공개 오류 코드
- 배포 SHA와 Vercel deployment ID
- Supabase project의 비식별 환경명
- 최초 request ID
- 실행자·검토자
- 사용자 영향 범위의 추정치
- 수행한 변경의 명령명과 결과

Windows PowerShell:

~~~powershell
$env:INCIDENT_STARTED_AT = (Get-Date).ToUniversalTime().ToString("o")
$env:DEPLOYMENT_SHA = (git rev-parse HEAD).Trim()
if (-not $env:INCIDENT_ID) { throw "INCIDENT_ID is required" }
~~~

Linux:

~~~bash
export INCIDENT_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
export DEPLOYMENT_SHA="$(git rev-parse HEAD)"
: "$INCIDENT_ID"
~~~

INCIDENT_ID에는 사용자·회사·provider 계정명이나 이메일을 넣지 않는다.

## 4. Request ID 기반 진단

애플리케이션 request ID 형식은 8~80자의 ASCII 영문, 숫자, 밑줄, 하이픈이다. 다른 형식은 로그 검색에 사용하지 않는다.

Windows PowerShell:

~~~powershell
if ($env:REQUEST_ID -notmatch '^[A-Za-z0-9_-]{8,80}$') { throw "invalid request ID" }
$env:REQUEST_ID
~~~

Linux:

~~~bash
case "$REQUEST_ID" in
  (*[!A-Za-z0-9_-]*|'') exit 1 ;;
esac
REQUEST_ID_LENGTH="$(printf '%s' "$REQUEST_ID" | wc -c)"
test "$REQUEST_ID_LENGTH" -ge 8
test "$REQUEST_ID_LENGTH" -le 80
printf '%s\n' "$REQUEST_ID"
~~~

Vercel Logs에서 정확히 일치하는 request ID를 검색한다. 검색 시간 범위는 신고 시각 전후 15분부터 시작하고, 결과에는 다음 allowlist 필드만 사용한다.

- timestamp
- requestId
- category 또는 route template
- outcome
- errorCode
- durationBucket
- response class
- rate-limit action

다음 값이 검색 결과에 있으면 로그 자체를 incident evidence로 복사하지 말고 즉시 비밀 노출 절차로 전환한다.

- authorization, cookie, OAuth code
- Supabase/provider key 또는 token
- email, raw user UUID, IP
- raw URL/query
- memo, job field, backup/provider response
- SQL text, stack trace, raw exception

Request ID가 없거나 일치 결과가 없으면 배포 SHA, route template, 공개 오류 코드와 5분 시간 창으로 검색한다. 사용자 식별값을 추가 검색 키로 요구하지 않는다.

## 5. 상태와 영향 확인

Windows PowerShell:

~~~powershell
if (-not $env:APP_BASE_URL) { throw "APP_BASE_URL is required" }
$Start = Get-Date
$Response = Invoke-WebRequest -Uri "$env:APP_BASE_URL/api/health" -Method Get -TimeoutSec 3 -SkipHttpErrorCheck
$Elapsed = ((Get-Date) - $Start).TotalSeconds
[pscustomobject]@{ Status=$Response.StatusCode; Seconds=$Elapsed; RequestId=$Response.Headers["X-Request-Id"] }
~~~

Linux:

~~~bash
: "$APP_BASE_URL"
HEALTH_HEADERS="$(mktemp)"
HEALTH_BODY="$(mktemp)"
curl --silent --show-error --max-time 3 --dump-header "$HEALTH_HEADERS" --output "$HEALTH_BODY" --write-out '%{http_code}\n' "$APP_BASE_URL/api/health"
grep -Eiq '^x-request-id:' "$HEALTH_HEADERS"
rm -f -- "$HEALTH_HEADERS" "$HEALTH_BODY"
~~~

상태 본문은 ticket에 붙이지 않는다. 다음을 읽기 전용으로 판정한다.

1. health 200/503와 2초 응답 목표
2. 동일 SHA의 Vercel deployment 상태
3. Supabase Dashboard의 Database/Auth 상태와 최근 backup
4. GitHub CI 상태
5. connector enable flag
6. 동일 오류가 여러 request ID·계정에서 발생하는지
7. 저장·수정·삭제 전후의 사용자 데이터 보존 여부

## 6. 비밀 노출 대응

비밀 노출 의심은 SEV-1이다. 실제 악용 증거가 없어도 다음 순서로 처리한다.

### 6.1 격리

1. 노출된 provider와 관련 connector를 즉시 false로 바꾸고 재배포한다.
2. service-role key 노출이면 account deletion endpoint를 포함한 privileged deployment를 이전 정상 배포로 rollback하거나 운영 접근을 제한한다.
3. OAuth client secret 노출이면 Google Cloud에서 새 secret을 발급하고 Supabase Google provider에 새 값 적용 후 기존 secret을 폐기한다.
4. Supabase key 노출이면 Supabase가 제공하는 key rotation/revoke 절차를 사용한다. 회전 전에 영향받는 Vercel 환경과 consumer 목록을 확인한다.
5. Git에 들어간 비밀은 삭제 commit만으로 끝내지 않는다. 먼저 회전·폐기하고 repository history 정리는 별도 검토한다.
6. 노출된 값이나 일부를 incident 문서에 기록하지 않는다. credential 종류와 회전 완료 시각만 남긴다.

Provider 비활성화는 Vercel Dashboard의 Preview와 Production 환경을 각각 변경하고 새 deployment를 만들어야 적용된다. 환경 변수 변경만 하고 이전 실행 인스턴스가 종료될 것이라 가정하지 않는다.

검증:

Windows PowerShell:

~~~powershell
$Health = Invoke-WebRequest -Uri "$env:APP_BASE_URL/api/health" -TimeoutSec 3
if ($Health.StatusCode -ne 200) { throw "service is not ready after rotation" }
~~~

Linux:

~~~bash
curl --fail-with-body --silent --show-error --max-time 3 "$APP_BASE_URL/api/health" > /dev/null
~~~

### 6.2 영향 평가

- 노출 시작 가능 시각부터 폐기 시각까지 platform audit log를 확인한다.
- 비정상 Auth admin, account deletion, provider quota, database connection, deployment env 조회가 있었는지 확인한다.
- 계정 간 접근 또는 데이터 변경 가능성이 있으면 RLS/ownership query를 실행하고 [backup-restore.md](./backup-restore.md)의 count·고아 데이터 검증을 수행한다.
- secret 값 자체를 검색어로 로그에 입력하지 않는다.
- service-role 악용 가능성이 있으면 사용자 삭제·변경 감사 범위를 별도 기록하고 법적 통지 검토로 escalation한다.

## 7. Provider 장애와 즉시 비활성화

다음이면 해당 provider만 비활성화한다.

- 승인·계약 상태 불명
- 401/403 또는 credential 폐기
- quota 소진·429 급증
- 응답 형식 변경으로 검증 실패
- access policy·이용 조건 변경
- provider 응답이 사용자 기록을 잘못 변경할 가능성

절차:

1. provider connector flag를 Preview와 Production에서 false로 변경한다.
2. 새 deployment를 만들고 health를 확인한다.
3. 저장된 공고 상세가 유지되고 provider 상태가 수동/지원 안 됨으로 보이는지 확인한다.
4. 원문 URL, 메모, 지원 상태, 일정, revision이 바뀌지 않았는지 확인한다.
5. provider key를 회전해야 하면 connector가 꺼진 상태에서 수행한다.
6. 승인, credential, quota, 응답 fixture, 출처 표기 검증이 끝나기 전 다시 켜지 않는다.

Provider 장애는 core health를 503으로 만들지 않는다. database와 인증이 정상이고 수동 입력이 가능하면 SEV-3으로 격리한다.

## 8. Rate-limit 저장소·DB 장애

징후:

- health 503 또는 database unavailable
- 보호 작업의 503 RATE_LIMIT_UNAVAILABLE
- consume_rate_limit RPC timeout/error
- provider 호출·import·consent·탈퇴가 실행되지 않음

필수 동작:

1. limiter를 우회하거나 process-memory fallback을 배포하지 않는다.
2. 보호 작업이 실제 provider 호출이나 mutation 전에 중단됐는지 request ID 이벤트로 확인한다.
3. source record, memo, status, schedule, revision count가 장애 전후 보존되는지 읽기 전용으로 확인한다.
4. Supabase project 상태, connection saturation, migration 상태와 network incident를 확인한다.
5. 최근 migration 직후 시작됐다면 [rollback.md](./rollback.md)의 DB 판정 절차로 이동한다.
6. Supabase 복구 후 health 200, limiter RPC, 계정별 격리, Retry-After를 순서대로 검사한다.
7. 보호 기능이 모두 통과하기 전 provider flag를 켜거나 account deletion을 재개하지 않는다.

Storage outage 중 사용자가 보는 메시지는 재시도 가능한 일반 오류와 request ID만 포함한다. 실패를 성공으로 표시하거나 사용자에게 반복 클릭을 유도하지 않는다.

## 9. 데이터 손상·계정 격리 사고

계정 B 데이터를 계정 A가 볼 수 있거나 수정할 수 있다는 증거는 SEV-1이다.

1. 새 배포와 migration을 중단한다.
2. 가능하면 private route 접근을 제한하고 connector를 모두 끈다.
3. 최근 정상 backup과 의심 시작 시각을 보존한다.
4. raw 사용자 데이터를 복사하지 않고 영향을 받은 table, operation, 시간 범위만 기록한다.
5. RLS policy, security-definer function의 auth.uid binding, service-role 호출 범위를 검토한다.
6. 임의 SQL 수정 전에 별도 project로 backup을 복구하여 재현한다.
7. 수정은 forward-fix migration과 실패 pgTAP을 먼저 추가한다.
8. 소유권·고아 데이터·cross-account denial 검증 전 production 쓰기를 재개하지 않는다.

## 10. 사용자 알림 판단

다음 중 하나면 운영자 혼자 종결하지 말고 개인정보/법적 검토 담당자에게 즉시 escalation한다.

- 개인정보 또는 계정 간 데이터가 승인되지 않은 주체에게 노출됐을 가능성
- service-role, OAuth, database credential 악용 가능성
- 사용자 데이터 영구 손실 또는 복구 불확실
- 탈퇴 요청이 성공으로 표시됐지만 계정·데이터가 남음
- 법정·계약상 통지 기한이 적용될 가능성

일반 장애 알림 기준:

| 조건 | 알림 |
|---|---|
| 15분 미만, 데이터·보안 영향 없음 | 상태 기록만 |
| 15분 이상 핵심 로그인/조회/저장 장애 | 서비스 공지 |
| 1시간 이상 export/탈퇴 불가 | 영향·대안·다음 갱신 시각 공지 |
| provider만 장애, 수동 입력 가능 | 해당 provider 화면 공지 |
| 데이터 손실·노출 가능성 | 법적 검토 후 대상·시점·내용 결정 |

공지에는 확인된 사실, 영향 기간, 영향 기능, 데이터 보존 여부, 사용자가 할 일, 다음 업데이트 시각만 쓴다. 공격 방법, secret, 내부 hostname, 추측 원인, 다른 사용자 정보는 넣지 않는다.

## 11. 복구 완료 Gate

다음이 모두 참일 때만 incident를 복구 상태로 전환한다.

- /api/health가 2초 안에 200이며 database ok다.
- 배포 SHA와 변경한 환경이 의도한 값이다.
- 동일 오류가 재현되지 않고 관련 route test가 통과한다.
- limiter가 fail-closed와 계정별 격리를 유지한다.
- provider 장애 시 수동 fallback과 기존 데이터 보존이 확인됐다.
- 비밀 노출이면 모든 영향 credential이 회전·폐기됐다.
- 데이터 사고면 count, ownership, RLS, export, account deletion 검증이 통과했다.
- 로그에 금지 값이 없고 request ID로 결과를 추적할 수 있다.
- 사용자 공지·법적 escalation 여부가 기록됐다.
- 임시 완화책의 제거 소유자와 기한이 정해졌다.

## 12. 사후 검토

SEV-1/2는 2영업일 안에 다음을 기록한다.

- 탐지부터 격리·복구까지의 UTC timeline
- 직접 원인과 방어 장치가 실패한 이유
- 데이터·사용자·provider 영향
- 잘 작동한 fail-closed·backup·rollback 장치
- 재발 방지 test, migration, alert, runbook 변경
- 작업 소유자와 완료 기한
- 후속 restore drill 또는 game day 일정

사후 문서에도 request ID 외 사용자 식별정보와 비밀을 넣지 않는다.
