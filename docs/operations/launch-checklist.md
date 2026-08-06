# 공개 베타 Launch Checklist

**Current decision**: BLOCKED — 공개 베타 링크를 배포하지 않는다.

**Evidence record**: [validation.md](../../specs/003-public-beta-readiness/validation.md)

체크 표시 [x]는 현재 repository 또는 직접 실행 결과로 확인된 사실만 뜻한다. [ ]는 구현 파일 존재 여부와 관계없이 직접 증거가 부족하거나 실패한 출시 차단 항목이다. 비밀값, 사용자 식별정보, 원문 데이터는 증빙에 기록하지 않는다.

## 1. 코드와 자동 검증

- [x] Node.js 24, Next.js 16, Supabase 단일 애플리케이션 구조를 유지한다.
- [x] production 환경 검증 계약이 Supabase 공개 설정, service-role, HTTPS APP_BASE_URL, 운영자명, 개인정보 이메일, 시행일을 요구한다.
- [x] production에서 E2E_BYPASS_AUTH=true를 거절하는 코드와 단위 테스트가 있다.
- [x] repository 기본 connector 설정은 SARAMIN_CONNECTOR_ENABLED=false와 JOBKOREA_CONNECTOR_ENABLED=false다.
- [x] 2026-08-07 Windows에서 npm run typecheck가 통과했다.
- [x] 2026-08-07 Windows에서 npm run test:unit가 19개 파일, 86개 테스트로 통과했다.
- [x] 2026-08-07 Windows에서 npm run lint가 통과했다.
- [x] 2026-08-07 Windows에서 production build가 통과했다.
- [x] npm run verify:beta 전체가 43.8초에 통과했고 git diff --check도 통과했다.
- [x] 현재 beta migration을 적용한 pgTAP 10개 파일, 114개 테스트가 통과했다.
- [x] 현재 beta Playwright Chromium 24개 테스트가 모두 통과했다.
- [x] login, consent, terms, privacy, sources, jobs, new job, detail, settings 9개 route의 axe serious/critical 위반이 0건이다.
- [ ] 같은 beta commit의 Ubuntu Node 24 CI가 통과하고 commit SHA, Actions run URL, job 결과를 validation.md에 기록한다.
- [ ] tasks.md의 T001–T066이 직접 증거와 대조된 뒤 모두 완료 표시된다.

## 2. 운영자와 법적 고지

- [ ] PUBLIC_OPERATOR_NAME에 실제 서비스 운영 주체명이 확정돼 있다.
- [ ] PUBLIC_PRIVACY_EMAIL이 실제 수신·응답 가능한 개인정보 문의 주소로 검증돼 있다.
- [ ] PUBLIC_POLICY_EFFECTIVE_DATE가 최종 문안의 실제 시행일과 일치한다.
- [ ] 약관의 계정 규칙, 금지 행위, 외부 출처 제한, 해지, 변경, 책임 범위를 운영자가 검토했다.
- [ ] 개인정보 처리방침의 처리 항목, 목적, 보유기간, 삭제, Google·Supabase·hosting 처리자, 국외 처리, 안전조치, 사용자 권리와 문의 절차를 검토했다.
- [ ] 외부 출처 안내의 원문 우선, 수동 모드, API 장애, 비제휴 표현과 제공자 표기를 검토했다.
- [ ] 최종 약관·개인정보 처리방침에 필요한 법률 검토 또는 출시 책임자의 명시적 승인이 기록돼 있다.
- [ ] 코드의 약관·개인정보 처리방침 버전이 최종 승인 문안과 일치하고 문안 변경 시 재동의가 작동한다.
- [ ] 탈퇴·보존·backup의 실제 운영 정책이 고지 문안과 runbook 사이에서 모순되지 않는다.

## 3. Supabase, Vercel, Google OAuth

- [ ] staging과 production에 서로 다른 Supabase 프로젝트가 준비돼 있다.
- [ ] staging과 production에 서로 다른 Vercel 환경 범위가 적용돼 있다.
- [ ] NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SERVICE_ROLE_KEY가 같은 환경의 한 프로젝트 세트임을 검토했다.
- [ ] service-role key는 Vercel Sensitive/server-only 저장소에만 있고 Git, browser bundle, 응답, 로그에 없다.
- [ ] APP_BASE_URL이 실제 HTTPS staging/production origin과 일치하며 끝 슬래시가 없다.
- [ ] Google Cloud에 환경별 OAuth Web client가 있고 승인 redirect URI가 해당 Supabase Project URL의 /auth/v1/callback과 정확히 일치한다.
- [ ] Supabase Site URL과 Redirect URLs에 해당 APP_BASE_URL과 APP_BASE_URL/auth/callback만 명시돼 있으며 production wildcard가 없다.
- [ ] Google client secret은 Supabase provider 설정에만 있고 Vercel 공개 변수나 Git에 없다.
- [ ] staging과 production Vercel 환경에 E2E_BYPASS_AUTH가 존재하지 않음을 dashboard/audit log로 확인했다.
- [ ] migration dry-run이 예상 migration만 포함하고 별도 검토자가 승인했다.
- [ ] production 배포 SHA가 validation.md에 기록된 검증 SHA와 일치한다.

## 4. 비밀과 로그

- [x] 추적 파일 대표 secret pattern scan이 0건이다. 실제 운영 credential 등록값 검사는 staging에서 별도로 수행한다.
- [ ] production build output 표본에서 secret canary가 0건이다.
- [x] 단위 테스트의 health·오류 응답과 안전 로그에서 등록된 테스트 canary가 0건이다. 배포 응답은 별도 미검증이다.
- [ ] Vercel captured logs에서 secret canary가 0건이다.
- [x] 단위 테스트가 안전 로그 allowlist와 token, cookie, URL, memo, job body canary 비노출을 검증한다. Vercel captured log는 별도 미검증이다.
- [ ] secret rotation 권한과 절차가 실제 운영 계정으로 확인됐다.
- [x] 비밀 노출·회전·영향 평가 절차가 [incident-response.md](./incident-response.md)에 문서화돼 있다.

## 5. Backup, restore, rollback

- [x] 배포·migration·health·smoke 절차가 [deploy.md](./deploy.md)에 문서화돼 있다.
- [x] RPO/RTO, 주기, 보존, 암호화, 빈 프로젝트 복구와 증빙 절차가 [backup-restore.md](./backup-restore.md)에 문서화돼 있다.
- [x] 데이터 보존 우선 rollback 절차가 [rollback.md](./rollback.md)에 문서화돼 있다.
- [ ] production Supabase 관리형 자동 backup이 활성화됐고 최신 성공 backup ID와 복구 가능 시각이 기록돼 있다.
- [ ] 최소 7개의 일별 복구 시점 또는 요금제가 보장하는 실제 보존 범위를 확인했다.
- [ ] 암호화 논리 backup이 private encrypted storage에 업로드되고 SHA256이 일치한다.
- [ ] 빈 staging Supabase 프로젝트에 auth/public 데이터를 복구하고 source/target entity count가 일치한다.
- [ ] 복구 후 고아 row 0, 사용자 소유권, RLS 계정 격리, consent, provenance, export, account deletion이 통과한다.
- [ ] 측정한 recovery time이 RTO 4시간 이내이며 backup 시점이 RPO 24시간을 충족한다.
- [ ] 이전 정상 Vercel deployment rollback drill이 health, SHA, OAuth와 핵심 smoke를 통과한다.
- [ ] backup/restore와 rollback drill의 실행자·검토자·UTC·비식별 evidence가 validation.md에 연결돼 있다.

## 6. 외부 제공자 조건

- [x] 승인·credential이 없을 때 connector가 manual fallback을 사용하도록 설계돼 있다.
- [ ] production의 SARAMIN_CONNECTOR_ENABLED 실제 값이 출시 결정에 기록돼 있다.
- [ ] 사람인 connector를 끈 채 출시한다면 SARAMIN_API_KEY가 production에 불필요하게 저장되지 않았고 수동 표기가 staging에서 확인됐다.
- [ ] 사람인 connector를 켠다면 API 승인, 실제 사용 URL 등록, access-key, 무료 제공 조건, 호출 한도, 필수 Powered by 취업 사람인 표기와 원문 링크를 모두 직접 확인했다.
- [ ] production의 JOBKOREA_CONNECTOR_ENABLED 실제 값이 출시 결정에 기록돼 있다.
- [ ] 잡코리아 connector를 켠다면 승인, 발급 endpoint, 등록 IP 조건, 표시 조건을 직접 확인했다.
- [ ] provider 장애 시 connector를 끄고 기존 공고·메모·상태·일정·원문 링크가 유지되는 staging 증거가 있다.
- [x] Windows 전체 검증은 두 connector를 비활성화하고 fixture만 사용했다. Ubuntu CI의 동일 조건은 실행 후 별도 확인한다.

## 7. Staging 사용자 여정

- [ ] 로그아웃 상태에서 terms, privacy, sources가 열린다.
- [ ] 새 Google 계정으로 로그인하고 최신 동의 전 private route가 consent로 이동한다.
- [ ] 두 고지를 각각 체크해야만 동의가 저장되고 dashboard에 진입한다.
- [ ] 고지 버전 변경 후 기존 사용자가 재동의를 요구받는다.
- [ ] 수동 HTTPS 공고 저장, 목록, 상세, 원문 링크, 메모, 지원 상태가 정상이다.
- [ ] export가 no-store로 성공하고 사용자 핵심 데이터가 포함된다.
- [ ] 제한 초과 계정은 429와 Retry-After를 받고 다른 계정 quota와 기존 기록은 변하지 않는다.
- [ ] limiter 저장소 장애가 provider 호출과 파괴적 변경 전에 503으로 fail-closed 된다.
- [ ] health가 2초 안에 200, database ok, 배포 SHA, request ID를 반환하고 비밀을 노출하지 않는다.
- [ ] production 보안 헤더와 CSP가 Google OAuth 및 Supabase HTTPS/WSS를 깨뜨리지 않는다.
- [ ] 정확한 회원탈퇴 확인과 최근 인증 후 Auth 계정·모든 소유 row가 1분 안에 삭제된다.
- [ ] 삭제 계정은 재로그인되지 않고 다른 계정 데이터가 변하지 않는다.
- [ ] staging 여정의 UTC, 배포 SHA, request ID, 성공/실패만 validation.md에 기록돼 있다.

## 8. 최종 출시 승인

- [ ] validation.md의 FR-001–FR-011, DT-001–DT-004, UR-001–UR-003이 모두 직접 증거로 PASS다.
- [ ] SC-001–SC-006이 측정값과 Windows·Ubuntu·staging 증거로 모두 PASS다.
- [ ] 알려진 P0/P1 오류와 미확인 데이터 손실 위험이 없다.
- [ ] incident 연락 체계와 사용자 알림 결정권자가 정해져 있다.
- [ ] 출시 책임자가 현재 배포 SHA와 evidence를 검토하고 GO를 기록했다.

위 체크가 모두 완료되기 전에는 공개 베타를 출시하지 않는다.
