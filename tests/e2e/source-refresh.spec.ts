import { expect, test } from "@playwright/test";

test("renders stored detail first, then visible progress and success within ten seconds", async ({ page }) => {
  const started = Date.now();
  await page.goto("/jobs/00000000-0000-4000-8000-000000000003");
  await expect(page.getByRole("heading", { name: "백엔드 개발자" })).toBeVisible({ timeout: 2_000 });
  await expect(page.getByRole("status")).toContainText("확인 중");
  await expect(page.getByText("원문 정상")).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - started).toBeLessThan(10_000);
});

test("keeps stored content and last success visible when refresh fails", async ({ page }) => {
  await page.goto("/jobs/00000000-0000-4000-8000-000000000004");
  await expect(page.getByRole("heading", { name: "백엔드 개발자" })).toBeVisible({ timeout: 2_000 });
  await expect(page.getByText("원문 확인 실패")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/마지막 성공/)).toBeVisible();
  await expect(page.getByRole("link", { name: /원문 확인/ })).toHaveAttribute("href", "https://example.com/job/1");
});

test("shows unsupported without a provider call and reuses a 30-minute cache", async ({ page }) => {
  await page.goto("/jobs/00000000-0000-4000-8000-000000000005");
  await expect(page.getByText("자동 확인 미지원")).toBeVisible({ timeout: 10_000 });

  await page.goto("/jobs/00000000-0000-4000-8000-000000000006");
  await expect(page.getByText("원문 정상")).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByText(/캐시 사용/)).toBeVisible({ timeout: 10_000 });
});