import { expect, test, type APIRequestContext } from "@playwright/test";

async function useScenario(request: APIRequestContext, scenario: string) {
  const response = await request.post("/api/e2e/consent", { data: { scenario } });
  expect(response.ok()).toBe(true);
}

test.afterEach(async ({ request }) => {
  await useScenario(request, "accepted");
});

test("keeps policies public, gates the dashboard, and persists consent", async ({ page, request }) => {
  for (const [path, heading] of [
    ["/terms", "이용약관"],
    ["/privacy", "개인정보 처리방침"],
    ["/sources", "외부 출처 안내"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }

  await useScenario(request, "missing");
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/consent$/);

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
  await page.reload();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole("heading", { name: "채용공고" })).toBeVisible();
});

test("keeps the consent gate closed after a failed write and allows retry", async ({ page, request }) => {
  await useScenario(request, "write_failure");
  await page.goto("/consent");
  await page.getByRole("checkbox", { name: "이용약관에 동의합니다. (필수)" }).check();
  await page.getByRole("checkbox", { name: "개인정보 처리방침에 동의합니다. (필수)" }).check();
  await page.getByRole("button", { name: "동의하고 시작하기" }).click();

  await expect(page).toHaveURL(/\/consent$/);
  await expect(page.getByText(/동의를 저장하지 못했습니다/)).toBeVisible();
  await page.getByRole("checkbox", { name: "이용약관에 동의합니다. (필수)" }).check();
  await page.getByRole("checkbox", { name: "개인정보 처리방침에 동의합니다. (필수)" }).check();
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
});

test("requires consent again when the current policy version changes", async ({ page, request }) => {
  await useScenario(request, "version_changed");
  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/consent$/);
  await page.getByRole("checkbox", { name: "이용약관에 동의합니다. (필수)" }).check();
  await page.getByRole("checkbox", { name: "개인정보 처리방침에 동의합니다. (필수)" }).check();
  await page.getByRole("button", { name: "동의하고 시작하기" }).click();
  await expect(page).toHaveURL(/\/jobs$/);
});