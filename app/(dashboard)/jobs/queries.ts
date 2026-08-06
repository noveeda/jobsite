import { isE2EBypass } from "@/lib/environment";
import { createClient } from "@/lib/supabase/server";
import type { AttributionConnectorMode, AttributionProvider } from "@/components/provider-attribution";

export type JobListItem = {
  id: string;
  title: string;
  companyName: string;
  roleName: string | null;
  locations: string[];
  employmentTypes: string[];
  deadlineAt: string | null;
  deadlineKind: "fixed" | "rolling" | "until_hired" | "unknown";
  applicationStatus: string;
  createdAt: string;
  postedAt: string | null;
  sources: {
    provider: AttributionProvider;
    connectorMode: AttributionConnectorMode;
    originalUrl: string;
    firstObservedAt: string;
    lastSuccessAt: string | null;
  }[];
};

export type JobFilters = {
  q?: string;
  region?: string;
  status?: string;
  source?: string;
  deadline?: string;
  sort?: string;
  includeExcluded?: string;
};

const demoJobs = (): JobListItem[] => Array.from({ length: 100 }, (_, index) => {
  const observedAt = new Date(Date.now() - index * 86_400_000).toISOString();
  const isApprovedSaramin = index % 3 === 0;
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `테스트 개발자 ${index}`,
    companyName: `예시 회사 ${index}`,
    roleName: index % 2 ? "프론트엔드" : "백엔드",
    locations: [index % 2 ? "서울" : "부산"],
    employmentTypes: ["정규직"],
    deadlineAt: index % 3 === 0 ? new Date(Date.now() + index * 86_400_000).toISOString() : null,
    deadlineKind: index % 3 === 0 ? "fixed" : "unknown",
    applicationStatus: index === 99 ? "excluded" : "unreviewed",
    createdAt: new Date().toISOString(),
    postedAt: null,
    sources: [{
      provider: isApprovedSaramin ? "saramin" : "other",
      connectorMode: isApprovedSaramin ? "approved_api" : "manual",
      originalUrl: isApprovedSaramin
        ? `https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=${index}`
        : `https://example.com/jobs/${index}`,
      firstObservedAt: observedAt,
      lastSuccessAt: isApprovedSaramin ? observedAt : null,
    }],
  };
});

export async function getJobs(filters: JobFilters, userId: string): Promise<JobListItem[]> {
  let rows: JobListItem[];
  if (isE2EBypass()) {
    rows = demoJobs();
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("jobs")
      .select("id,title,company_name,role_name,locations,employment_types,deadline_at,deadline_kind,application_status,created_at,posted_at,job_sources(provider,connector_mode,original_url,first_observed_at,last_success_at)")
      .eq("user_id", userId)
      .limit(1000);
    if (error) throw new Error("공고 목록을 불러오지 못했습니다.");
    rows = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      companyName: row.company_name,
      roleName: row.role_name,
      locations: row.locations,
      employmentTypes: row.employment_types,
      deadlineAt: row.deadline_at,
      deadlineKind: row.deadline_kind,
      applicationStatus: row.application_status,
      createdAt: row.created_at,
      postedAt: row.posted_at,
      sources: row.job_sources.map((source) => ({
        provider: source.provider,
        connectorMode: source.connector_mode,
        originalUrl: source.original_url,
        firstObservedAt: source.first_observed_at,
        lastSuccessAt: source.last_success_at,
      })),
    }));
  }

  const q = filters.q?.toLocaleLowerCase("ko");
  rows = rows.filter((job) =>
    (filters.includeExcluded === "true" || job.applicationStatus !== "excluded")
    && (!q || `${job.companyName} ${job.title} ${job.roleName ?? ""}`.toLocaleLowerCase("ko").includes(q))
    && (!filters.region || job.locations.includes(filters.region))
    && (!filters.status || job.applicationStatus === filters.status)
    && (!filters.source || job.sources.some((source) => source.provider === filters.source))
  );
  const sort = filters.sort ?? "created";
  rows.sort((a, b) => sort === "posted"
    ? String(b.postedAt ?? "").localeCompare(String(a.postedAt ?? ""))
    : sort === "deadline"
      ? String(a.deadlineAt ?? "9999").localeCompare(String(b.deadlineAt ?? "9999"))
      : b.createdAt.localeCompare(a.createdAt));
  return rows;
}