# 외부 출처 승인 기록과 활성화 Runbook

이 문서는 실제 제공자 API를 연결하기 전의 비밀 없는 승인 증빙을 기록한다. access key, OAuth secret, raw provider 응답, 사용자 URL, 계정 ID는 이 파일·티켓·채팅·Git에 기록하지 않는다.

## 현재 상태

| Provider | 상태 | Runtime 활성화 | 출시 증빙 |
| --- | --- | --- | --- |
| Saramin | pending | disabled | API 승인·보존 조건·staging smoke 대기 |
| Work24 | not requested | disabled | 서면 API 권한·약관·표시 조건 대기 |

fixture 제공자는 자동 검증 전용이다. 실제 제공자 수, 100개 활성 공고, 또는 공개 출시 증거에 포함하지 않는다.

## 필수 승인 기록 템플릿

각 실제 제공자마다 아래 항목을 비밀 없이 채운다.

| 항목 | 기록할 값 |
| --- | --- |
| provider code와 표시명 | 예: `saramin` / 사람인 |
| approval reference | 승인 메일·지원 티켓·계약의 식별자 또는 안전한 내부 링크 |
| terms URL 및 확인 UTC | 적용 약관 URL과 검토 시각 |
| 허용 사용처 | 서비스 도메인·환경·목적 (키나 IP 자체는 제외) |
| retention decision | 허용 필드, 보존 기간, 종료·철회 시 purge 방식 |
| quota decision | 일/예약/예비 한도와 관측 책임자 |
| attribution decision | 필수 표시 문구·링크·목록/상세 검증 위치 |
| staging smoke reference | 키를 노출하지 않는 request ID·배포 SHA·UTC 또는 안전한 내부 링크 |
| operator enablement | 실행자·검토자 역할, UTC, production enablement 승인 식별자 |
| disable/withdrawal drill | 비활성화 시각, 기존 개인 상태 보존, rollback 검증 식별자 |

## Runtime activation 순서

1. `source_providers`의 실제 provider 행에 `activation_required=true`를 기록한다.
2. 승인·약관·보존·quota·attribution·staging smoke 증빙을 채우고 `approval_status=approved` 및 미래 `approval_expires_at`을 설정한다.
3. 두 사람(실행자와 검토자)이 확인한 뒤에만 `enabled=true`, `enabled_at`, `enabled_by`를 함께 기록한다.
4. 서버 전용 배포 비밀 저장소에 credential을 넣는다. 이 값은 승인 기록, SQL migration, browser 환경 변수에 넣지 않는다.
5. protected staging collector 요청으로 due/lease/quota/attribution/로그 redaction을 확인한다. 이 증거가 없으면 production enablement를 중단한다.
6. production에서 한 제공자만 먼저 활성화하고 요청량·오류·freshness를 관찰한다. 두 독립적으로 승인된 제공자와 100개 active row 증거 전에는 공개 출시하지 않는다.

Resolver는 preview, 개인 공고 refresh, catalog collector의 실제 사람인 요청 직전에 restricted 행을 다시 읽는다. `pending`, `blocked`, `withdrawn`, 만료된 승인, 누락된 보존·attribution·smoke·operator 기록, disabled 행, 또는 credential 부재는 모두 typed disabled 결과로 끝나며 provider request를 만들지 않는다. 환경 플래그와 credential만으로는 이 경계를 우회할 수 없다.

## 철회 및 만료

승인 철회·약관 변경·만료·quota 초과가 의심되면 먼저 `enabled=false` 또는 `approval_status=withdrawn`으로 변경한다. 이후 [rollback.md](./rollback.md)의 provider 격리 절차와 [incident-response.md](./incident-response.md)의 비밀·데이터 대응 절차를 따른다. 승인된 retention 기간이 지난 뒤에만 purge를 실행하며, 사용자 메모·저장·지원 상태·원문 링크는 provider purge로 지우지 않는다.

## 출시 차단 조건

다음 하나라도 없으면 production provider를 활성화하거나 공개 출시를 선언하지 않는다.

- 두 독립 제공자의 서면 승인과 위 템플릿의 완결된 기록
- 100개 이상 active 공고, 각 출처 attribution과 원문 링크의 staging/production 증거
- request-log redaction, freshness 측정, quota/lease 관측, provider disable/rollback drill
- backup/restore drill, OAuth/health smoke, representative user trial, 출시 책임자 GO 기록
