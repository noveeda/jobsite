import Link from "next/link";

export function Filters({ values }: { values: Record<string, string | undefined> }) {
  return (
    <form className="card filter-grid">
      <label>검색<input name="q" defaultValue={values.q} placeholder="회사, 제목, 직무" /></label>
      <label>지역<input name="region" defaultValue={values.region} /></label>
      <label>지원 상태
        <select name="status" defaultValue={values.status ?? ""}>
          <option value="">전체</option>
          <option value="unreviewed">검토 전</option>
          <option value="interested">관심</option>
          <option value="planned">지원 예정</option>
          <option value="applied">지원 완료</option>
          <option value="interviewing">전형 진행</option>
          <option value="accepted">최종 합격</option>
          <option value="rejected">불합격</option>
          <option value="excluded">제외</option>
        </select>
      </label>
      <label>출처
        <select name="source" defaultValue={values.source ?? ""}>
          <option value="">전체</option>
          <option value="saramin">사람인</option>
          <option value="jobkorea">잡코리아</option>
          <option value="other">기타</option>
        </select>
      </label>
      <label>정렬
        <select name="sort" defaultValue={values.sort ?? "created"}>
          <option value="created">등록일</option>
          <option value="posted">게시일</option>
          <option value="deadline">마감 임박</option>
        </select>
      </label>
      <label className="checkbox-label">
        <input type="checkbox" name="includeExcluded" value="true" defaultChecked={values.includeExcluded === "true"} />
        제외 공고 포함
      </label>
      <div className="row filter-actions">
        <button className="button" type="submit">적용</button>
        <Link className="button secondary" href="/jobs">초기화</Link>
      </div>
    </form>
  );
}