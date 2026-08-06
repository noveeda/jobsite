import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { backupSchemaV1, type BackupV1 } from "@/lib/validation/backup";

const forbidden = /^(?:user_?id|search_document|token|access_?token|refresh_?token|secret|password|credential|api_?key|raw_?body|full_?body)$/i;

function sanitizeObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !forbidden.test(key))
      .map(([key, child]) => {
        if (Array.isArray(child)) return [key, child.map((item) => typeof item === "object" ? sanitizeObject(item) : item)];
        if (child && typeof child === "object") return [key, sanitizeObject(child)];
        return [key, child];
      }),
  );
}

export async function createPortableBackup(client: SupabaseClient<Database>, userId: string): Promise<BackupV1> {
  const [jobsResult, sourcesResult, pairsResult, revisionsResult] = await Promise.all([
    client.from("jobs").select("*").eq("user_id", userId).limit(10000),
    client.from("job_sources").select("*").eq("user_id", userId).limit(20000),
    client.from("duplicate_pairs").select("*").eq("user_id", userId).limit(20000),
    client.from("job_revisions").select("*").eq("user_id", userId).limit(100000),
  ]);
  const error = jobsResult.error ?? sourcesResult.error ?? pairsResult.error ?? revisionsResult.error;
  if (error) throw new Error("백업 데이터를 읽지 못했습니다.");

  const backup = {
    schemaVersion: 1 as const,
    generatedAt: new Date().toISOString(),
    jobs: (jobsResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      companyName: row.company_name,
      roleName: row.role_name,
      summary: row.summary,
      responsibilities: row.responsibilities,
      qualifications: row.qualifications,
      preferredQualifications: row.preferred_qualifications,
      careerMinYears: row.career_min_years,
      careerMaxYears: row.career_max_years,
      educationText: row.education_text,
      employmentTypes: row.employment_types,
      locations: row.locations,
      salaryText: row.salary_text,
      skills: row.skills,
      postedAt: row.posted_at,
      deadlineAt: row.deadline_at,
      deadlineKind: row.deadline_kind,
      applicationStatus: row.application_status,
      memo: row.memo,
      nextActionAt: row.next_action_at,
      duplicateGroupId: row.duplicate_group_id,
      fieldProvenance: sanitizeObject(row.field_provenance),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    sources: (sourcesResult.data ?? []).map((row) => ({
      id: row.id,
      jobId: row.job_id,
      provider: row.provider,
      connectorMode: row.connector_mode,
      externalId: row.external_id,
      originalUrl: row.original_url,
      status: row.status,
      firstObservedAt: row.first_observed_at,
      lastCheckedAt: row.last_checked_at,
      lastSuccessAt: row.last_success_at,
    })),
    duplicatePairs: (pairsResult.data ?? []).map((row) => ({
      id: row.id,
      leftJobId: row.left_job_id,
      rightJobId: row.right_job_id,
      score: Number(row.score),
      reasons: sanitizeObject(row.reasons),
      decision: row.decision,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
    })),
    revisions: (revisionsResult.data ?? []).map((row) => ({
      id: row.id,
      jobId: row.job_id,
      snapshot: sanitizeObject(row.snapshot),
      changedAt: row.changed_at,
      deviceId: row.device_id,
      changeKind: row.change_kind as "update" | "delete" | "restore" | "import",
      restoredFromRevisionId: row.restored_from_revision_id,
    })),
  };
  return backupSchemaV1.parse(backup);
}