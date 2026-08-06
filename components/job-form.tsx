"use client";
import { useState } from "react";
import { createJob } from "@/app/(dashboard)/jobs/actions";

type Preview = { draft?: null | { title?: string; companyName?: string; locations?: string[] }; warnings?: string[]; message?: string };
export function JobForm() {
  const [url, setUrl] = useState(""); const [preview, setPreview] = useState<Preview | null>(null); const [loading, setLoading] = useState(false);
  async function loadPreview() { setLoading(true); try { const response = await fetch("/api/jobs/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) }); const result = await response.json() as Preview; setPreview(response.ok ? result : { warnings: ["SOURCE_MANUAL_ONLY"], message: result.message }); } finally { setLoading(false); } }
  return <form action={createJob} className="card stack">
    <div className="row"><label style={{flex:1}}>원문 URL<input name="originalUrl" type="url" required value={url} onChange={(event)=>setUrl(event.target.value)} placeholder="https://..." /></label><button className="button secondary" type="button" onClick={loadPreview} disabled={loading}>{loading ? "확인 중" : "미리보기"}</button></div>
    {preview?.warnings?.includes("SOURCE_MANUAL_ONLY") && <p role="status" className="muted">이 출처는 자동 조회하지 않습니다. URL을 보관하고 직접 입력해 주세요.</p>}
    <div className="form-grid"><label>회사명<input name="companyName" required defaultValue={preview?.draft?.companyName} /></label><label>공고 제목<input name="title" required defaultValue={preview?.draft?.title} /></label><label>직무<input name="roleName" /></label><label>주요 업무<input name="responsibilities" placeholder="쉼표로 구분" /></label><label>자격요건<input name="qualifications" placeholder="쉼표로 구분" /></label><label>우대사항<input name="preferredQualifications" placeholder="쉼표로 구분" /></label><label>최소 경력<input name="careerMinYears" type="number" min="0" max="80" /></label><label>최대 경력<input name="careerMaxYears" type="number" min="0" max="80" /></label><label>학력<input name="educationText" /></label><label>근무지역<input name="locations" defaultValue={preview?.draft?.locations?.join(", ")} placeholder="서울, 부산" /></label><label>고용형태<input name="employmentTypes" placeholder="정규직" /></label><label>급여<input name="salaryText" /></label><label>기술 키워드<input name="skills" placeholder="TypeScript, PostgreSQL" /></label><label>게시일<input name="postedAt" type="datetime-local" /></label><label>마감 유형<select name="deadlineKind" defaultValue="unknown"><option value="unknown">미정</option><option value="fixed">마감일 지정</option><option value="rolling">상시채용</option><option value="until_hired">채용 시 마감</option></select></label><label>마감일<input name="deadlineAt" type="datetime-local" /></label></div>
    <label>메모<textarea name="memo" /></label><p className="muted">저장 정보는 원문을 대체하지 않습니다. 지원 전 원문을 최종 확인하세요.</p><button className="button" type="submit">공고 저장</button>
  </form>;
}
