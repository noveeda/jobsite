# Quickstart: 공개 베타 준비

이 문서는 공개 베타를 로컬에서 검증하고 스테이징에 배포하기 위한 최소 절차다. 사람인 자동 연동은 승인 전까지 꺼 둔다.

## 1. 발급받거나 확정할 항목

공개 베타에 반드시 필요한 외부 값은 다음과 같다.

- Supabase 운영 프로젝트의 Project URL, Publishable key, Service role key, Project ref, 데이터베이스 비밀번호
- Google Cloud OAuth 2.0 Web application의 Client ID와 Client secret
- HTTPS 공개 주소와 해당 주소를 사용할 수 있는 배포 계정
- 운영자 또는 서비스 운영 주체명, 개인정보 문의 이메일, 약관·개인정보 처리방침 시행일
- 선택 사항: 승인된 사람인 API access-key. 승인 전에는 `SARAMIN_CONNECTOR_ENABLED=false`를 유지한다.

Service role key, Google Client secret, 데이터베이스 비밀번호와 사람인 access-key는 서버 또는 배포 플랫폼의 비밀 저장소에만 보관한다. 브라우저 공개 변수, Git, 로그, 오류 응답에 넣지 않는다.

## 2. 로컬 준비

Windows PowerShell에서 저장소 루트로 이동한 뒤 다음을 실행한다.

```powershell
npm ci
npx playwright install chromium
npx supabase start
npx supabase db reset
```

`.env.local`에는 로컬 Supabase가 출력한 URL과 publishable key를 사용한다. 공개 베타 구현 후 환경 검증기는 다음 계약을 강제해야 한다.

| 변수 | 공개 여부 | 조건 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저 공개 | 항상 필수 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저 공개 | 항상 필수 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 비밀 | 탈퇴 기능에 필수 |
| `APP_BASE_URL` | 서버 설정 | HTTPS 운영 주소, 로컬에서는 `http://127.0.0.1:3000` |
| `PUBLIC_OPERATOR_NAME` | 공개 고지 | 비어 있으면 운영 시작 거부 |
| `PUBLIC_PRIVACY_EMAIL` | 공개 고지 | 유효한 이메일, 비어 있으면 운영 시작 거부 |
| `PUBLIC_POLICY_EFFECTIVE_DATE` | 공개 고지 | ISO 날짜, 비어 있으면 운영 시작 거부 |
| `SARAMIN_CONNECTOR_ENABLED` | 서버 설정 | 기본값 `false` |
| `SARAMIN_API_KEY` | 서버 비밀 | 사람인 커넥터가 켜졌을 때만 필수 |
| `JOBKOREA_CONNECTOR_ENABLED` | 서버 설정 | 기본값 `false` |
| `JOBKOREA_API_URL` | 서버 비밀 | 잡코리아 커넥터가 켜졌을 때만 필수 |
| `E2E_BYPASS_AUTH` | 테스트 전용 | production에서는 값과 관계없이 시작 거부 |

## 3. Google OAuth 설정

Google Cloud Console에서 Web application OAuth 클라이언트를 만들고 Supabase가 안내하는 callback URL을 승인된 리디렉션 URI에 등록한다. Supabase Authentication의 Google provider에 Client ID와 Client secret을 저장한다. Supabase URL Configuration에는 운영 `APP_BASE_URL`을 Site URL로, 다음 경로를 Redirect URLs로 등록한다.

```text
${APP_BASE_URL}/auth/callback
```

스테이징과 운영 주소가 다르면 각 주소의 callback을 모두 명시적으로 등록한다. 와일드카드 리디렉션은 사용하지 않는다.

## 4. 로컬 자동 검증

테스트는 외부 제공자의 실제 API를 호출하지 않는다. 테스트 작성 후 구현 전 실패를 확인하고, 구현 후 다음 순서로 전체 검증한다.

```powershell
npm run lint
npm run typecheck
npm run test:unit
npm run build
npx supabase test db
npm run test:e2e
```

검증 결과는 다음을 증명해야 한다.

- 최신 약관과 개인정보 처리방침에 동의하지 않은 사용자는 대시보드에 들어가지 못한다.
- 동의 버전이 바뀌면 재동의가 필요하며, 고지는 로그아웃 상태에서도 열린다.
- 정확한 탈퇴 확인 문구 없이는 어떤 행도 삭제되지 않는다.
- 탈퇴 성공 후 인증 계정과 사용자 소유 데이터가 1분 안에 사라지고 기존 세션을 재사용할 수 없다.
- 한 사용자의 제한 초과가 다른 사용자 제한량에 영향을 주지 않는다.
- 요청 제한 저장소가 실패하면 외부 호출과 파괴적 변경은 거절된다.
- 상태 응답과 구조화 로그에 키, 토큰, 쿠키, 메모, 공고 본문이 없다.
- 사람인 API 유래 공고에는 `Powered by 취업 사람인`과 원문 링크가 보이고, 비승인 출처는 수동 상태로 남는다.

## 5. 스테이징 배포 순서

1. Supabase 운영 프로젝트와 별개의 스테이징 프로젝트를 만든다.
2. 배포 플랫폼의 Preview 또는 Staging 환경에 환경 계약의 실제 값을 저장한다.
3. `npx supabase link --project-ref $env:SUPABASE_PROJECT_REF`로 스테이징 프로젝트를 연결한다.
4. `npx supabase db push --dry-run` 결과를 검토한 후 `npx supabase db push`를 실행한다.
5. 애플리케이션을 배포하고 `/api/health`가 2초 안에 비밀 없는 준비 상태를 반환하는지 확인한다.
6. 새 Google 계정으로 로그인, 고지 동의, 첫 공고 저장, JSON 내보내기, 탈퇴를 순서대로 수행한다.
7. 탈퇴한 계정으로 재접속되지 않고 데이터베이스의 사용자 소유 행이 0건인지 확인한다.
8. 보안 헤더, 요청 제한, 사람인 표기, 모바일 키보드 흐름과 오류 로그 마스킹을 확인한다.

## 6. 출시 판정

다음 조건을 모두 만족해야 공개 베타 링크를 배포한다.

- 운영자명, 개인정보 문의 이메일, 고지 시행일과 최종 법적 문안을 운영자가 검토했다.
- 스테이징 데이터베이스 백업을 만들고 빈 프로젝트에 복구하는 훈련을 완료했다.
- 배포, 마이그레이션, 백업, 복구, 장애 대응과 롤백 문서가 실제 담당자에게 실행 가능하다.
- Windows와 GitHub Actions Ubuntu에서 전체 검증이 통과했다.
- 운영 환경에서 `E2E_BYPASS_AUTH`가 없고, 승인받지 않은 모든 외부 커넥터가 꺼져 있다.
- 사람인 연동을 켠 경우 승인된 서비스 URL, access-key, 무료 제공 조건과 필수 출처 표기를 다시 확인했다.
