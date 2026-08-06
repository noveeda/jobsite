import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "외부 출처 안내 | 채용공고 허브",
  description: "채용공고 허브의 외부 채용정보 사용 및 표시 방식",
};

export default function SourcesPage() {
  return (
    <main className="container page-shell">
      <article className="card stack">
        <header>
          <p className="eyebrow">SOURCE POLICY</p>
          <h1>외부 출처 안내</h1>
          <p className="muted">
            채용공고 허브가 외부 채용정보를 확인·저장·표시하는 기준과 자동 조회가 불가능할 때의 동작을 설명합니다.
          </p>
        </header>

        <nav className="row" aria-label="관련 정책">
          <Link href="/terms">이용약관</Link>
          <Link href="/privacy">개인정보 처리방침</Link>
          <Link href="/login">로그인으로 돌아가기</Link>
        </nav>

        <section aria-labelledby="source-original">
          <h2 id="source-original">1. 원문이 최종 기준입니다</h2>
          <p>
            서비스에 저장된 제목, 회사명, 지역, 마감일과 모집 상태는 비교와 개인 관리를 돕기 위한 정보입니다.
            저장된 정보는 원문을 대체하지 않으며 지원 전에 반드시 제공처의 원문을 확인해야 합니다. 각 공고에는
            가능한 경우 출처 이름, 원문 URL, 최초 관찰 시각과 마지막 확인 결과를 함께 표시합니다.
          </p>
        </section>

        <section aria-labelledby="source-modes">
          <h2 id="source-modes">2. 제공 방식의 구분</h2>
          <ul>
            <li><strong>승인 API:</strong> 제공처의 사전 승인, 서버 자격 증명과 이용 조건이 모두 충족된 공식 API의 구조화 정보만 조회합니다.</li>
            <li><strong>수동 입력:</strong> URL을 보관하고 사용자가 회사명, 공고명과 지원 정보를 직접 입력합니다. API에서 제공받은 정보로 표시하지 않습니다.</li>
            <li><strong>정규화 정보:</strong> 날짜나 지역처럼 표시 형식만 정리한 값은 원문 사실과 구분해 보존합니다.</li>
            <li><strong>확인 실패:</strong> 제공처 장애나 제한으로 확인하지 못한 값은 실패 상태와 마지막 성공 시각을 표시합니다.</li>
          </ul>
        </section>

        <section aria-labelledby="source-approval">
          <h2 id="source-approval">3. 승인 전에는 자동 조회하지 않습니다</h2>
          <p>
            승인이나 자격 증명이 없거나 커넥터가 꺼져 있으면 외부 네트워크 요청을 보내지 않고 수동 입력으로
            전환합니다. 로그인 우회, HTML 무단 수집, 브라우저 자동화, 비공개 API나 접근 제한 회피는 사용하지
            않습니다. 자동 조회 실패도 사용자가 작성한 메모, 지원 상태, 일정과 기존 저장값을 삭제하거나
            임의로 덮어쓰지 않습니다.
          </p>
        </section>

        <section aria-labelledby="source-saramin">
          <h2 id="source-saramin">4. 사람인 정보 표시와 조건</h2>
          <p>
            사람인 자동 조회는 사람인의 승인을 받은 서비스 URL과 유효한 access-key가 서버에 설정된 경우에만
            켭니다. 승인 API에서 받은 공고에는 원문 링크와
            {" "}<a href="https://www.saramin.co.kr" target="_blank" rel="noopener noreferrer">Powered by 취업 사람인</a>
            {" "}표시를 제공합니다. 수동으로 저장한 사람인 URL은 “사람인 · 수동 입력”으로 구분합니다.
          </p>
          <ul>
            <li>access-key는 브라우저, 저장소, 로그 또는 다른 사용자에게 공개하지 않습니다.</li>
            <li>공식 일일 호출 한도 안에서 더 보수적인 캐시와 사용자별 요청 제한을 적용합니다.</li>
            <li>사람인 API 정보를 이용한 기능은 이용자에게 유·무형의 대가를 받지 않는 무료 공개 베타 범위로 운영합니다.</li>
            <li>제공 주체나 제휴 관계를 오인하게 표현하지 않으며, 채용 조건의 최종 확인은 사람인 원문에서 합니다.</li>
          </ul>
          <p className="row">
            <a href="https://oapi.saramin.co.kr/introduce" target="_blank" rel="noopener noreferrer">사람인 API 소개</a>
            <a href="https://oapi.saramin.co.kr/caution" target="_blank" rel="noopener noreferrer">서비스 이용자 주의사항</a>
          </p>
        </section>

        <section aria-labelledby="source-others">
          <h2 id="source-others">5. 잡코리아와 그 밖의 출처</h2>
          <p>
            잡코리아는 별도의 공식 승인과 발급된 호출 URL이 모두 확인된 경우에만 승인 API 모드를 사용할 수
            있습니다. 잡플래닛, 기업 채용 페이지와 그 밖의 출처는 별도의 허용된 연동이 확인되기 전까지 URL
            보관과 수동 입력만 제공합니다.
          </p>
        </section>

        <section aria-labelledby="source-affiliation">
          <h2 id="source-affiliation">6. 제휴 관계 고지</h2>
          <p>
            출처 이름과 제공자 표시는 정보의 근거를 밝히기 위한 것입니다. 명시적인 별도 안내가 없는 한 채용공고
            허브는 사람인, 잡코리아, 잡플래닛 또는 해당 채용 기업을 운영하거나 대표하지 않으며 제휴 관계를
            주장하지 않습니다.
          </p>
        </section>
      </article>
    </main>
  );
}
