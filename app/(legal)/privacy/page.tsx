import type { Metadata } from "next";
import Link from "next/link";
import { validateServerEnvironment } from "@/lib/environment";
import { CURRENT_PRIVACY_VERSION, POLICY_EFFECTIVE_DATE } from "@/lib/legal/policy";

export const metadata: Metadata = {
  title: "개인정보 처리방침 | 채용공고 허브",
  description: "채용공고 허브 공개 베타 개인정보 처리방침",
};

function publicPolicyIdentity() {
  try {
    const environment = validateServerEnvironment();
    return {
      operatorName: environment.operatorName ?? "운영자 정보 미설정",
      privacyEmail: environment.privacyEmail,
      effectiveDate: environment.policyEffectiveDate ?? POLICY_EFFECTIVE_DATE,
    };
  } catch {
    return {
      operatorName: "운영자 정보 미설정",
      privacyEmail: undefined,
      effectiveDate: POLICY_EFFECTIVE_DATE,
    };
  }
}

export default function PrivacyPage() {
  const policy = publicPolicyIdentity();

  return (
    <main className="container page-shell">
      <article className="card stack">
        <header>
          <p className="eyebrow">PUBLIC BETA PRIVACY</p>
          <h1>개인정보 처리방침</h1>
          <p><strong>시행일: {policy.effectiveDate}</strong> · 버전: {CURRENT_PRIVACY_VERSION}</p>
          <p className="muted">
            이 문서는 공개 베타에서 예정된 실제 처리 흐름을 설명하는 초안입니다. 운영자는 배포 지역과 수탁자,
            보관 정책을 확정한 뒤 출시 전에 최종 검토하며, 이 문서 자체는 법률 자문이나 절대적인 보안 보장을
            의미하지 않습니다.
          </p>
        </header>

        <nav className="row" aria-label="관련 정책">
          <Link href="/terms">이용약관</Link>
          <Link href="/sources">외부 출처 안내</Link>
          <Link href="/login">로그인으로 돌아가기</Link>
        </nav>

        <section aria-labelledby="privacy-controller">
          <h2 id="privacy-controller">1. 처리 주체와 문의</h2>
          <p>{policy.operatorName}(이하 “운영자”)는 채용공고 허브 제공에 필요한 개인정보를 처리합니다.</p>
          {policy.privacyEmail ? (
            <p>개인정보 문의 및 권리 행사: <a href={`mailto:${policy.privacyEmail}`}>{policy.privacyEmail}</a></p>
          ) : (
            <p className="error">개인정보 문의 이메일이 설정되지 않았습니다. 이 상태에서는 공개 배포하면 안 됩니다.</p>
          )}
        </section>

        <section aria-labelledby="privacy-data">
          <h2 id="privacy-data">2. 처리하는 정보</h2>
          <ul>
            <li><strong>로그인 정보:</strong> Google 및 Supabase가 전달하는 계정 식별자, 이메일 주소와 인증 처리 정보</li>
            <li><strong>사용자 입력:</strong> 저장한 공고 URL, 정리한 공고 항목, 지원 상태, 일정과 자유 형식 메모</li>
            <li><strong>동의 기록:</strong> 이용약관·개인정보 처리방침 버전과 동의 시각</li>
            <li><strong>운영 정보:</strong> 요청 식별자, 요청 분류, 처리 결과, 제한 사용량, 오류 분류와 발생 시각</li>
            <li><strong>기술 정보:</strong> 로그인 세션 쿠키와 서비스 제공 과정에서 호스팅 사업자가 처리하는 접속 정보</li>
          </ul>
          <p>
            운영 로그에는 인증 토큰, API 키, 쿠키 값, 공고 본문과 사용자 메모를 기록하지 않도록 제한합니다.
            서비스는 외부 채용 사이트의 비밀번호나 로그인 세션을 요구하거나 저장하지 않습니다.
          </p>
        </section>

        <section aria-labelledby="privacy-purpose">
          <h2 id="privacy-purpose">3. 처리 목적</h2>
          <ul>
            <li>Google 로그인, 계정 식별과 사용자별 데이터 접근 분리</li>
            <li>채용공고 저장·검색, 중복 판단, 지원 상태·메모·일정 관리, 내보내기와 복원</li>
            <li>최신 고지 동의 여부 확인과 변경된 고지의 재동의 요청</li>
            <li>요청 남용 방지, 장애 확인, 보안 사고 대응과 서비스 복구</li>
            <li>사용자 요청에 따른 계정과 데이터 삭제</li>
          </ul>
        </section>

        <section aria-labelledby="privacy-basis">
          <h2 id="privacy-basis">4. 처리 근거와 선택</h2>
          <p>
            공개 베타는 사용자가 고지 내용을 확인하고 필수 처리에 명시적으로 동의한 뒤 제공됩니다. 필수 처리에
            동의하지 않으면 개인 공고 공간은 이용할 수 없지만, 로그인 없이 약관·개인정보 처리방침·외부 출처
            안내는 계속 열람할 수 있습니다. 사용자는 언제든지 탈퇴로 향후 처리를 중단할 수 있습니다.
          </p>
        </section>

        <section aria-labelledby="privacy-retention">
          <h2 id="privacy-retention">5. 보유 기간과 삭제</h2>
          <ul>
            <li>계정, 동의 기록과 사용자 소유 데이터는 계정이 유지되는 동안 보관합니다.</li>
            <li>탈퇴가 완료되면 인증 계정과 연결된 공고, 출처, 이력, 메모, 일정, 동의와 요청 사용량을 삭제합니다.</li>
            <li>운영 로그는 장애·보안 대응에 필요한 최소 기간만 보관하고, 확정된 운영 보관 주기를 적용합니다.</li>
            <li>백업 사본은 정해진 순환 주기에 따라 삭제되며, 복구 목적으로만 접근합니다.</li>
            <li>관련 법령에 별도 보존 의무가 있는 정보는 해당 근거와 기간 동안 분리 보관할 수 있습니다.</li>
          </ul>
          <p>
            사용자는 탈퇴 전에 설정 화면에서 핵심 데이터를 JSON으로 내보낼 수 있습니다. 탈퇴는 되돌릴 수
            없으므로 서비스는 별도의 정확한 확인 문구를 요구합니다.
          </p>
        </section>

        <section aria-labelledby="privacy-processors">
          <h2 id="privacy-processors">6. 외부 서비스와 국외 처리</h2>
          <p>서비스 제공 과정에서 다음 사업자가 각자의 정책과 계약에 따라 정보를 처리할 수 있습니다.</p>
          <ul>
            <li><strong>Google:</strong> OAuth 로그인과 계정 인증</li>
            <li><strong>Supabase:</strong> 인증, 데이터베이스, 세션과 실시간 동기화</li>
            <li><strong>웹 호스팅 및 로그 제공자:</strong> 애플리케이션 실행, 전송, 배포 로그와 장애 대응</li>
          </ul>
          <p>
            위 사업자의 서버가 대한민국 밖에 있으면 계정 식별자, 이메일, 사용자 저장 데이터 또는 운영 정보가
            해당 서비스의 서버 지역에서 처리될 수 있습니다. 운영자는 공개 배포 전에 실제 호스팅 사업자,
            처리 국가, 이전 시점·방법과 보유 기간을 확인해 이 항목을 최종 확정합니다. 외부 채용정보 API에는
            제공처가 요구하는 검색 식별자만 보내며 사용자 메모와 인증 정보를 보내지 않습니다.
          </p>
        </section>

        <section aria-labelledby="privacy-safeguards">
          <h2 id="privacy-safeguards">7. 안전조치</h2>
          <ul>
            <li>사용자 식별자에 기반한 데이터베이스 행 수준 접근 제어</li>
            <li>HTTPS 전송과 서버 전용 비밀 저장소를 통한 자격 증명 분리</li>
            <li>사용자별 요청 제한, 비밀값을 제외한 구조화 로그와 요청 식별자</li>
            <li>데이터 내보내기, 검증된 복원, 운영 백업과 복구 훈련</li>
            <li>운영 설정 검증, 보안 응답 헤더와 장애 대응 절차</li>
          </ul>
          <p>어떤 시스템도 모든 위험을 완전히 제거할 수 없으며, 운영자는 확인된 위험에 맞춰 보호조치를 갱신합니다.</p>
        </section>

        <section aria-labelledby="privacy-rights">
          <h2 id="privacy-rights">8. 사용자의 권리와 행사 방법</h2>
          <ul>
            <li>서비스 화면에서 본인의 공고, 메모, 상태와 일정 열람·수정</li>
            <li>설정 화면에서 핵심 데이터 내보내기</li>
            <li>정확한 확인 후 계정과 사용자 소유 데이터 삭제</li>
            <li>개인정보 문의 이메일을 통한 열람, 정정, 삭제, 처리 중지와 동의 철회 요청</li>
          </ul>
          <p>
            운영자는 요청자가 계정 소유자인지 확인한 뒤 처리 결과 또는 제한 사유를 안내합니다. 다른 사람의
            정보나 관련 법령상 보존해야 하는 정보는 요청 범위가 제한될 수 있습니다.
          </p>
        </section>

        <section aria-labelledby="privacy-cookies">
          <h2 id="privacy-cookies">9. 쿠키</h2>
          <p>
            서비스는 로그인 세션 유지와 보안에 필요한 쿠키를 사용합니다. 필수 세션 쿠키를 차단하면 로그인한
            기능을 이용할 수 없습니다. 광고 추적 쿠키는 공개 베타의 기본 기능에 포함하지 않습니다.
          </p>
        </section>

        <section aria-labelledby="privacy-children">
          <h2 id="privacy-children">10. 아동의 정보</h2>
          <p>
            서비스는 아동을 대상으로 설계되지 않았으며 아동의 정보를 의도적으로 수집하지 않습니다. 관련 정보가
            잘못 처리됐다고 판단되면 개인정보 문의 이메일로 알려 주세요.
          </p>
        </section>

        <section aria-labelledby="privacy-changes">
          <h2 id="privacy-changes">11. 방침 변경</h2>
          <p>
            처리 항목, 목적, 보유 기간 또는 외부 처리 방식이 중요하게 바뀌면 시행일과 변경 내용을 알리고 방침
            버전을 갱신합니다. 필수 고지 변경은 개인 화면에 들어가기 전 재동의를 요구합니다.
          </p>
        </section>
      </article>
    </main>
  );
}
