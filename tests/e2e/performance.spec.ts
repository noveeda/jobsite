import { expect, test } from "@playwright/test";

function p95(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}

test("keeps repeated representative 1,000-row catalog queries below two-second p95", async ({ page, baseURL }) => {
  const fixture = await page.context().request.post("/api/e2e/automatic-discovery", { data: { scenario: "performance-1000" } });
  expect(fixture.status()).toBe(204);

  const localOrigin = new URL(baseURL!).origin;
  let externalRequests = 0;
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== localOrigin) {
      externalRequests += 1;
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });

  const measurements: number[] = [];
  for (let iteration = 0; iteration < 7; iteration += 1) {
    const started = performance.now();
    await page.goto("/jobs?q=개발자&region=서울&role=백엔드&employment=permanent&sort=posted&take=30");
    await expect(page.getByText("1000개의 공고")).toBeVisible();
    await expect(page.getByRole("article")).toHaveCount(30);
    if (iteration > 0) measurements.push(performance.now() - started);
  }

  expect(measurements).toHaveLength(6);
  expect(p95(measurements)).toBeLessThan(2_000);
  expect(externalRequests).toBe(0);
});

test("meets search, stored detail, refresh, and sync timing targets", async ({ browser, page, request }) => {
  await page.goto("/jobs");
  let started = performance.now();
  await page.goto("/jobs?q=테스트&includeExcluded=true");
  await expect(page.getByRole("link", { name: /테스트 개발자/ })).toHaveCount(100);
  const searchMs = performance.now() - started;
  expect(searchMs).toBeLessThan(1_000);

  await page.goto("/jobs/00000000-0000-4000-8000-000000000009");
  started = performance.now();
  await page.goto("/jobs/00000000-0000-4000-8000-000000000010");
  await expect(page.getByRole("heading", { name: "백엔드 개발자" })).toBeVisible();
  const detailMs = performance.now() - started;
  expect(detailMs).toBeLessThan(2_000);

  started = performance.now();
  await page.goto("/jobs/00000000-0000-4000-8000-000000000011");
  await expect(page.getByText("원문 정상")).toBeVisible({ timeout: 10_000 });
  const refreshMs = performance.now() - started;
  expect(refreshMs).toBeLessThan(10_000);

  const syncId = "00000000-0000-4000-8000-000000000012";
  await request.delete(`/api/e2e/jobs/${syncId}`);
  const editorContext = await browser.newContext();
  const observerContext = await browser.newContext();
  const editor = await editorContext.newPage();
  const observer = await observerContext.newPage();
  await Promise.all([editor.goto(`/jobs/${syncId}`), observer.goto(`/jobs/${syncId}`)]);
  started = performance.now();
  await editor.getByLabel("메모").fill("성능 동기화 값");
  await editor.getByRole("button", { name: "저장", exact: true }).click();
  await expect(observer.getByLabel("메모")).toHaveValue("성능 동기화 값", { timeout: 10_000 });
  const syncMs = performance.now() - started;
  expect(syncMs).toBeLessThan(10_000);
  await editorContext.close();
  await observerContext.close();

  console.log(`PERF_METRICS search=${Math.round(searchMs)}ms detail=${Math.round(detailMs)}ms refresh=${Math.round(refreshMs)}ms sync=${Math.round(syncMs)}ms`);
});