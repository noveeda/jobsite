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
export function FeedFilters({ values }: { values: import("@/lib/validation/feed").FeedQuery }) {
  return (
    <form className="card filter-grid">
      <label>검색<input name="q" defaultValue={values.q} placeholder="회사, 제목, 직무" /></label>
      <label>지역<input name="region" defaultValue={values.region} /></label>
      <label>직무<input name="role" defaultValue={values.role} /></label>
      <label>경력<input name="career" defaultValue={values.career} placeholder="entry, 3-5, 5+" /></label>
      <label>고용 형태<input name="employment" defaultValue={values.employment} /></label>
      <label>마감<select name="deadline" defaultValue={values.deadline ?? ""}><option value="">전체</option><option value="active">진행 중</option><option value="closingSoon">마감 임박</option><option value="unknown">미확인</option></select></label>
      <label>출처<select name="source" defaultValue={values.source ?? ""}><option value="">전체</option><option value="fixture-page">Fixture Page</option><option value="fixture-token">Fixture Token</option><option value="saramin">사람인</option><option value="jobkorea">잡코리아</option></select></label>
      <label>정렬<select name="sort" defaultValue={values.sort}><option value="posted">최신순</option><option value="deadline">기한 임박순</option></select></label>
      <div className="row filter-actions"><button className="button" type="submit">적용</button><Link className="button secondary" href="/jobs">전체 초기화</Link></div>
    </form>
  );
}
const feedFilterLabels = {
  q: "검색",
  region: "지역",
  role: "직무",
  career: "경력",
  employment: "고용 형태",
  deadline: "마감",
  source: "출처",
  sort: "정렬",
  includeExcluded: "제외 공고 포함",
  saved: "저장 공고",
} as const;

type AppliedFeedFilterKey = keyof typeof feedFilterLabels;

function feedFilterParams(values: import("@/lib/validation/feed").FeedQuery, omitted?: AppliedFeedFilterKey) {
  const params = new URLSearchParams();
  const textKeys = ["q", "region", "role", "career", "employment", "deadline", "source"] as const;
  for (const key of textKeys) {
    const value = values[key];
    if (key !== omitted && value) params.set(key, value);
  }
  if (omitted !== "sort" && values.sort === "deadline") params.set("sort", values.sort);
  if (omitted !== "includeExcluded" && values.includeExcluded) params.set("includeExcluded", "true");
  if (omitted !== "saved" && values.saved) params.set("saved", "true");
  return params;
}

export function appliedFeedFilters(values: import("@/lib/validation/feed").FeedQuery) {
  const active: { key: AppliedFeedFilterKey; value: string }[] = [];
  const textKeys = ["q", "region", "role", "career", "employment", "deadline", "source"] as const;
  for (const key of textKeys) {
    const value = values[key];
    if (value) active.push({ key, value });
  }
  if (values.sort === "deadline") active.push({ key: "sort", value: "기한 임박순" });
  if (values.includeExcluded) active.push({ key: "includeExcluded", value: "포함" });
  if (values.saved) active.push({ key: "saved", value: "저장됨" });

  return active.map(({ key, value }) => {
    const params = feedFilterParams(values, key);
    return {
      key,
      label: feedFilterLabels[key],
      value,
      href: params.size ? `/jobs?${params}` : "/jobs",
    };
  });
}

export function AppliedFeedFilters({ values }: { values: import("@/lib/validation/feed").FeedQuery }) {
  const filters = appliedFeedFilters(values);
  if (filters.length === 0) return null;
  return (
    <nav className="filter-chips" aria-label="적용된 필터">
      {filters.map((filter) => (
        <Link
          className="filter-chip touch-target"
          href={filter.href}
          key={filter.key}
          aria-label={`${filter.value} 조건 제거`}
        >
          {filter.label}: {filter.value} ×
        </Link>
      ))}
    </nav>
  );
}
