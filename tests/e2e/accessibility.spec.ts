import { expect, test } from "@playwright/test";

test("supports keyboard focus, accessible names, and announced errors", async ({ page }) => {
  await page.goto("/login");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Google로 계속하기" })).toBeFocused();

  await page.goto("/settings/data");
  await expect(page.getByLabel("백업 JSON 파일")).toBeVisible();
  await expect(page.getByRole("link", { name: "JSON 내보내기" })).toBeVisible();
  await page.getByLabel("백업 JSON 파일").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.getByText(/유효하지 않은 백업입니다/)).toBeVisible();
});

test("keeps primary workflows usable at mobile width with labelled controls", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/jobs");
  await expect(page.getByRole("heading", { name: "채용공고" })).toBeVisible();
  await expect(page.getByLabel("검색")).toBeVisible();
  await expect(page.getByLabel("지원 상태")).toBeVisible();
  await expect(page.getByLabel("제외 공고 포함")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  await page.goto("/jobs/00000000-0000-4000-8000-000000000013");
  await expect(page.getByLabel("메모")).toBeVisible();
  await expect(page.getByLabel("다음 행동")).toBeVisible();
  await expect(page.getByRole("status").first()).toBeVisible();
  const detailOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(detailOverflow).toBeLessThanOrEqual(1);
});