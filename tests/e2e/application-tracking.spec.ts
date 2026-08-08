import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

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

const catalogJobId = "10000000-0000-4000-8000-000000000001";
const catalogJobUrl = `/jobs/${catalogJobId}`;
const e2eUserCookie = "jobhub-e2e-user-id";
const discoveryScenarioCookie = "jobhub-discovery-scenario";

async function useCatalogScenario(page: Page, scenario: string) {
  const response = await page.request.post("/api/e2e/automatic-discovery", {
    data: { scenario },
  });
  expect(response.status(), `automatic discovery scenario '${scenario}' must be available`).toBe(204);
}

async function useTestUser(context: BrowserContext, baseURL: string, userId: string) {
  await context.addCookies([{ name: e2eUserCookie, value: userId, url: new URL(baseURL).origin }]);
}

async function saveCatalogJob(page: Page) {
  await page.goto(catalogJobUrl);
  await page.getByRole("button", { name: "공고 저장", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("저장했습니다");
}

test.describe("automatic catalog personal state", () => {
  test.beforeEach(async ({ page, context, baseURL }) => {
    await useTestUser(context, baseURL!, randomUUID());
    await useCatalogScenario(page, "healthy");

    const localOrigin = new URL(baseURL!).origin;
    await page.route("**/*", (route) => (
      new URL(route.request().url()).origin === localOrigin
        ? route.continue()
        : route.abort("blockedbyclient")
    ));
  });

  test("saves a catalog job and shows only saved jobs", async ({ page }) => {
    await saveCatalogJob(page);

    await page.goto("/jobs?source=fixture-page&saved=true");
    await expect(page.locator(`#job-${catalogJobId}`)).toBeVisible();
    await expect(page.getByLabel("저장 공고만")).toBeChecked();
    await expect(page.getByRole("article")).toHaveCount(1);
  });

  test("hides an excluded job and restores it from the excluded view", async ({ page }) => {
    await page.goto(catalogJobUrl);
    await page.getByRole("button", { name: "공고 제외", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("제외했습니다");

    await page.goto("/jobs?source=fixture-page");
    await expect(page.locator(`#job-${catalogJobId}`)).toHaveCount(0);

    await page.goto("/jobs?source=fixture-page&includeExcluded=true&take=60");
    const excludedCard = page.locator(`#job-${catalogJobId}`);
    await expect(excludedCard).toBeVisible();
    await excludedCard.getByRole("button", { name: "플랫폼 개발자 제외 취소", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("제외를 취소했습니다");

    await page.goto("/jobs?source=fixture-page&take=60");
    await expect(page.locator(`#job-${catalogJobId}`)).toBeVisible();
  });

  test("names list exclusion controls with the job title without changing detail controls", async ({ page }) => {
    await page.goto("/jobs?source=fixture-page&take=60");
    const catalogCard = page.locator(`#job-${catalogJobId}`);

    await expect(catalogCard.getByRole("button", { name: "플랫폼 개발자 공고 제외", exact: true })).toBeVisible();

    await page.goto(catalogJobUrl);
    await expect(page.getByRole("button", { name: "공고 제외", exact: true })).toBeVisible();
  });

  test("persists application status and memo after reload", async ({ page }) => {
    await page.goto(catalogJobUrl);
    await page.getByLabel("지원 상태").selectOption("interviewing");
    await page.getByLabel("메모").fill("기술 면접 질문 정리");
    await page.getByRole("button", { name: "지원 정보 저장", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("저장했습니다");

    await page.reload();
    await expect(page.getByLabel("지원 상태")).toHaveValue("interviewing");
    await expect(page.getByLabel("메모")).toHaveValue("기술 면접 질문 정리");
  });

  test("keeps failed changes editable and succeeds only after retry", async ({ page, context }) => {
    await page.goto(catalogJobUrl);
    await page.getByLabel("지원 상태").selectOption("applied");
    await page.getByLabel("메모").fill("재시도할 지원 기록");

    await context.setOffline(true);
    await page.getByRole("button", { name: "지원 정보 저장", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "저장하지 못했습니다" })).toBeVisible();
    await expect(page.getByLabel("지원 상태")).toHaveValue("applied");
    await expect(page.getByLabel("메모")).toHaveValue("재시도할 지원 기록");

    await context.setOffline(false);
    await page.getByRole("button", { name: "다시 시도", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("저장했습니다");
    await page.reload();
    await expect(page.getByLabel("지원 상태")).toHaveValue("applied");
    await expect(page.getByLabel("메모")).toHaveValue("재시도할 지원 기록");
  });

  test("isolates personal state between E2E users", async ({ page, context, baseURL }) => {
    const firstUser = randomUUID();
    const secondUser = randomUUID();

    await useTestUser(context, baseURL!, firstUser);
    await page.goto(catalogJobUrl);
    await page.getByLabel("메모").fill("첫 사용자만 보는 메모");
    await page.getByRole("button", { name: "지원 정보 저장", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("저장했습니다");

    await useTestUser(context, baseURL!, secondUser);
    await page.goto(catalogJobUrl);
    await expect(page.getByLabel("메모")).toHaveValue("");
    await expect(page.getByRole("button", { name: "공고 저장", exact: true })).toBeVisible();

    await useTestUser(context, baseURL!, firstUser);
    await page.goto(catalogJobUrl);
    await expect(page.getByLabel("메모")).toHaveValue("첫 사용자만 보는 메모");
  });

  test("preserves saved state when a posting closes or its source is withdrawn", async ({ page, context, baseURL }) => {
    await saveCatalogJob(page);
    await page.getByLabel("지원 상태").selectOption("planned");
    await page.getByLabel("메모").fill("종료 후에도 보존할 메모");
    await page.getByRole("button", { name: "지원 정보 저장", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("저장했습니다");

    for (const [scenario, lifecycleLabel] of [
      ["closed-saved", "종료된 공고"],
      ["withdrawn-saved", "출처 제공 중단"],
    ] as const) {
      await context.addCookies([{
        name: discoveryScenarioCookie,
        value: scenario,
        url: new URL(baseURL!).origin,
      }]);
      await page.goto(`/jobs?source=fixture-page&saved=true&includeExcluded=true`);
      const preservedCard = page.locator(`#job-${catalogJobId}`);
      await expect(preservedCard).toBeVisible();
      await expect(preservedCard).toContainText(lifecycleLabel);
      await preservedCard.getByRole("link").first().click();
      await expect(page.getByLabel("지원 상태")).toHaveValue("planned");
      await expect(page.getByLabel("메모")).toHaveValue("종료 후에도 보존할 메모");
    }
  });

  test.describe("local next-action time", () => {
    test.use({ timezoneId: "America/New_York" });

    test("round-trips winter and daylight-saving timestamps", async ({ page, context }) => {
      await page.goto(catalogJobUrl);

      for (const [localTime, utcTime] of [
        ["2026-01-15T09:30", "2026-01-15T14:30:00.000Z"],
        ["2026-07-15T09:30", "2026-07-15T13:30:00.000Z"],
      ] as const) {
        await page.getByLabel("다음 행동").fill(localTime);
        await page.getByRole("button", { name: "지원 정보 저장", exact: true }).click();
        await expect(page.getByRole("status")).toContainText("저장했습니다");
        const stateCookie = (await context.cookies()).find(({ name }) => name === "jobhub-e2e-personal-states");
        const storedStates = JSON.parse(decodeURIComponent(stateCookie!.value)) as Record<string, { nextActionAt: string }>;
        expect(Object.values(storedStates)[0].nextActionAt).toBe(utcTime);
        await page.reload();
        await expect(page.getByLabel("다음 행동")).toHaveValue(localTime);
      }
    });
  });
});
