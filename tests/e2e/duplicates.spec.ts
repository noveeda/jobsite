import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const e2eUserCookie = "jobhub-e2e-user-id";
const duplicateA = "10000000-0000-4000-8000-000000000101";
const duplicateB = "10000000-0000-4000-8000-000000000102";
const duplicateC = "10000000-0000-4000-8000-000000000103";

async function useDuplicateScenario(page: Page, scenario: "duplicates" | "duplicates-report-failure" = "duplicates") {
  const response = await page.context().request.post("/api/e2e/automatic-discovery", { data: { scenario } });
  expect(response.status(), `duplicate E2E scenario '${scenario}' must be available`).toBe(204);
}

async function useTestUser(context: BrowserContext, baseURL: string, userId = randomUUID()) {
  await context.addCookies([{ name: e2eUserCookie, value: userId, url: new URL(baseURL).origin }]);
  return userId;
}

async function blockExternalRequests(page: Page, baseURL: string) {
  const localOrigin = new URL(baseURL).origin;
  await page.route("**/*", (route) => (
    new URL(route.request().url()).origin === localOrigin
      ? route.continue()
      : route.abort("blockedbyclient")
  ));
}

function candidatePanel(page: Page, counterpartId: string) {
  return page.locator(".catalog-duplicate-candidate").filter({
    has: page.locator(`a[href="/jobs/${counterpartId}"]`).filter({ hasText: "상대 공고 보기" }),
  });
}

test.describe("automatic catalog duplicate controls", () => {
  test.beforeEach(async ({ page, context, baseURL }) => {
    await useTestUser(context, baseURL!);
    await useDuplicateScenario(page);
    await blockExternalRequests(page, baseURL!);
  });

  test("shows a candidate without automatically grouping the canonical records", async ({ page }) => {
    await page.goto("/jobs?source=fixture-page&take=30");

    await expect(page.locator(`#job-${duplicateA}`)).toBeVisible();
    await expect(page.locator(`#job-${duplicateB}`)).toHaveCount(0);
    await expect(page.getByLabel("중복 공고 묶음")).toHaveCount(0);

    await page.goto(`/jobs/${duplicateA}`);
    await expect(candidatePanel(page, duplicateB)).toContainText("유사도 90%");
    await expect(candidatePanel(page, duplicateB).getByRole("button", { name: `${duplicateB} 공고와 병합` })).toBeVisible();
    await expect(candidatePanel(page, duplicateB).getByRole("button", { name: `${duplicateB} 공고와 별개로 유지` })).toBeVisible();
  });

  test("keeps sources and personal state through merge, separate, undo, and reload", async ({ page }) => {
    await page.goto(`/jobs/${duplicateB}`);
    await page.getByLabel("메모").fill("두 번째 출처의 개인 메모");
    await page.getByLabel("지원 상태").selectOption("interviewing");
    await page.getByRole("button", { name: "지원 정보 저장", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("저장했습니다");

    await page.goto(`/jobs/${duplicateA}`);
    const ab = candidatePanel(page, duplicateB);
    await ab.getByRole("button", { name: `${duplicateB} 공고와 병합` }).click();
    await expect(ab).toContainText("병합됨");
    await page.reload();
    await expect(candidatePanel(page, duplicateB)).toContainText("병합됨");
    await expect(candidatePanel(page, duplicateB).getByRole("link", { name: "원문 보기" })).toHaveCount(2);

    await page.goto(`/jobs/${duplicateB}`);
    await expect(page.getByLabel("메모")).toHaveValue("두 번째 출처의 개인 메모");
    await expect(page.getByLabel("지원 상태")).toHaveValue("interviewing");

    await page.goto(`/jobs/${duplicateA}`);
    await candidatePanel(page, duplicateB).getByRole("button", { name: `${duplicateB} 공고와 마지막 결정 되돌리기` }).click();
    await expect(candidatePanel(page, duplicateB)).toContainText("판단 전");
    await candidatePanel(page, duplicateB).getByRole("button", { name: `${duplicateB} 공고와 별개로 유지` }).click();
    await expect(candidatePanel(page, duplicateB)).toContainText("별개로 유지됨");
    await page.reload();
    await expect(candidatePanel(page, duplicateB)).toContainText("별개로 유지됨");
    await candidatePanel(page, duplicateB).getByRole("button", { name: `${duplicateB} 공고와 마지막 결정 되돌리기` }).click();
    await expect(candidatePanel(page, duplicateB)).toContainText("판단 전");
  });

  test("rejects an indirect separation and preserves the blocking sources and state", async ({ page }) => {
    await page.goto(`/jobs/${duplicateA}`);
    await candidatePanel(page, duplicateB).getByRole("button", { name: `${duplicateB} 공고와 병합` }).click();
    await expect(candidatePanel(page, duplicateB)).toContainText("병합됨");

    await page.goto(`/jobs/${duplicateB}`);
    await candidatePanel(page, duplicateC).getByRole("button", { name: `${duplicateC} 공고와 병합` }).click();
    await expect(candidatePanel(page, duplicateC)).toContainText("병합됨");

    await page.goto(`/jobs/${duplicateA}`);
    await candidatePanel(page, duplicateC).getByRole("button", { name: `${duplicateC} 공고와 병합` }).click();
    await expect(candidatePanel(page, duplicateC)).toContainText("병합됨");

    await candidatePanel(page, duplicateB).getByRole("button", { name: `${duplicateB} 공고와 별개로 유지` }).click();
    await expect(page.getByLabel("결정 차단 안내")).toContainText("요청은 적용되지 않았습니다");
    await expect(candidatePanel(page, duplicateB).getByRole("link", { name: "원문 보기" })).toHaveCount(2);
    await page.reload();
    await expect(candidatePanel(page, duplicateB)).toContainText("병합됨");
  });

  test("keeps conflicts, attribution, observed time, reports, and retries truthful", async ({ page }) => {
    await page.goto(`/jobs/${duplicateA}`);
    const ab = candidatePanel(page, duplicateB);
    await expect(ab.getByRole("heading", { name: "원문 출처" })).toBeVisible();
    await expect(ab.getByRole("link", { name: "원문 보기" })).toHaveCount(2);
    await expect(ab.getByText("관찰 시각").first()).toBeVisible();
    await expect(ab.getByRole("heading", { name: "출처 간 다른 정보" })).toBeVisible();
    await expect(ab).toContainText("마감일");
    await expect(ab).toContainText("근무 지역");

    await ab.getByLabel(`${duplicateB} 공고 문제 내용`).locator("xpath=ancestor::form").locator('input[name="operationId"]').evaluate((input: HTMLInputElement) => { input.value = "30000000-0000-4000-8000-000000000101"; });
    await ab.getByLabel(`${duplicateB} 공고 문제 내용`).fill("두 출처의 마감일을 다시 확인해 주세요.");
    await ab.getByRole("button", { name: `${duplicateB} 공고 문제 신고` }).click();
    await expect(ab.getByRole("status")).toContainText("신고를 접수했습니다");
    await page.reload();
    await expect(candidatePanel(page, duplicateB)).toContainText("내 판단 이력");

    await useDuplicateScenario(page, "duplicates-report-failure");
    await page.goto(`/jobs/${duplicateA}`);
    const failingReport = candidatePanel(page, duplicateB);
    await failingReport.getByLabel(`${duplicateB} 공고 문제 내용`).fill("재시도할 신고 내용");
    await failingReport.getByRole("button", { name: `${duplicateB} 공고 문제 신고` }).click();
    await expect(failingReport.getByRole("alert")).toContainText("저장하지 못했습니다");
    await expect(failingReport.getByLabel(`${duplicateB} 공고 문제 내용`)).toBeEditable();

    await useDuplicateScenario(page);
    await failingReport.getByLabel(`${duplicateB} 공고 문제 내용`).fill("재시도할 신고 내용");
    await failingReport.getByRole("button", { name: `${duplicateB} 공고 문제 신고` }).click();
    await expect(failingReport.getByRole("status")).toContainText("신고를 접수했습니다");
  });

  test("isolates decisions and reports between E2E users", async ({ browser, baseURL }) => {
    const first = await browser.newContext({ baseURL });
    const second = await browser.newContext({ baseURL });
    const firstPage = await first.newPage();
    const secondPage = await second.newPage();
    await useTestUser(first, baseURL!, randomUUID());
    await useTestUser(second, baseURL!, randomUUID());
    await useDuplicateScenario(firstPage);
    await useDuplicateScenario(secondPage);
    await blockExternalRequests(firstPage, baseURL!);
    await blockExternalRequests(secondPage, baseURL!);

    await firstPage.goto(`/jobs/${duplicateA}`);
    await candidatePanel(firstPage, duplicateB).getByRole("button", { name: `${duplicateB} 공고와 병합` }).click();
    await candidatePanel(firstPage, duplicateB).getByLabel(`${duplicateB} 공고 문제 내용`).fill("첫 사용자 신고");
    await candidatePanel(firstPage, duplicateB).getByRole("button", { name: `${duplicateB} 공고 문제 신고` }).click();

    await secondPage.goto(`/jobs/${duplicateA}`);
    await expect(candidatePanel(secondPage, duplicateB)).toContainText("판단 전");
    await expect(candidatePanel(secondPage, duplicateB)).toContainText("아직 판단 이력이 없습니다");

    await first.close();
    await second.close();
  });
});
