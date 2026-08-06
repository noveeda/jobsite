"use server";
import { isE2EBypass } from "@/lib/environment";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { markUserFields } from "@/lib/domain/provenance";
import { scoreDuplicate } from "@/lib/domain/duplicates";
import { canonicalizeUrl, recognizeSource } from "@/lib/sources/connector";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { jobInputSchema } from "@/lib/validation/jobs";

const split = (value: FormDataEntryValue | null) => String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
export async function createJob(formData: FormData) {
  const user = await requireUser();
  const input = jobInputSchema.safeParse({
    title: formData.get("title"), companyName: formData.get("companyName"), originalUrl: formData.get("originalUrl"),
    roleName: formData.get("roleName") || null, responsibilities: split(formData.get("responsibilities")), qualifications: split(formData.get("qualifications")), preferredQualifications: split(formData.get("preferredQualifications")),
    careerMinYears: formData.get("careerMinYears") ? Number(formData.get("careerMinYears")) : null, careerMaxYears: formData.get("careerMaxYears") ? Number(formData.get("careerMaxYears")) : null, educationText: formData.get("educationText") || null,
    locations: split(formData.get("locations")), employmentTypes: split(formData.get("employmentTypes")), salaryText: formData.get("salaryText") || null, skills: split(formData.get("skills")), postedAt: formData.get("postedAt") ? new Date(String(formData.get("postedAt"))).toISOString() : null,
    deadlineKind: formData.get("deadlineKind"), deadlineAt: formData.get("deadlineAt") ? new Date(String(formData.get("deadlineAt"))).toISOString() : null,
    memo: formData.get("memo") ?? "",
  });
  if (!input.success) redirect("/jobs/new?error=invalid");
  const supabase = await createClient();
  const rateLimit = await consumeRateLimit(supabase, "mutation_write");
  if (!rateLimit.allowed) {
    throw new Error(rateLimit.unavailable
      ? "현재 저장 요청을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."
      : `저장 요청이 너무 많습니다. ${rateLimit.retryAfter}초 후 다시 시도해 주세요.`);
  }
  if (isE2EBypass()) redirect("/jobs?created=demo");
  const normalizedUrl = canonicalizeUrl(input.data.originalUrl);
  const { data: existing } = await supabase.from("job_sources").select("job_id").eq("normalized_url", normalizedUrl).maybeSingle();
  if (existing) redirect(`/jobs/${existing.job_id}?duplicate=url`);
  const userFields = ["title", "companyName", "roleName", "responsibilities", "qualifications", "preferredQualifications", "careerMinYears", "careerMaxYears", "educationText", "locations", "employmentTypes", "salaryText", "skills", "postedAt", "deadlineAt", "memo"];
  const { data: job, error } = await supabase.from("jobs").insert({ user_id: user.id, title: input.data.title, company_name: input.data.companyName, role_name: input.data.roleName, responsibilities: input.data.responsibilities, qualifications: input.data.qualifications, preferred_qualifications: input.data.preferredQualifications, career_min_years: input.data.careerMinYears, career_max_years: input.data.careerMaxYears, education_text: input.data.educationText, locations: input.data.locations, employment_types: input.data.employmentTypes, salary_text: input.data.salaryText, skills: input.data.skills, posted_at: input.data.postedAt, deadline_kind: input.data.deadlineKind, deadline_at: input.data.deadlineAt, memo: input.data.memo, field_provenance: markUserFields({}, userFields) }).select("id").single();
  if (error || !job) redirect("/jobs/new?error=save");
  const reference = recognizeSource(input.data.originalUrl);
  const { error: sourceError } = await supabase.from("job_sources").insert({ user_id: user.id, job_id: job.id, provider: reference.provider, connector_mode: reference.connectorMode, external_id: reference.externalId, original_url: reference.originalUrl, normalized_url: normalizedUrl });
if (sourceError) { await supabase.from("jobs").delete().eq("id", job.id); redirect("/jobs/new?error=save"); }
  const { data: candidates } = await supabase.from("jobs").select("id,title,company_name,role_name,locations,posted_at").eq("user_id", user.id).neq("id", job.id).limit(200);
  for (const candidate of candidates ?? []) {
    const match = scoreDuplicate({ companyName: input.data.companyName, title: input.data.title, roleName: input.data.roleName, locations: input.data.locations, postedAt: input.data.postedAt }, { companyName: candidate.company_name, title: candidate.title, roleName: candidate.role_name, locations: candidate.locations, postedAt: candidate.posted_at });
    if (match.score >= 0.7) {
      const [leftJobId, rightJobId] = [job.id, candidate.id].sort();
      await supabase.from("duplicate_pairs").upsert({ user_id: user.id, left_job_id: leftJobId, right_job_id: rightJobId, score: match.score, reasons: match.reasons }, { onConflict: "user_id,left_job_id,right_job_id", ignoreDuplicates: true });
    }
  }
  redirect(`/jobs/${job.id}`);
}
