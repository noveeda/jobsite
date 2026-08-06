# 공개 베타 Rollback Runbook

이 문서는 잘못된 애플리케이션 배포, 환경 설정, database migration 또는 데이터 변경을 사용자 데이터 손실 없이 되돌리는 절차다. 삭제형 rollback보다 이전 코드 재배포, 호환 가능한 schema 유지, 검증된 forward-fix를 우선한다.

## 1. Rollback 시작 조건

다음 중 하나면 새 배포 승격을 멈추고 rollback 판정을 시작한다.

- /api/health가 2초 안에 200/database ok를 반환하지 않음
- 동일 SHA의 로그인, consent, dashboard, export 또는 account deletion 스모크 실패
- 5xx 또는 client error가 직전 정상 배포 대비 급증
- security header, origin 검증, auth 또는 RLS 회귀
- rate limiter가 계정별 격리나 fail-closed를 지키지 않음
- migration 후 constraint, function, policy 또는 query 오류
- 계정 간 접근, 데이터 삭제·변조, Auth/public row 불일치
- provider 호출이 승인·quota·출처 조건을 위반할 가능성
- production에 E2E_BYPASS_AUTH 또는 잘못된 환경별 credential이 설정됨

데이터 노출·손상이나 secret 노출은 먼저 [incident-response.md](./incident-response.md)의 SEV-1 절차를 시작한다.

## 2. 금지 작업

- production에서 npx supabase db reset, DROP, TRUNCATE 또는 광범위 DELETE를 실행하지 않는다.
- 적용된 migration 파일을 삭제·이름 변경·history 조작하지 않는다.
- production을 로컬 migration version으로 강제 reset하지 않는다.
- 검증되지 않은 SQL dump를 기존 production 위에 덮어쓰지 않는다.
- RLS나 rate limit를 복구 편의를 위해 비활성화하지 않는다.
- service-role key를 browser·CLI 출력·evidence에 넣지 않는다.
- provider 장애를 이유로 사용자 공고·메모·상태를 삭제하지 않는다.
- backup 확인 없이 데이터 변경형 rollback을 실행하지 않는다.

## 3. 역할과 필수 변수

SEV-1/2 또는 database 변경은 실행자와 검토자를 분리한다. 검토자가 없는 경우 애플리케이션 rollback과 provider 비활성화까지만 수행하고 database 변경은 보류한다.

Windows PowerShell:

~~~powershell
$Required = @("APP_BASE_URL","CURRENT_DEPLOYMENT_URL","PREVIOUS_PRODUCTION_DEPLOYMENT_URL","CURRENT_SHA","PREVIOUS_SHA","STAGING_SUPABASE_REF","PRODUCTION_SUPABASE_REF")
foreach ($Name in $Required) {
  if (-not (Get-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue).Value) { throw "$Name is required" }
}
if ($env:CURRENT_SHA -eq $env:PREVIOUS_SHA) { throw "rollback SHAs must differ" }
~~~

Linux:

~~~bash
: "$APP_BASE_URL" "$CURRENT_DEPLOYMENT_URL" "$PREVIOUS_PRODUCTION_DEPLOYMENT_URL"
: "$CURRENT_SHA" "$PREVIOUS_SHA" "$STAGING_SUPABASE_REF" "$PRODUCTION_SUPABASE_REF"
test "$CURRENT_SHA" != "$PREVIOUS_SHA"
~~~

URL과 SHA는 Vercel deployment 목록과 Git에서 각각 확인한다. 현재·이전 deployment URL이 같은지, PREVIOUS_SHA가 CI와 staging smoke를 통과한 SHA인지 별도 검토자가 확인한다.

## 4. 판정 행렬

| 관찰 | 데이터 상태 | 선택 |
|---|---|---|
| UI/route/runtime 오류, migration 없음 | 정상 | 이전 애플리케이션 deployment rollback |
| 환경 변수 오설정 | 정상 | 환경 수정 후 이전 정상 SHA 재배포 |
| additive migration 후 이전 앱도 호환 | 정상 | DB schema 유지, 앱만 rollback |
| function/policy/constraint 오류 | 정상 또는 쓰기 차단 | 실패 test와 forward-fix migration |
| 잘못된 대량 update/delete | 손상 | 쓰기 중단, 관리형 point-in-time restore 검토 |
| 계정 간 노출/RLS 회귀 | 불명 | SEV-1 격리, forward-fix를 별도 project에서 검증 |
| provider만 실패 | 정상 | provider flag false, core 앱 유지 |
| Supabase 전체 장애 | 변경 불가 | fail-closed 유지, vendor 복구 후 검증 |

불확실한 데이터 상태는 손상 가능 상태로 취급한다.

## 5. 변경 전 증빙과 backup Gate

1. 새 production/preview 배포와 migration 실행을 중단한다.
2. 현재 SHA, 이전 정상 SHA, deployment ID, 오류 request ID, 시작 UTC를 기록한다.
3. Supabase Dashboard에서 최신 관리형 backup ID와 복구 가능 시각을 확인한다.
4. database가 읽기 가능하면 [backup-restore.md](./backup-restore.md)의 암호화 논리 백업을 실행한다.
5. 데이터 count, ownership, 고아 row query를 읽기 전용으로 기록한다.
6. provider가 관련됐거나 데이터 상태가 불명확하면 connector를 false로 바꾸고 재배포한다.
7. CURRENT_SHA와 PREVIOUS_SHA의 migration 목록을 비교한다.

Windows PowerShell:

~~~powershell
git diff --name-status $env:PREVIOUS_SHA $env:CURRENT_SHA -- supabase/migrations
git diff --stat $env:PREVIOUS_SHA $env:CURRENT_SHA
~~~

Linux:

~~~bash
git diff --name-status "$PREVIOUS_SHA" "$CURRENT_SHA" -- supabase/migrations
git diff --stat "$PREVIOUS_SHA" "$CURRENT_SHA"
~~~

migration 차이가 있으면 앱 rollback 전에 이전 코드가 현재 schema와 호환되는지 확인한다.

## 6. 애플리케이션 Rollback

조건:

- 데이터가 손상되지 않았다.
- 이전 SHA가 현재 database schema와 호환된다.
- 이전 SHA의 CI와 staging smoke 증빙이 있다.
- 이전 deployment가 같은 production Vercel project와 domain에 속한다.

Windows PowerShell:

~~~powershell
npx vercel@latest rollback $env:PREVIOUS_PRODUCTION_DEPLOYMENT_URL --yes
if ($LASTEXITCODE -ne 0) { throw "Vercel rollback failed" }
~~~

Linux:

~~~bash
npx vercel@latest rollback "$PREVIOUS_PRODUCTION_DEPLOYMENT_URL" --yes
~~~

rollback 명령이 성공해도 완료로 간주하지 않는다. custom domain이 이전 deployment를 가리키는지 Vercel Dashboard에서 확인하고 health를 검증한다.

Windows PowerShell:

~~~powershell
$Start = Get-Date
$Response = Invoke-WebRequest -Uri "$env:APP_BASE_URL/api/health" -TimeoutSec 3
$Elapsed = ((Get-Date) - $Start).TotalSeconds
$Body = $Response.Content | ConvertFrom-Json
if ($Response.StatusCode -ne 200 -or $Body.status -ne "ok" -or $Body.database -ne "ok") { throw "rollback health failed" }
if ($Elapsed.TotalSeconds -ge 2) { throw "rollback health exceeded 2 seconds" }
if (-not $env:PREVIOUS_SHA.StartsWith($Body.version)) { throw "rollback SHA mismatch" }
~~~

Linux:

~~~bash
HEALTH_BODY="$(mktemp)"
HTTP_CODE="$(curl --silent --show-error --max-time 2 --output "$HEALTH_BODY" --write-out '%{http_code}' "$APP_BASE_URL/api/health")"
test "$HTTP_CODE" = "200"
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' "$HEALTH_BODY"
grep -Eq '"database"[[:space:]]*:[[:space:]]*"ok"' "$HEALTH_BODY"
SHORT_SHA="$(printf '%.7s' "$PREVIOUS_SHA")"
grep -Eq "\"version\"[[:space:]]*:[[:space:]]*\"$SHORT_SHA[0-9a-f]*\"" "$HEALTH_BODY"
rm -f -- "$HEALTH_BODY"
~~~

## 7. 환경 설정 Rollback

환경 설정 오류 예:

- staging Supabase 값이 Production에 배치됨
- APP_BASE_URL과 OAuth redirect 불일치
- production E2E_BYPASS_AUTH 존재
- 미승인 connector enabled
- 누락된 service-role 또는 공개 고지 값

절차:

1. Vercel Dashboard audit log에서 변경 시각, 변경자, 변수 이름과 환경 범위를 확인한다. 값 자체는 evidence에 기록하지 않는다.
2. E2E_BYPASS_AUTH는 Preview와 Production에서 삭제한다.
3. 미승인 connector flag는 false로 바꾸고 관련 provider secret은 제거한다.
4. Supabase URL/key/service-role은 같은 환경 프로젝트의 한 세트로 복구한다.
5. APP_BASE_URL, Google OAuth callback, Supabase Site URL과 Redirect URL을 다시 대조한다.
6. 환경 변경 뒤 PREVIOUS_SHA를 새로 재배포한다. 이미 실행 중인 instance가 자동으로 값을 다시 읽는다고 가정하지 않는다.
7. health, OAuth, consent, export와 account deletion을 검증한다.

환경 값의 이전 버전을 찾을 수 없으면 추측해 입력하지 않는다. 비밀 관리자의 승인된 production record에서 다시 주입한다.

## 8. Migration Rollback 선택

### 8.1 Additive migration

새 table/column/index/function이 이전 앱을 방해하지 않고 데이터가 정상이라면 schema를 그대로 둔다. 앱만 rollback하고 원 migration은 삭제하지 않는다.

검증:

- 이전 앱 query가 새 NOT NULL 또는 enum 변경에 막히지 않음
- 기존 RLS가 약화되지 않음
- trigger가 이전 write payload를 수용함
- 새 function이 기존 function signature를 제거하지 않음

### 8.2 Forward-fix migration

잘못된 function, policy, grant, index 또는 constraint는 새 migration으로 수정한다. 먼저 실패 재현 pgTAP을 추가한다.

Windows PowerShell:

~~~powershell
npx supabase migration new incident_forward_fix
npx supabase start
npx supabase db reset
npx supabase test db
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
npx supabase stop --no-backup
~~~

Linux:

~~~bash
npx supabase migration new incident_forward_fix
npx supabase start
npx supabase db reset
npx supabase test db
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:e2e
npx supabase stop --no-backup
~~~

생성된 migration에는 영향받는 object만 명시적으로 CREATE OR REPLACE, ALTER 또는 REVOKE/GRANT한다. 사용자 row를 재작성하지 않는다. 데이터 보정이 불가피하면 별도 backup, 대상 count, idempotency, batch, rollback query와 검토 승인이 필요하다.

스테이징 적용:

Windows PowerShell:

~~~powershell
npx supabase link --project-ref $env:STAGING_SUPABASE_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
~~~

Linux:

~~~bash
npx supabase link --project-ref "$STAGING_SUPABASE_REF"
npx supabase db push --linked --dry-run
npx supabase db push --linked
~~~

스테이징 health, RLS, rate limit, consent, export, deletion 스모크 후에만 운영 dry-run을 검토한다.

Windows PowerShell:

~~~powershell
npx supabase link --project-ref $env:PRODUCTION_SUPABASE_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
~~~

Linux:

~~~bash
npx supabase link --project-ref "$PRODUCTION_SUPABASE_REF"
npx supabase db push --linked --dry-run
npx supabase db push --linked
~~~

dry-run에 예상 밖 migration, DROP, TRUNCATE, data rewrite가 있으면 중단한다.

### 8.3 데이터 손상 또는 호환 불가능 migration

다음이면 production에서 역 SQL을 즉흥 실행하지 않는다.

- row가 삭제·잘못 변경됨
- migration이 column/table을 제거함
- Auth와 public ownership이 불일치
- 복구 대상 row를 정확히 한정할 수 없음
- 이전 schema로 돌아가면 이후 정상 write를 잃음

절차:

1. 쓰기와 connector를 중단한다.
2. 손상 직전 관리형 backup/PITR 시점을 두 사람이 선택한다.
3. [backup-restore.md](./backup-restore.md)에 따라 빈 격리 프로젝트에 먼저 복구한다.
4. count, ownership, RLS, consent, provenance, export, deletion을 검증한다.
5. 손상 이후 정상 write의 보존·재적용 방법을 별도 승인한다.
6. 검증된 database로 app을 연결하거나 Supabase의 지원되는 production restore를 수행한다.
7. DNS/환경 전환 전 health와 OAuth를 Preview에서 확인한다.

## 9. 가역적 실행 순서

Rollback은 다음 순서를 유지한다.

1. 배포와 migration 승격 중지
2. incident 기록과 request ID 확보
3. provider 비활성화 또는 위험 write 격리
4. 관리형 backup 시점 확인
5. 읽기 전용 count·ownership 증빙
6. 암호화 논리 backup
7. 현재 schema와 이전 앱 호환성 판정
8. 앱 rollback 또는 staging forward-fix
9. production 적용
10. health와 핵심 스모크
11. 사용자 영향·공지 판단
12. 임시 격리 해제

backup과 증빙 전에 database를 변경하지 않는다. 단, 진행 중인 계정 간 노출을 막는 앱 rollback/provider disable은 먼저 수행할 수 있다.

## 10. 데이터 보존 검증

Rollback 전후 같은 읽기 전용 query를 실행해 count를 비교한다.

~~~sql
select 'auth_users' as entity, count(*)::bigint as rows from auth.users
union all select 'jobs', count(*) from public.jobs
union all select 'job_sources', count(*) from public.job_sources
union all select 'source_checks', count(*) from public.source_checks
union all select 'duplicate_groups', count(*) from public.duplicate_groups
union all select 'duplicate_pairs', count(*) from public.duplicate_pairs
union all select 'job_revisions', count(*) from public.job_revisions
union all select 'account_consents', count(*) from public.account_consents
union all select 'request_usage', count(*) from public.request_usage
order by entity;
~~~

다음이 모두 필요하다.

- 예상하지 않은 row 감소가 없음
- 모든 public user_id가 auth.users.id에 연결됨
- job source/revision/duplicate 관계의 고아 row가 없음
- 계정 A가 계정 B 데이터를 읽거나 수정할 수 없음
- provider failure/disable 후 메모, 상태, 일정, provenance, original URL 유지
- limiter failure가 보호 operation 전에 중단됨
- account deletion 실패가 success로 표시되지 않음

## 11. Rollback 완료 Gate

- health 200/database ok/2초 미만
- APP_BASE_URL health version이 의도한 SHA prefix
- Google OAuth callback과 consent gate 정상
- 수동 공고 저장·조회·수정 정상
- export가 no-store로 성공
- rate limit의 429, Retry-After, 계정별 격리와 fail-closed 정상
- account deletion의 확인 문구, reauth, cascade, sign-out 정상
- security headers 정상
- connector flag와 출처 표기가 승인 상태와 일치
- count, ownership, RLS와 고아 row 검증 통과
- platform log에 비밀·사용자 내용 없음
- Windows 검증과 Ubuntu CI 통과
- 실행자와 검토자가 결과 승인

한 항목이라도 불확실하면 rollback을 완료로 선언하지 않는다.

## 12. 증빙과 후속 작업

비밀 없는 rollback 기록:

- incident ID
- CURRENT_SHA, PREVIOUS_SHA, 최종 SHA
- rollback/forward-fix 선택 근거
- migration diff 파일명
- backup ID와 복구 가능 시각
- 명령명, exit code, test count
- health request ID와 status
- count/ownership 비교 결과
- 사용자 영향과 공지 결정
- 실행자, 검토자, UTC timeline
- 임시 완화책 제거 작업과 기한

database URL, project key, service-role key, OAuth/provider secret, email, UUID, raw URL, memo, dump 내용은 기록하지 않는다.
