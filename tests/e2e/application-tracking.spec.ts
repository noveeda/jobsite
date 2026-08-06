import { expect, test } from "@playwright/test";

const jobUrl = "/jobs/00000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ request }) => {
  await request.delete("/api/e2e/jobs/00000000-0000-4000-8000-000000000001");
});

test("persists every status correction, memo, and next action", async ({ page }) => {
  await page.goto(jobUrl);
  for (const status of ["interested", "planned", "applied", "interviewing", "accepted", "rejected", "excluded", "unreviewed"]) {
    await page.getByLabel("지원 상태").selectOption(status);
    await page.getByLabel("메모").fill(`memo-${status}`);
    await page.getByLabel("다음 행동").fill("2026-08-08T09:30");
    await page.getByRole("button", { name: "저장", exact: true }).click();
    await expect(page.getByText("저장했습니다.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("지원 상태")).toHaveValue(status);
    await expect(page.getByLabel("메모")).toHaveValue(`memo-${status}`);
    await expect(page.getByLabel("다음 행동")).toHaveValue("2026-08-08T09:30");
  }
});

test("shows excluded jobs only when explicitly requested", async ({ page }) => {
  await page.goto(jobUrl);
  await page.getByLabel("지원 상태").selectOption("excluded");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await page.goto("/jobs");
  await expect(page.getByText("테스트 개발자 99")).toHaveCount(0);
  await page.getByLabel("제외 공고 포함").check();
  await page.getByRole("button", { name: "적용" }).click();
  await expect(page.getByText("테스트 개발자 99")).toBeVisible();
});

test("restores a prior revision and keeps the replaced value", async ({ page }) => {
  await page.goto(jobUrl);
  const committedMemo = async () => {
    const response = await page.request.get("/api/e2e/jobs/00000000-0000-4000-8000-000000000001");
    return (await response.json()).memo as string;
  };
  await page.getByLabel("메모").fill("첫 번째 값");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect.poll(committedMemo).toBe("첫 번째 값");
  await page.getByLabel("메모").fill("두 번째 값");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect.poll(committedMemo).toBe("두 번째 값");
  await expect(page.getByText("첫 번째 값")).toBeVisible();
  await page.getByRole("button", { name: "이 값으로 복구" }).first().click();
  await page.getByRole("button", { name: "복구 확인" }).click();
  await expect(page.getByLabel("메모")).toHaveValue("첫 번째 값");
  await expect(page.getByText("두 번째 값")).toBeVisible();
});

test("offline save requires an explicit retry and logout returns to login", async ({ page, context }) => {
  await page.goto(jobUrl);
  await page.getByLabel("메모").fill("오프라인 값");
  await context.setOffline(true);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장하지 못했습니다. 연결 후 다시 시도해 주세요.")).toBeVisible();
  await context.setOffline(false);
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByText("저장했습니다.")).toBeVisible();
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login/);
});
