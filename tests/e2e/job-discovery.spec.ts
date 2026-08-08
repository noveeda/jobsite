import { expect, test, type Page } from "@playwright/test";

async function useHealthyCatalog(page: Page) {
  const response = await page.context().request.post("/api/e2e/automatic-discovery", {
    data: { scenario: "healthy" },
  });
  expect(response.status()).toBe(204);
}

test.beforeEach(async ({ page, baseURL }) => {
  await useHealthyCatalog(page);
  const localOrigin = new URL(baseURL!).origin;
  await page.route("**/*", (route) => (
    new URL(route.request().url()).origin === localOrigin
      ? route.continue()
      : route.abort("blockedbyclient")
  ));
});

test("combines every catalog filter and preserves the GET URL after reload", async ({ page }) => {
  const query = new URLSearchParams({
    q: "fixture-page",
    region: "서울",
    role: "백엔드",
    career: "entry",
    employment: "permanent",
    deadline: "active",
    source: "fixture-page",
    sort: "posted",
    take: "30",
  });
  await page.goto(`/jobs?${query}`);

  await expect(page.getByLabel("검색")).toHaveValue("fixture-page");
  await expect(page.getByLabel("지역")).toHaveValue("서울");
  await expect(page.getByLabel("직무")).toHaveValue("백엔드");
  await expect(page.getByLabel("경력")).toHaveValue("entry");
  await expect(page.getByLabel("고용 형태")).toHaveValue("permanent");
  await expect(page.getByLabel("마감")).toHaveValue("active");
  await expect(page.getByLabel("출처")).toHaveValue("fixture-page");
  await expect(page.getByRole("article")).toHaveCount(5);

  await page.reload();
  const persisted = new URL(page.url()).searchParams;
  for (const [name, value] of query) expect(persisted.get(name), name).toBe(value);
});

test("loads 30 then 60 jobs with an explicit more-results link", async ({ page }) => {
  await page.goto("/jobs");

  await expect(page.getByText("120개의 공고")).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(30);
  const more = page.getByRole("link", { name: "더 보기" });
  await expect(more).toHaveAttribute("href", /(?:\?|&)take=60(?:&|$)/);

  await more.click();
  await expect(page).toHaveURL(/(?:\?|&)take=60(?:&|$)/);
  await expect(page.getByRole("article")).toHaveCount(60);
});

test("shows a true zero state and resets every filter", async ({ page }) => {
  await page.goto("/jobs?region=없는지역&source=fixture-page&take=30");

  await expect(page.getByRole("heading", { name: "조건에 맞는 공고가 없습니다" })).toBeVisible();
  await expect(page.getByText(/정보 없음/)).toBeVisible();
  const reset = page.getByRole("link", { name: "전체 초기화" });
  await expect(reset).toHaveAttribute("href", "/jobs");

  await reset.click();
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByRole("article")).toHaveCount(30);
});

test("returns from detail to the original hash and restores card focus", async ({ page }) => {
  await page.goto("/jobs?source=fixture-page&take=30");
  const card = page.getByRole("article").first();
  const cardId = await card.getAttribute("id");
  expect(cardId).toMatch(/^job-[0-9a-f-]{36}$/);

  const detailLink = card.getByRole("link").filter({ hasText: /개발자/ }).first();
  const href = await detailLink.getAttribute("href");
  expect(new URL(href!, page.url()).searchParams.get("returnTo")).toBe(
    `/jobs?source=fixture-page&take=30#${cardId}`,
  );

  await detailLink.click();
  await page.getByRole("link", { name: "목록으로 돌아가기" }).click();
  await expect(page).toHaveURL(new RegExp(`#${cardId}$`));
  await expect.poll(() => page.evaluate(() => document.activeElement?.closest("[id^='job-']")?.id ?? null)).toBe(cardId);
});
