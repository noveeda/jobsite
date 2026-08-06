import type { SupabaseClient } from "@supabase/supabase-js";

export function subscribeToJobs(client: SupabaseClient, userId: string, onChange: () => void) {
  const channel = client
    .channel(`jobs:${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}

export function subscribeToJobDetail(client: SupabaseClient, userId: string, jobId: string, onChange: () => void) {
  const channel = client
    .channel(`job-detail:${userId}:${jobId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "jobs", filter: `id=eq.${jobId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "job_revisions", filter: `user_id=eq.${userId}` }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}