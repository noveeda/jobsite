import { expect, test, type APIRequestContext } from "@playwright/test";

type DiscoveryScenario =
  | "anonymous"
  | "preparing"
  | "ready-empty"
  | "healthy"
  | "partial"
  | "failed-cached"
  | "failed-empty"
  | "degraded"
  | "exception";

async function useScenario(request: APIRequestContext, scenario: DiscoveryScenario) {
  const response = await request.post("/api/e2e/automatic-discovery", { data: { scenario } });
  expect(response.status(), `automatic discovery E2E scenario '${scenario}' must be available`).toBe(204);
}

test.beforeEach(async ({ page, baseURL }) => {
  const localOrigin = new URL(baseURL!).origin;
  await page.route("**/*", async (route) => {
    const requestOrigin = new URL(route.request().url()).origin;
    if (requestOrigin !== localOrigin) return route.abort("blockedbyclient");
    return route.continue();
  });
});

test("redirects unauthenticated list and detail requests to login", async ({ page }) => {
  await useScenario(page.context().request, "anonymous");

  await page.goto("/jobs");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);

  await page.goto("/jobs/00000000-0000-4000-8000-000000000001");
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});

test("announces the initial collection while the feed is preparing", async ({ page }) => {
  await useScenario(page.context().request, "preparing");
  await page.goto("/jobs");

  await expect(page.getByRole("heading", { name: "채용공고" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("공고를 처음 수집하고 있습니다");
  await expect(page.getByLabel("공고 불러오는 중")).toBeVisible();
  await expect(page.getByRole("link", { name: "원문 보기" })).toHaveCount(0);
});

test("distinguishes an empty filtered result from a collection failure", async ({ page }) => {
  await useScenario(page.context().request, "ready-empty");
  await page.goto("/jobs?region=없는지역&source=fixture-page");

  await expect(page.getByRole("heading", { name: "조건에 맞는 공고가 없습니다" })).toBeVisible();
  await expect(page.getByText("적용된 조건")).toBeVisible();
  await expect(page.getByText("정보 없음 공고는 활성 필터 결과에서 제외됩니다.")).toBeVisible();
  await expect(page.getByRole("link", { name: "전체 초기화" })).toHaveAttribute("href", "/jobs");
  await expect(page.locator(".warning-card")).toHaveCount(0);
});

test("shows a no-input healthy feed from two fixture providers", async ({ page }) => {
  await useScenario(page.context().request, "healthy");
  await page.goto("/jobs");

  await expect(page.getByText("120개의 공고")).toBeVisible();
  await expect(page.getByText("복수 출처 통합")).toBeVisible();
  await expect(page.locator(".job-list").getByText("Fixture Page").first()).toBeVisible();
  await expect(page.locator(".job-list").getByText("Fixture Token").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "원문 보기" }).first()).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByLabel("공고 URL")).toHaveCount(0);
});

test("keeps healthy and cached jobs visible during a partial provider failure", async ({ page }) => {
  await useScenario(page.context().request, "partial");
  await page.goto("/jobs");

  await expect(page.locator(".warning-card")).toContainText("일부 출처를 갱신하지 못했습니다");
  await expect(page.locator(".warning-card")).toContainText("마지막 성공");
  await expect(page.getByText("이전에 확인한 공고를 함께 표시합니다")).toBeVisible();
  await expect(page.getByRole("link", { name: "원문 보기" }).first()).toBeVisible();
});

test("retains the last valid feed and retry guidance after total refresh failure", async ({ page }) => {
  await useScenario(page.context().request, "failed-cached");
  await page.goto("/jobs");

  await expect(page.locator(".warning-card")).toContainText("모든 출처의 최신 갱신에 실패했습니다");
  await expect(page.locator(".warning-card")).toContainText("다시 시도");
  await expect(page.getByText("마지막으로 확인된 공고")).toBeVisible();
  await expect(page.getByRole("link", { name: "원문 보기" }).first()).toBeVisible();
});

test("shows unavailable retry guidance without an empty-result state when no cache exists", async ({ page }) => {
  await useScenario(page.context().request, "failed-empty");
  await page.goto("/jobs");

  await expect(page.locator(".warning-card")).toContainText("현재 표시할 공고가 없습니다");
  await expect(page.locator(".warning-card")).toContainText("다시 시도");
  await expect(page.getByRole("heading", { name: "조건에 맞는 공고가 없습니다" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "원문 보기" })).toHaveCount(0);
});

test("removes multi-provider branding and warns operators below the launch gate", async ({ page }) => {
  await useScenario(page.context().request, "degraded");
  await page.goto("/jobs");

  await expect(page.locator(".warning-card")).toContainText("공개 기준을 충족하지 못했습니다");
  await expect(page.locator(".warning-card")).toContainText("운영자가 출처 상태를 확인하고 있습니다");
  await expect(page.getByText("복수 출처 통합")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "원문 보기" }).first()).toBeVisible();
});

test("uses the error boundary for an unexpected feed exception", async ({ page }) => {
  await useScenario(page.context().request, "exception");
  await page.goto("/jobs");

  await expect(page.getByRole("heading", { name: "공고를 불러오지 못했습니다" })).toBeVisible();
  await expect(page.getByText(/요청 ID/)).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await expect(page.getByText("조건에 맞는 공고가 없습니다")).toHaveCount(0);
});
