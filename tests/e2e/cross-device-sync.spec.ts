import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const jobUrl = "/jobs/00000000-0000-4000-8000-000000000002";

test.beforeEach(async ({ request }) => {
  await request.delete("/api/e2e/jobs/00000000-0000-4000-8000-000000000002");
});

test("scoped refetch converges two contexts within ten seconds and last server commit wins", async ({ browser }) => {
  const a = await browser.newContext();
  const b = await browser.newContext();
  const pa = await a.newPage();
  const pb = await b.newPage();
  await pa.goto(jobUrl);
  await pb.goto(jobUrl);
  const deviceA = await pa.locator("input[name=deviceId]").inputValue();
  const deviceB = await pb.locator("input[name=deviceId]").inputValue();
  expect(deviceA).not.toBe(deviceB);

  await pa.getByLabel("메모").fill("기기 A 값");
  await pa.getByRole("button", { name: "저장", exact: true }).click();
  await expect(pb.getByLabel("메모")).toHaveValue("기기 A 값", { timeout: 10_000 });

  await pb.getByLabel("메모").fill("기기 B 최신 값");
  await pb.getByRole("button", { name: "저장", exact: true }).click();
  await expect(pa.getByLabel("메모")).toHaveValue("기기 B 최신 값", { timeout: 10_000 });
  await expect(pa.getByText(deviceA)).toBeVisible();
  await expect(pa.getByText("기기 A 값")).toBeVisible();

  await a.close();
  await b.close();
});

test("offline changes never reach the server before explicit retry", async ({ browser }) => {
  const offlineContext = await browser.newContext();
  const observerContext = await browser.newContext();
  const editor = await offlineContext.newPage();
  const observer = await observerContext.newPage();
  await editor.goto(jobUrl);
  await observer.goto(jobUrl);
  await editor.getByLabel("메모").fill("아직 서버에 없음");
  await offlineContext.setOffline(true);
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(observer.getByLabel("메모")).toHaveValue("");
  await offlineContext.setOffline(false);
  await editor.getByRole("button", { name: "다시 시도" }).click();
  await expect(observer.getByLabel("메모")).toHaveValue("아직 서버에 없음", { timeout: 10_000 });
  await offlineContext.close();
  await observerContext.close();
});
const LOCAL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const LOCAL_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

test("actual Supabase Realtime is account scoped and preserves the overwritten value and device", async () => {
  const email = `realtime-${crypto.randomUUID()}@example.com`;
  const password = "local-test-password";
  const authClient = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } });
  const { data: signup, error: signupError } = await authClient.auth.signUp({ email, password });
  expect(signupError).toBeNull();
  expect(signup.session).toBeTruthy();
  expect(signup.user).toBeTruthy();

  const a = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } });
  const b = createClient(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } });
  await a.auth.setSession(signup.session!);
  await b.auth.setSession(signup.session!);
  await b.realtime.setAuth(signup.session!.access_token);
  const userId = signup.user!.id;
  const jobId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();

  const { error: insertError } = await a.from("jobs").insert({
    id: jobId,
    user_id: userId,
    title: "Realtime test",
    company_name: "Test company",
  });
  expect(insertError).toBeNull();

  let ready!: () => void;
  let changed!: () => void;
  const subscribed = new Promise<void>((resolve) => { ready = resolve; });
  const received = new Promise<void>((resolve) => { changed = resolve; });
  const channel = b
    .channel(`actual-realtime-${jobId}`)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jobs", filter: `user_id=eq.${userId}` }, (payload) => {
      if (payload.new.id === jobId) changed();
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") ready();
    });

  await expect(subscribed).resolves.toBeUndefined();
  await new Promise((resolve) => setTimeout(resolve, 250));
  const { error: updateError } = await a.rpc("update_job_tracking", {
    target_job_id: jobId,
    target_status: "applied",
    target_memo: "latest server commit",
    target_next_action: null,
    target_device: deviceId,
  });
  expect(updateError).toBeNull();
  await expect(Promise.race([
    received,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Realtime convergence exceeded 10 seconds")), 10_000)),
  ])).resolves.toBeUndefined();

  const [{ data: current }, { data: history }] = await Promise.all([
    b.from("jobs").select("memo,application_status").eq("id", jobId).single(),
    b.from("job_revisions").select("snapshot,device_id").eq("job_id", jobId).order("changed_at", { ascending: false }),
  ]);
  expect(current).toMatchObject({ memo: "latest server commit", application_status: "applied" });
  expect(history?.[0].snapshot).toMatchObject({ memo: "" });
  expect(history?.[0].device_id).toBe(deviceId);

  await b.removeChannel(channel);
  await a.from("jobs").delete().eq("id", jobId);
  await Promise.all([a.auth.signOut(), b.auth.signOut(), authClient.auth.signOut()]);
});