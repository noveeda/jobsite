# 공개 베타 배포 Runbook

이 문서는 Windows PowerShell과 Linux 셸에서 스테이징 및 운영 배포를 재현하는 절차다. 명령에 쓰는 값은 현재 셸 변수 또는 배포 플랫폼 비밀 저장소에서 가져온다. 비밀값을 명령 기록, Git, 로그, 채팅에 붙여 넣지 않는다.

## 1. 필수 권한과 변수

필요한 권한:

- GitHub 저장소의 배포 브랜치와 CI 확인 권한
- 스테이징·운영 Vercel 프로젝트의 환경 변수 및 배포 권한
- 서로 분리된 스테이징·운영 Supabase 프로젝트 권한
- Google Cloud OAuth Web client 설정 권한
- Supabase CLI access token과 각 프로젝트 데이터베이스 비밀번호

애플리케이션 환경 변수:

| 변수 | Vercel 범위 | 규칙 |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Preview/Production별 분리 | 해당 Supabase Project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Preview/Production별 분리 | 해당 프로젝트 publishable key |
| SUPABASE_SERVICE_ROLE_KEY | Preview/Production별 분리, Sensitive | 서버 전용; 탈퇴에만 사용 |
| APP_BASE_URL | Preview/Production별 분리 | 공개 HTTPS origin, 끝 슬래시 없음 |
| PUBLIC_OPERATOR_NAME | Preview/Production | 공개되는 실제 운영 주체명 |
| PUBLIC_PRIVACY_EMAIL | Preview/Production | 실제 수신 가능한 개인정보 문의 주소 |
| PUBLIC_POLICY_EFFECTIVE_DATE | Preview/Production | ISO 날짜 |
| VERCEL_GIT_COMMIT_SHA | Vercel 자동 제공 | 상태 응답의 배포 SHA; 수동 덮어쓰기 금지 |
| SARAMIN_CONNECTOR_ENABLED | Preview/Production | 승인 전 false |
| SARAMIN_API_KEY | 승인 후에만 Sensitive | 사람인 서버 전용 키 |
| JOBKOREA_CONNECTOR_ENABLED | Preview/Production | 승인 전 false |
| JOBKOREA_API_URL | 승인 후에만 Sensitive | 발급된 HTTPS 호출 URL |

E2E_BYPASS_AUTH는 Vercel Preview와 Production에 만들지 않는다. 승인 증빙이 없으면 두 커넥터 플래그는 false이며 관련 비밀도 등록하지 않는다.

약관과 개인정보 처리방침 버전은 lib/legal/policy.ts의 배포 코드 상수다. 문안이나 버전을 바꾸면 코드 변경·검토·새 SHA 배포로 처리하고 환경 변수로 덮어쓰지 않는다.

Windows PowerShell:

~~~powershell
$Repo = (Resolve-Path ".").Path
$env:DEPLOYMENT_COMMIT = (git rev-parse HEAD).Trim()
$Required = @("STAGING_APP_URL","PRODUCTION_APP_URL","STAGING_SUPABASE_REF","PRODUCTION_SUPABASE_REF")
foreach ($Name in $Required) {
  if (-not (Get-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue).Value) { throw "$Name is required" }
}
~~~

Linux:

~~~bash
REPO="$(pwd)"
export REPO
export DEPLOYMENT_COMMIT="$(git rev-parse HEAD)"
: "$STAGING_APP_URL" "$PRODUCTION_APP_URL"
: "$STAGING_SUPABASE_REF" "$PRODUCTION_SUPABASE_REF"
~~~

URL과 project ref는 Vercel·Supabase 자원 기록 또는 비밀 관리자에서 현재 셸로 주입한다. 값이 비어 있으면 즉시 중단한다.

## 2. 로컬 사전 검증

Windows PowerShell:

~~~powershell
Set-Location -LiteralPath $Repo
if (-not $env:DEPLOYMENT_COMMIT) { throw "DEPLOYMENT_COMMIT is required" }
npm ci
npx playwright install chromium
npx supabase start
npx supabase db reset
npm run lint
npm run typecheck
npm run test:unit
npm run build
npx supabase test db
npm run test:e2e
npx supabase stop --no-backup
~~~

Linux:

~~~bash
cd "$REPO"
test -n "$DEPLOYMENT_COMMIT"
npm ci
npx playwright install --with-deps chromium
npx supabase start
npx supabase db reset
npm run lint
npm run typecheck
npm run test:unit
npm run build
npx supabase test db
npm run test:e2e
npx supabase stop --no-backup
~~~

모든 명령이 0으로 끝나고 동일 SHA의 Ubuntu CI가 통과하지 않으면 스테이징 배포를 중단한다.

## 3. Supabase와 Google OAuth

각 환경은 별도 Supabase 프로젝트와 별도 Google OAuth Web client를 사용한다.

Google Cloud의 Authorized redirect URI는 해당 환경의 Supabase Project URL에 `/auth/v1/callback`을 붙인 정확한 URL이다. 아래 검증 명령으로 현재 project ref에서 계산한다.

Supabase Dashboard의 Authentication > URL Configuration:

- Site URL: 해당 환경의 APP_BASE_URL
- Redirect URLs: APP_BASE_URL/auth/callback
- 스테이징과 운영 URL을 서로의 프로젝트에 등록하지 않는다.
- 와일드카드 redirect URL을 사용하지 않는다.

Supabase Dashboard의 Authentication > Providers > Google에 같은 환경의 Client ID와 Client secret을 저장한다. Google client secret은 Vercel 애플리케이션 환경 변수에 복제하지 않는다.

검증:

Windows PowerShell:

~~~powershell
$SupabaseCallback = "https://$env:STAGING_SUPABASE_REF.supabase.co/auth/v1/callback"
$AppCallback = "$env:STAGING_APP_URL/auth/callback"
$SupabaseCallback
$AppCallback
~~~

Linux:

~~~bash
printf '%s\n' "https://$STAGING_SUPABASE_REF.supabase.co/auth/v1/callback"
printf '%s\n' "$STAGING_APP_URL/auth/callback"
~~~

출력한 두 URL을 각 콘솔의 실제 등록값과 문자 단위로 비교한다.

## 4. 스테이징 마이그레이션

운영과 연결된 CLI 세션에서 스테이징 명령을 실행하지 않는다. 먼저 project ref를 출력해 사람이 확인한다.

Windows PowerShell:

~~~powershell
Set-Location -LiteralPath $Repo
$env:STAGING_SUPABASE_REF
npx supabase link --project-ref $env:STAGING_SUPABASE_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
~~~

Linux:

~~~bash
cd "$REPO"
printf '%s\n' "$STAGING_SUPABASE_REF"
npx supabase link --project-ref "$STAGING_SUPABASE_REF"
npx supabase db push --linked --dry-run
npx supabase db push --linked
~~~

Dry-run 출력에 예상하지 않은 migration, DROP, TRUNCATE 또는 데이터 재작성 문이 있으면 실행을 중단한다. 적용 뒤 Supabase SQL Editor에서 migration history와 008_public_beta_foundation 적용 여부를 확인한다.

## 5. Vercel 환경과 스테이징 배포

Vercel Dashboard에서 Preview 환경에 스테이징 값, Production 환경에 운영 값을 등록한다. service-role과 provider credential은 Sensitive로 저장한다. 환경별 URL, key, OAuth client를 섞지 않는다.

Git 연동 배포를 기준으로 한다. 배포할 SHA를 원격에 올린 뒤 Vercel에서 해당 SHA의 Preview deployment를 선택한다. CLI를 사용하는 경우:

Windows PowerShell과 Linux:

~~~text
npx vercel@latest link
npx vercel@latest
~~~

대화형 링크에서 스테이징 Vercel 프로젝트를 명시적으로 선택한다. 배포 결과 URL이 STAGING_APP_URL과 다르면 OAuth redirect 검증 전 사용자 테스트를 시작하지 않는다.

## 6. 상태와 보안 헤더 Gate

Windows PowerShell:

~~~powershell
$HealthUri = "$env:STAGING_APP_URL/api/health"
$Started = Get-Date
$Response = Invoke-WebRequest -Uri $HealthUri -Method Get -TimeoutSec 3
$Elapsed = (Get-Date) - $Started
if ($Response.StatusCode -ne 200) { throw "health status is not 200" }
if ($Elapsed.TotalSeconds -ge 2) { throw "health exceeded 2 seconds" }
$Body = $Response.Content | ConvertFrom-Json
if ($Body.status -ne "ok" -or $Body.database -ne "ok") { throw "health is not ready" }
if ($Body.version -notmatch '^[0-9a-f]{7,40}$' -or -not $env:DEPLOYMENT_COMMIT.StartsWith($Body.version)) { throw "unexpected deployment SHA" }
$Required = @("X-Content-Type-Options","Referrer-Policy","Permissions-Policy","X-Frame-Options","X-Request-Id")
foreach ($Name in $Required) { if (-not $Response.Headers[$Name]) { throw "missing header: $Name" } }
~~~

Linux:

~~~bash
HEALTH_BODY="$(mktemp)"
HEALTH_HEADERS="$(mktemp)"
HTTP_CODE="$(curl --silent --show-error --max-time 2 --output "$HEALTH_BODY" --dump-header "$HEALTH_HEADERS" --write-out '%{http_code}' "$STAGING_APP_URL/api/health")"
test "$HTTP_CODE" = "200"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$HEALTH_BODY"
grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' "$HEALTH_BODY"
SHORT_SHA="$(printf '%.7s' "$DEPLOYMENT_COMMIT")"
grep -Eq "\"version\"[[:space:]]*:[[:space:]]*\"$SHORT_SHA[0-9a-f]*\"" "$HEALTH_BODY"
grep -Eiq '^x-content-type-options:[[:space:]]*nosniff' "$HEALTH_HEADERS"
grep -Eiq '^referrer-policy:' "$HEALTH_HEADERS"
grep -Eiq '^permissions-policy:' "$HEALTH_HEADERS"
grep -Eiq '^x-frame-options:[[:space:]]*DENY' "$HEALTH_HEADERS"
grep -Eiq '^x-request-id:' "$HEALTH_HEADERS"
rm -f -- "$HEALTH_BODY" "$HEALTH_HEADERS"
~~~

Production에서는 Strict-Transport-Security도 확인한다. 상태 본문이나 헤더에 Supabase URL, key, region, SQL error 또는 provider 상태가 보이면 배포를 거절한다.

## 7. 스테이징 사용자 스모크

기록에는 시간, 배포 SHA, 익명화한 테스트 계정 표식, request ID, 성공/실패만 남긴다.

1. 로그아웃 상태에서 /terms, /privacy, /sources가 열린다.
2. 새 Google 테스트 계정으로 로그인한다.
3. 동의 전 /jobs가 /consent로 이동한다.
4. 약관과 개인정보 처리방침을 각각 체크하고 동의한다.
5. 수동 HTTPS 공고를 저장하고 목록·상세·원문 링크를 확인한다.
6. JSON 내보내기가 성공하고 응답이 no-store인지 확인한다.
7. 반복 preview 요청이 한 계정에서 429와 Retry-After를 반환하고 다른 계정은 영향받지 않는지 확인한다.
8. 사람인 커넥터가 꺼져 있으면 수동 상태를 확인한다. 승인 후 켠 경우에만 Powered by 취업 사람인과 원문 우선 안내를 확인한다.
9. 데이터 설정에서 내보내기 안내를 본 뒤 정확히 회원탈퇴를 입력한다.
10. 탈퇴 후 재로그인이 거절되고 1분 안에 해당 사용자의 공개 테이블 행이 0인지 확인한다.
11. Vercel 로그에서 request ID로 검색하고 키, 토큰, 쿠키, 이메일, URL, 메모, 공고 내용, backup body, raw exception이 없는지 확인한다.

하나라도 실패하면 운영 승격을 중단한다.

## 8. 운영 마이그레이션과 배포

먼저 [backup-restore.md](./backup-restore.md)의 최신 백업 및 복구 드릴 증빙이 유효한지 확인한다. 쓰기 트래픽이 있는 파괴적 migration이면 유지보수 창을 선언한다.

Windows PowerShell:

~~~powershell
Set-Location -LiteralPath $Repo
$env:PRODUCTION_SUPABASE_REF
npx supabase link --project-ref $env:PRODUCTION_SUPABASE_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx vercel@latest --prod
~~~

Linux:

~~~bash
cd "$REPO"
printf '%s\n' "$PRODUCTION_SUPABASE_REF"
npx supabase link --project-ref "$PRODUCTION_SUPABASE_REF"
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx vercel@latest --prod
~~~

운영 /api/health와 보안 헤더를 같은 명령으로 검사하고, 스모크의 1~6단계를 운영용 테스트 계정으로 반복한다. 운영 커넥터는 승인 증빙과 quota 감시가 준비된 경우에만 켠다.

### 수집 스케줄은 별도 승인 뒤에만 활성화

`20260809000900_schedule_collection.sql`은 기본으로 cron job을 만들지 않는다. production에서만 별도의 service-role 운영 절차로 설정을 한 번 provision하고, Vault에 다음 두 값이 각각 하나씩 있는지 확인한 뒤 활성화한다.

- 배포 origin: production `APP_BASE_URL`과 문자 단위로 같은 HTTPS origin (경로·쿼리·fragment·자격증명 없음)
- cron bearer secret: `/api/cron/collect`의 `CRON_SECRET`과 같은 서버 전용 값

production marker와 Vault secret 이름·값은 Git, 로그, 티켓, 채팅에 남기지 않는다. 활성화 전에는 staging에서 보호된 수동 요청으로 collector의 due check, quota, lease 동작만 증명한다. cron은 매시간 helper만 호출하며, 실제 provider fetch 여부는 기존 6시간 due check가 결정한다.

## 9. 롤백과 출시 판정

애플리케이션만 실패하고 migration이 이전 코드와 호환되면 직전 정상 deployment를 즉시 복구한다.

Windows PowerShell:

~~~powershell
if (-not $env:PREVIOUS_PRODUCTION_DEPLOYMENT_URL) { throw "previous deployment URL is required" }
npx vercel@latest rollback $env:PREVIOUS_PRODUCTION_DEPLOYMENT_URL --yes
~~~

Linux:

~~~bash
: "$PREVIOUS_PRODUCTION_DEPLOYMENT_URL"
npx vercel@latest rollback "$PREVIOUS_PRODUCTION_DEPLOYMENT_URL" --yes
~~~

직전 배포 URL은 Vercel deployment 목록에서 정상 SHA와 일치하는 값을 현재 셸로 읽는다. 롤백 뒤 /api/health와 핵심 스모크를 다시 실행한다.

데이터베이스 rollback 원칙:

- migration 파일을 삭제하거나 production에서 supabase db reset을 실행하지 않는다.
- additive migration은 남겨 두고 호환되는 이전 앱을 배포한다.
- 잘못된 함수·정책은 새 forward-fix migration으로 복구한다.
- 데이터 손상, DROP, 잘못된 대량 갱신은 쓰기를 중단하고 [backup-restore.md](./backup-restore.md)의 관리형 복구 절차를 사용한다.
- database restore 뒤 OAuth, RLS, 동의, rate limit, export, 탈퇴와 계정 격리를 재검증한다.

공개 베타 승격은 다음이 모두 참일 때만 허용한다.

- 동일 SHA의 Windows 검증과 Ubuntu CI가 통과했다.
- 운영 migration dry-run을 별도 검토자가 승인했다.
- 최근 관리형 백업과 restore-to-empty drill 증빙이 있다.
- 상태, 보안 헤더, OAuth, 동의, 저장, export, rate limit, 탈퇴 스모크가 통과했다.
- E2E_BYPASS_AUTH가 없고 미승인 커넥터가 꺼져 있다.
- 운영자·개인정보 연락처·정책 버전과 시행일이 실제 값이다.
