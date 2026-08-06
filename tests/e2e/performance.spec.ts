import { expect, test } from "@playwright/test";

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