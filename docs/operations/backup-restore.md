# 데이터베이스 백업·복구 Runbook

이 문서는 공개 베타의 서비스 데이터베이스 복구 절차다. 사용자별 JSON 내보내기는 이식성과 본인 복구 수단이며 서비스 전체 백업을 대체하지 않는다.

## 1. 복구 목표와 책임

베타 운영 목표:

- RPO: 마지막 정상 백업으로부터 최대 24시간
- RTO: 장애 선언 후 핵심 로그인·조회·내보내기 복구까지 4시간
- 관리형 백업 상태 확인: 매일
- 암호화 논리 백업: 매주 1회와 모든 파괴적 migration 직전
- 빈 프로젝트 복구 훈련: 분기 1회와 첫 공개 베타 전
- 데이터 소유권/RLS 검증: 모든 복구 훈련

한 명의 실행자와 한 명의 검토자가 백업 ID, SHA, 범위, 결과를 확인한다. 같은 사람이 production backup 삭제와 retention 예외를 동시에 승인하지 않는다.

## 2. 백업 계층과 보존

### Supabase 관리형 백업

운영 Supabase 프로젝트의 Dashboard > Database > Backups에서 자동 백업 성공과 복구 가능 시점을 매일 확인한다. 프로젝트 요금제가 제공하는 보존 기간을 기록하고 최소 7개의 일별 복구 시점을 유지한다. PITR을 사용하는 경우 가장 오래된 복구 가능 시각과 WAL 보존 상태를 함께 확인한다.

관리형 백업은 Supabase가 암호화한 저장소에 보관하며 production 데이터베이스와 별도 장애 도메인에 있어야 한다. Dashboard 접근에는 MFA를 사용한다.

### 암호화 논리 백업

- 매주 백업: 8주 보존
- 월말 백업: 12개월 보존
- 파괴적 migration 직전 백업: migration 검증 완료 후 90일 보존
- 법적 보존 요구가 없다면 위 기간을 넘긴 파일은 private object storage lifecycle로 자동 만료
- 버킷은 public access 차단, versioning, MFA 보호, KMS 기반 server-side encryption을 사용
- 업로드 전 로컬 bundle도 age로 암호화
- age passphrase는 비밀번호 관리자에서 가져와 대화형으로 입력하고 환경 변수, 셸 기록, 문서에 저장하지 않음
- 평문 dump와 복호화 파일은 암호화 확인 직후 명시한 작업 디렉터리 안에서만 제거

Supabase 관리형 백업과 암호화 논리 백업의 키·권한을 같은 개인 계정 하나에만 의존하지 않는다.

## 3. 도구와 변수

필수 도구:

- Node.js 24와 repository의 Supabase CLI
- PostgreSQL psql client
- age
- tar
- private encrypted object storage client

필수 변수는 비밀 관리자에서 현재 셸로 주입한다. 값 자체를 출력하지 않는다.

| 변수 | 내용 |
|---|---|
| SOURCE_DATABASE_URL | percent-encoded production/staging direct Postgres URL |
| DRILL_DATABASE_URL | 빈 복구훈련 Supabase 프로젝트 direct Postgres URL |
| DRILL_SUPABASE_REF | 빈 복구훈련 프로젝트 ref |
| BACKUP_ROOT | 암호화 가능한 로컬 임시 저장 경로 |
| EVIDENCE_ROOT | 비밀이 없는 검증 기록 경로 |
| BACKUP_OBJECT_URI | private object storage 대상 prefix |
| BACKUP_DATE | UTC yyyyMMddTHHmmssZ |
| SOURCE_COMMIT | backup 시점 배포 Git SHA |

Windows PowerShell 변수 검증:

~~~powershell
$Required = @("SOURCE_DATABASE_URL","DRILL_DATABASE_URL","DRILL_SUPABASE_REF","BACKUP_ROOT","EVIDENCE_ROOT","BACKUP_OBJECT_URI","BACKUP_DATE","SOURCE_COMMIT")
foreach ($Name in $Required) {
  if (-not (Get-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue).Value) { throw "$Name is required" }
}
~~~

Linux 변수 검증:

~~~bash
: "$SOURCE_DATABASE_URL" "$DRILL_DATABASE_URL" "$DRILL_SUPABASE_REF"
: "$BACKUP_ROOT" "$EVIDENCE_ROOT" "$BACKUP_OBJECT_URI"
: "$BACKUP_DATE" "$SOURCE_COMMIT"
~~~

## 4. 백업 전 Gate

1. 같은 SOURCE_COMMIT의 CI가 통과했는지 확인한다.
2. Supabase Dashboard의 최신 관리형 backup이 성공인지 확인한다.
3. SOURCE_DATABASE_URL이 읽으려는 환경인지 hostname/project ref를 비밀 관리자의 자원 기록과 비교한다.
4. 연결은 TLS를 요구해야 한다.
5. 백업 동안 schema migration과 account deletion 배포를 시작하지 않는다.
6. 다음 source manifest query가 성공해야 한다.

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

어느 단계든 실패하면 새 백업을 성공으로 기록하지 않는다.

## 5. 암호화 논리 백업 — Windows

PowerShell:

~~~powershell
$Work = Join-Path $env:BACKUP_ROOT "jobsite-$($env:BACKUP_DATE)"
$Evidence = Join-Path $env:EVIDENCE_ROOT "jobsite-$($env:BACKUP_DATE)"
New-Item -ItemType Directory -Path $Work,$Evidence -Force | Out-Null

npx supabase db dump --db-url $env:SOURCE_DATABASE_URL --schema auth,public --file (Join-Path $Work "schema.sql")
if ($LASTEXITCODE -ne 0) { throw "schema dump failed" }

npx supabase db dump --db-url $env:SOURCE_DATABASE_URL --schema auth,public --data-only --use-copy --file (Join-Path $Work "data.sql")
if ($LASTEXITCODE -ne 0) { throw "data dump failed" }

$ManifestSql = @"
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
"@
$ManifestSql | psql $env:SOURCE_DATABASE_URL --csv --no-psqlrc | Set-Content -LiteralPath (Join-Path $Work "source-counts.csv") -Encoding utf8
if ($LASTEXITCODE -ne 0) { throw "source manifest failed" }

$env:SOURCE_COMMIT | Set-Content -LiteralPath (Join-Path $Work "source-commit.txt") -Encoding ascii
$Archive = Join-Path $env:BACKUP_ROOT "jobsite-$($env:BACKUP_DATE).tar.gz"
$Encrypted = "$Archive.age"
tar.exe -czf $Archive -C $Work .
if ($LASTEXITCODE -ne 0) { throw "archive failed" }
age -p -o $Encrypted $Archive
if ($LASTEXITCODE -ne 0) { throw "encryption failed" }

$Hash = Get-FileHash -Algorithm SHA256 -LiteralPath $Encrypted
$Hash.Hash.ToLowerInvariant() | Set-Content -LiteralPath (Join-Path $Evidence "sha256.txt") -Encoding ascii
Get-Item -LiteralPath $Encrypted | Select-Object Name,Length,LastWriteTimeUtc | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Evidence "artifact.json") -Encoding utf8

Remove-Item -LiteralPath $Archive -Force
Remove-Item -LiteralPath $Work -Recurse -Force
~~~

업로드 도구로 Encrypted 파일을 BACKUP_OBJECT_URI 아래에 저장하고 업로드 후 원격 SHA256 또는 내려받은 파일의 SHA256을 evidence와 비교한다. 일치 전에는 로컬 encrypted file을 삭제하지 않는다.

## 6. 암호화 논리 백업 — Linux

~~~bash
WORK="$BACKUP_ROOT/jobsite-$BACKUP_DATE"
EVIDENCE="$EVIDENCE_ROOT/jobsite-$BACKUP_DATE"
ARCHIVE="$BACKUP_ROOT/jobsite-$BACKUP_DATE.tar.gz"
ENCRYPTED="$ARCHIVE.age"
mkdir -p -- "$WORK" "$EVIDENCE"

npx supabase db dump --db-url "$SOURCE_DATABASE_URL" --schema auth,public --file "$WORK/schema.sql"
npx supabase db dump --db-url "$SOURCE_DATABASE_URL" --schema auth,public --data-only --use-copy --file "$WORK/data.sql"

psql "$SOURCE_DATABASE_URL" --csv --no-psqlrc > "$WORK/source-counts.csv" <<'SQL'
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
SQL

printf '%s\n' "$SOURCE_COMMIT" > "$WORK/source-commit.txt"
tar -czf "$ARCHIVE" -C "$WORK" .
age -p -o "$ENCRYPTED" "$ARCHIVE"
sha256sum "$ENCRYPTED" | awk '{print $1}' > "$EVIDENCE/sha256.txt"
stat --printf='{"name":"%n","size":%s,"modified":"%y"}\n' "$ENCRYPTED" > "$EVIDENCE/artifact.json"
rm -f -- "$ARCHIVE"
rm -rf -- "$WORK"
~~~

rm 대상은 BACKUP_ROOT 아래의 이번 BACKUP_DATE 경로인지 출력해 확인한 뒤 실행한다. 업로드와 원격 hash 확인 전 encrypted file을 제거하지 않는다.

## 7. 빈 Supabase 프로젝트 복구 훈련 전 Gate

DRILL_DATABASE_URL은 production/staging과 다른 새 Supabase 프로젝트여야 한다. production 또는 staging URL과 같으면 즉시 중단한다.

Windows PowerShell:

~~~powershell
if ($env:DRILL_DATABASE_URL -eq $env:SOURCE_DATABASE_URL) { throw "drill target equals source" }
psql $env:DRILL_DATABASE_URL --no-psqlrc --tuples-only --command "select count(*) from auth.users;"
psql $env:DRILL_DATABASE_URL --no-psqlrc --tuples-only --command "select count(*) from public.jobs;"
~~~

Linux:

~~~bash
test "$DRILL_DATABASE_URL" != "$SOURCE_DATABASE_URL"
psql "$DRILL_DATABASE_URL" --no-psqlrc --tuples-only --command "select count(*) from auth.users;"
psql "$DRILL_DATABASE_URL" --no-psqlrc --tuples-only --command "select count(*) from public.jobs;"
~~~

두 count가 모두 0이어야 한다. 0이 아니면 db reset이나 삭제로 비우지 말고 새 drill project를 만든다. Project URL, publishable key, service-role key는 drill 전용 Vercel Preview에만 설정한다.

## 8. 복호화와 복구 — Windows

ENCRYPTED_BACKUP_FILE과 EXPECTED_SHA256은 private storage와 evidence에서 현재 셸로 설정한다.

~~~powershell
if (-not $env:ENCRYPTED_BACKUP_FILE -or -not $env:EXPECTED_SHA256) { throw "backup file and hash are required" }
$Actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $env:ENCRYPTED_BACKUP_FILE).Hash.ToLowerInvariant()
if ($Actual -ne $env:EXPECTED_SHA256.ToLowerInvariant()) { throw "backup hash mismatch" }

$Restore = Join-Path $env:BACKUP_ROOT "restore-$($env:BACKUP_DATE)"
New-Item -ItemType Directory -Path $Restore -Force | Out-Null
$Archive = Join-Path $Restore "backup.tar.gz"
age --decrypt -o $Archive $env:ENCRYPTED_BACKUP_FILE
if ($LASTEXITCODE -ne 0) { throw "decryption failed" }
tar.exe -xzf $Archive -C $Restore
if ($LASTEXITCODE -ne 0) { throw "extract failed" }

npx supabase link --project-ref $env:DRILL_SUPABASE_REF
npx supabase db push --linked --dry-run
npx supabase db push --linked
psql $env:DRILL_DATABASE_URL --no-psqlrc --set ON_ERROR_STOP=on --single-transaction --file (Join-Path $Restore "data.sql")
if ($LASTEXITCODE -ne 0) { throw "restore failed" }
~~~

## 9. 복호화와 복구 — Linux

~~~bash
: "$ENCRYPTED_BACKUP_FILE" "$EXPECTED_SHA256"
ACTUAL_SHA256="$(sha256sum "$ENCRYPTED_BACKUP_FILE" | awk '{print $1}')"
test "$ACTUAL_SHA256" = "$EXPECTED_SHA256"

RESTORE="$BACKUP_ROOT/restore-$BACKUP_DATE"
mkdir -p -- "$RESTORE"
age --decrypt -o "$RESTORE/backup.tar.gz" "$ENCRYPTED_BACKUP_FILE"
tar -xzf "$RESTORE/backup.tar.gz" -C "$RESTORE"

npx supabase link --project-ref "$DRILL_SUPABASE_REF"
npx supabase db push --linked --dry-run
npx supabase db push --linked
psql "$DRILL_DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=on --single-transaction --file "$RESTORE/data.sql"
~~~

schema.sql은 감사와 비교 자료다. 빈 Supabase project의 managed auth schema와 repository migration을 먼저 사용하므로 기본 복구에서는 schema.sql을 직접 적용하지 않는다. migration과 data restore가 충돌하면 production에 적용하지 말고 원인을 기록해 backup 설계를 수정한다.

## 10. 복구 검증

복구 target에서 source와 같은 count query를 실행해 source-counts.csv와 모든 entity count가 일치하는지 비교한다. 이어서 다음을 검증한다.

1. 모든 public user_id가 auth.users.id에 존재한다.
2. 고아 job_sources, source_checks, duplicate_pairs, job_revisions가 0이다.
3. 사용자 A 세션으로 사용자 B의 jobs, consents, request_usage를 읽거나 변경할 수 없다.
4. consent version과 accepted_at이 보존된다.
5. job provenance, memo, status, next action, revision, duplicate decision, original URL이 보존된다.
6. rate-limit action별 counter와 ownership이 보존되며 한 계정의 소비가 다른 계정에 영향을 주지 않는다.
7. drill Vercel Preview에서 health, Google login, dashboard, export를 확인한다.
8. 테스트 계정 하나를 삭제하고 그 계정의 모든 행이 0이며 다른 계정 count가 그대로인지 확인한다.
9. pgTAP과 Playwright의 관련 recovery/account-isolation 여정을 실행한다.
10. 로그와 evidence에 database URL, password, service-role key, email, token, memo 또는 backup data가 없는지 확인한다.

무결성 query:

~~~sql
select count(*) as orphan_jobs
from public.jobs j left join auth.users u on u.id = j.user_id
where u.id is null;

select count(*) as orphan_sources
from public.job_sources s left join public.jobs j on j.id = s.job_id
where j.id is null;

select count(*) as orphan_revisions
from public.job_revisions r left join auth.users u on u.id = r.user_id
where u.id is null;
~~~

어느 검증이든 실패하면 drill은 실패다. backup을 성공 복구 가능으로 표시하지 않는다.

## 11. 증빙 기록

EVIDENCE_ROOT/jobsite-BACKUP_DATE 아래에 비밀 없는 다음 파일을 남긴다.

- sha256.txt
- artifact.json
- backup-result.md: source 환경명, SOURCE_COMMIT, 시작/종료 UTC, 실행자, 검토자, 관리형 backup ID, encrypted object version, 결과
- restore-result.md: drill project ref의 비식별 별칭, 시작/종료 UTC, migration SHA, count 비교 결과, RLS/ownership/smoke 결과, RPO/RTO 측정, 발견사항
- validation-command-results.txt: 명령명, exit code, test count만 기록
- incident-or-followup.md: 실패 원인, 소유자, 기한, 재훈련 조건

database URL, project key, password, service-role key, OAuth secret, 사용자 email/UUID, SQL dump, JSON backup 내용은 evidence에 넣지 않는다.

## 12. 실제 장애 복구

1. 장애를 선언하고 배포 및 migration을 정지한다.
2. 데이터 손상이 계속되면 쓰기 경로와 provider connector를 비활성화한다.
3. 마지막 정상 시각과 요구 RPO를 기준으로 Supabase 관리형 restore point를 고른다.
4. 선택한 restore point ID와 예상 데이터 손실 구간을 두 사람이 확인한다.
5. 가능하면 새 격리 프로젝트에 먼저 복구하고 이 문서의 count, ownership, RLS, OAuth, health, export 검증을 수행한다.
6. 검증된 프로젝트를 애플리케이션에 연결하거나 Supabase의 지원되는 project restore를 완료한다.
7. Vercel 환경 변경 시 Preview에서 먼저 health를 확인한 후 Production을 승격한다.
8. 사용자 영향, 손실 가능 구간, 복구 완료 시각을 기록하고 알림 여부를 incident runbook에 따라 결정한다.
9. 복구 직후 모든 server secret과 OAuth 설정을 확인하고 노출 의심이 있으면 회전한다.
10. 원인과 재발 방지 작업이 완료될 때까지 새 파괴적 migration을 금지한다.

Production에서 db reset, 임의 DELETE/TRUNCATE, 검증하지 않은 평문 dump restore를 실행하지 않는다.
