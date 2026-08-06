import { expect, test } from "@playwright/test";

test("keeps policies public and requires both consents before entering jobs", async ({ page }) => {
  for (const [path, heading] of [
    ["/terms", "이용약관"],
    ["/privacy", "개인정보 처리방침"],
    ["/sources", "외부 출처 안내"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await page.goto("/consent");
  const terms = page.getByRole("checkbox", { name: "이용약관에 동의합니다. (필수)" });
  const privacy = page.getByRole("checkbox", { name: "개인정보 처리방침에 동의합니다. (필수)" });

  await expect(terms).not.toBeChecked();
  await expect(privacy).not.toBeChecked();
  await expect(terms).toHaveAttribute("required", "");
  await expect(privacy).toHaveAttribute("required", "");
  await expect(page.getByRole("link", { name: "이용약관 전문 보기" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "개인정보 처리방침 전문 보기" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "외부 출처 안내" })).toHaveAttribute("href", "/sources");

  await terms.check();
  await privacy.check();
  await page.getByRole("button", { name: "동의하고 시작하기" }).click();

  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole("heading", { name: "채용공고" })).toBeVisible();
});
