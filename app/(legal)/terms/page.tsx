import type { Metadata } from "next";
import Link from "next/link";
import { validateServerEnvironment } from "@/lib/environment";
import { CURRENT_TERMS_VERSION, POLICY_EFFECTIVE_DATE } from "@/lib/legal/policy";

export const metadata: Metadata = {
  title: "이용약관 | 채용공고 허브",
  description: "채용공고 허브 공개 베타 이용약관",
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

export default function TermsPage() {
  const policy = publicPolicyIdentity();

  return (
    <main className="container page-shell">
      <article className="card stack">
        <header>
          <p className="eyebrow">PUBLIC BETA TERMS</p>
          <h1>이용약관</h1>
          <p><strong>시행일: {policy.effectiveDate}</strong> · 버전: {CURRENT_TERMS_VERSION}</p>
          <p className="muted">
            이 문서는 공개 베타 운영을 위한 약관 초안입니다. 서비스의 실제 운영 방식과 운영자 정보를 반영해
            출시 전에 최종 검토하며, 특정 상황에 대한 법률 자문이나 법적 보장을 제공하지 않습니다.
          </p>
        </header>

        <nav className="row" aria-label="관련 정책">
          <Link href="/privacy">개인정보 처리방침</Link>
          <Link href="/sources">외부 출처 안내</Link>
          <Link href="/login">로그인으로 돌아가기</Link>
        </nav>

        <section aria-labelledby="terms-purpose">
          <h2 id="terms-purpose">1. 목적과 적용 범위</h2>
          <p>
            이 약관은 {policy.operatorName}(이하 “운영자”)가 제공하는 채용공고 허브 공개 베타의 이용 조건을
            정합니다. 서비스는 사용자가 외부 채용공고의 원문 링크와 요약 정보, 지원 상태, 메모와 일정을
            한곳에서 관리하도록 돕는 도구이며 실제 입사지원을 대신하지 않습니다.
          </p>
        </section>

        <section aria-labelledby="terms-account">
          <h2 id="terms-account">2. 계정과 이용 자격</h2>
          <ul>
            <li>사용자는 본인이 관리할 수 있는 Google 계정으로 로그인하고 정확한 계정 정보를 사용해야 합니다.</li>
            <li>계정과 로그인 수단을 타인에게 양도하거나 공유해서는 안 됩니다.</li>
            <li>최신 이용약관과 개인정보 처리방침에 필수 동의를 완료해야 개인 화면을 이용할 수 있습니다.</li>
            <li>사용자는 설정 화면에서 데이터를 내보낸 뒤 계정과 사용자 소유 데이터를 영구 삭제할 수 있습니다.</li>
          </ul>
        </section>

        <section aria-labelledby="terms-beta">
          <h2 id="terms-beta">3. 공개 베타의 성격</h2>
          <p>
            공개 베타에서는 기능이 변경되거나 일시적으로 중단될 수 있습니다. 운영자는 장애와 변경 사항을
            확인하고 복구하기 위해 합리적인 운영 절차를 적용하지만, 항상 이용 가능하거나 오류가 전혀 없음을
            보장하지 않습니다. 중요한 지원 기록은 JSON 내보내기로 별도 보관하는 것을 권장합니다.
          </p>
        </section>

        <section aria-labelledby="terms-sources">
          <h2 id="terms-sources">4. 외부 채용정보와 원문</h2>
          <ul>
            <li>채용 조건, 모집 상태와 마감 여부의 최종 기준은 각 제공처의 원문입니다.</li>
            <li>저장된 정보는 원문을 대체하지 않으며, 지원 전에 반드시 원문을 다시 확인해야 합니다.</li>
            <li>자동 조회는 제공처의 승인과 유효한 서버 자격 증명이 있을 때만 사용합니다. 그 밖의 경우 URL과 사용자 입력만 저장합니다.</li>
            <li>외부 제공처의 장애, 내용 변경 또는 삭제로 최신 확인이 실패해도 사용자의 메모와 지원 기록을 임의로 변경하지 않습니다.</li>
            <li>외부 제공처 표시는 정보 출처를 밝히기 위한 것이며, 별도 표시가 없는 한 운영자와 해당 제공처 사이의 제휴나 보증을 의미하지 않습니다.</li>
          </ul>
          <p><Link href="/sources">외부 출처와 표시 방식 자세히 보기</Link></p>
        </section>

        <section aria-labelledby="terms-prohibited">
          <h2 id="terms-prohibited">5. 금지되는 이용</h2>
          <p>사용자는 다음 행위를 해서는 안 됩니다.</p>
          <ul>
            <li>타인의 계정, 개인정보, 로그인 정보 또는 비공개 채용정보를 무단으로 수집·저장하는 행위</li>
            <li>외부 사이트의 로그인, 접근 제한, 기술적 차단이나 이용 조건을 우회하는 행위</li>
            <li>서비스 또는 외부 API에 과도한 요청을 보내거나 요청 제한을 회피하는 행위</li>
            <li>악성 코드 전송, 취약점 악용, 다른 사용자의 데이터 접근 또는 서비스 운영 방해</li>
            <li>외부 채용정보를 출처 없이 재배포하거나 제공처와의 제휴 관계를 오인하게 하는 행위</li>
            <li>관련 법령, 이 약관 또는 외부 제공처의 허용 조건을 위반하는 행위</li>
          </ul>
        </section>

        <section aria-labelledby="terms-user-data">
          <h2 id="terms-user-data">6. 사용자 입력과 책임</h2>
          <p>
            사용자는 본인이 입력한 메모와 지원 기록을 관리할 책임이 있습니다. 제3자의 개인정보나 비밀정보를
            불필요하게 입력해서는 안 됩니다. 운영자는 사용자 입력을 채용 성공, 정보의 완전성 또는 특정 결과를
            보장하는 자료로 취급하지 않습니다.
          </p>
        </section>

        <section aria-labelledby="terms-suspension">
          <h2 id="terms-suspension">7. 이용 제한과 종료</h2>
          <p>
            보안 위협, 서비스 방해, 법령 또는 제공처 조건 위반이 확인되면 운영자는 필요한 범위에서 요청을
            제한하거나 계정 이용을 중지할 수 있습니다. 긴급한 보안 조치가 아닌 경우 가능한 방식으로 사유와
            필요한 후속 조치를 안내합니다. 사용자는 언제든지 설정 화면에서 직접 탈퇴할 수 있습니다.
          </p>
        </section>

        <section aria-labelledby="terms-liability">
          <h2 id="terms-liability">8. 책임의 범위</h2>
          <p>
            서비스가 보여주는 외부 정보는 제공처의 변경, 통신 장애 또는 사용자 입력으로 실제 원문과 다를 수
            있습니다. 사용자의 지원 여부와 채용 결과는 사용자와 채용 주체의 판단에 따릅니다. 이 조항은 관련
            법령상 제한할 수 없는 운영자의 책임이나 사용자의 권리를 배제하지 않습니다.
          </p>
        </section>

        <section aria-labelledby="terms-changes">
          <h2 id="terms-changes">9. 약관 변경</h2>
          <p>
            중요한 이용 조건이 바뀌면 시행일과 변경 내용을 서비스 화면에 알리고 약관 버전을 갱신합니다.
            필수 고지 내용이 변경된 경우 사용자는 개인 화면에 들어가기 전에 새 버전에 다시 동의해야 합니다.
          </p>
        </section>

        <section aria-labelledby="terms-contact">
          <h2 id="terms-contact">10. 운영자와 문의</h2>
          <p>운영 주체: {policy.operatorName}</p>
          {policy.privacyEmail ? (
            <p>문의: <a href={`mailto:${policy.privacyEmail}`}>{policy.privacyEmail}</a></p>
          ) : (
            <p className="error">문의 이메일이 설정되지 않았습니다. 이 상태에서는 공개 배포하면 안 됩니다.</p>
          )}
        </section>
      </article>
    </main>
  );
}
