import { expect, test, type APIRequestContext } from "@playwright/test";

type LimitMode = "denied" | "unavailable";
type LimitAction = "source_preview" | "source_refresh" | "import_commit" | "account_delete" | "mutation_write";

async function setLimit(request: APIRequestContext, action: LimitAction, mode: LimitMode) {
  const response = await request.post("/api/e2e/rate-limit", { data: { action, mode } });
  expect(response.status()).toBe(204);
}

async function resetLimits(request: APIRequestContext) {
  const response = await request.delete("/api/e2e/rate-limit");
  expect(response.status()).toBe(204);
}

async function exportedBackup(request: APIRequestContext) {
  const response = await request.get("/api/export");
  expect(response.ok()).toBeTruthy();
  return response.json();
}

for (const mode of ["denied", "unavailable"] as const) {
  test(`${mode}: protected operations stop before external calls or stored-record changes`, async ({ request, baseURL }) => {
    const origin = baseURL!;
    const expectedStatus = mode === "denied" ? 429 : 503;
    const expectedCode = mode === "denied" ? "RATE_LIMITED" : "RATE_LIMIT_UNAVAILABLE";

    await resetLimits(request);
    const backupBefore = await exportedBackup(request);

    await setLimit(request, "source_preview", mode);
    const preview = await request.post("/api/jobs/preview", {
      headers: { origin },
      data: { url: "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123456" },
    });
    expect(preview.status()).toBe(expectedStatus);
    expect(await preview.json()).toMatchObject({ code: expectedCode });
    expect(preview.headers()["retry-after"]).toBe(mode === "denied" ? "17" : "60");

    await resetLimits(request);
    const refreshJobId = mode === "denied"
      ? "90000000-0000-4000-8000-000000000013"
      : "90000000-0000-4000-8000-000000000023";
    await setLimit(request, "source_refresh", mode);
    const refresh = await request.post(`/api/jobs/${refreshJobId}/refresh`, {
      data: { sourceId: "source-fixture" },
    });
    expect(refresh.status()).toBe(expectedStatus);
    expect(await refresh.json()).toMatchObject({ code: expectedCode });
    await resetLimits(request);
    const firstAllowedRefresh = await request.post(`/api/jobs/${refreshJobId}/refresh`, {
      data: { sourceId: "source-fixture" },
    });
    expect(firstAllowedRefresh.ok()).toBeTruthy();
    expect(await firstAllowedRefresh.json()).toMatchObject({ cached: false });

    await setLimit(request, "import_commit", mode);
    const changedBackup = structuredClone(backupBefore);
    changedBackup.jobs[0].memo = "rate-limit must preserve the previous backup";
    const imported = await request.post("/api/import/commit", {
      headers: { origin },
      data: changedBackup,
    });
    expect(imported.status()).toBe(expectedStatus);
    expect(await imported.json()).toMatchObject({ code: expectedCode });
    expect(await exportedBackup(request)).toEqual(backupBefore);

    await setLimit(request, "account_delete", mode);
    const deletion = await request.delete("/api/account", {
      headers: { origin },
      data: { confirmation: "회원탈퇴", exportAcknowledged: true },
    });
    expect(deletion.status()).toBe(expectedStatus);
    expect(await deletion.json()).toMatchObject({ code: expectedCode });
    expect(await exportedBackup(request)).toEqual(backupBefore);

    await resetLimits(request);
    const mutationJobId = "00000000-0000-4000-8000-000000000001";
    await request.delete(`/api/e2e/jobs/${mutationJobId}`);
    const jobBefore = await (await request.get(`/api/e2e/jobs/${mutationJobId}`)).json();
    await setLimit(request, "mutation_write", mode);
    const mutation = await request.post(`/api/e2e/jobs/${mutationJobId}`, {
      data: {
        applicationStatus: "applied",
        memo: "this mutation must not be stored",
        nextActionAt: "2026-08-15T00:00:00.000Z",
        deviceId: "operational-safety",
      },
    });
    expect(mutation.status()).toBe(expectedStatus);
    expect(await mutation.json()).toMatchObject({ code: expectedCode });
    const jobAfter = await (await request.get(`/api/e2e/jobs/${mutationJobId}`)).json();
    expect(jobAfter).toEqual(jobBefore);
  });
}

test.afterEach(async ({ request }) => {
  await resetLimits(request);
});