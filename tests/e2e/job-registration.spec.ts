import { expect, test } from "@playwright/test";
test("manual URL registration fallback", async ({ page }) => {
  await page.goto("/jobs/new");
  await page.getByLabel("원문 URL").fill("https://www.jobplanet.co.kr/job/1");
  await page.getByRole("button", { name: "미리보기" }).click();
  await expect(page.getByText("자동 조회하지 않습니다")).toBeVisible();
  await expect(page.getByRole("link", { name: "채용공고 허브" })).toBeVisible();
});
