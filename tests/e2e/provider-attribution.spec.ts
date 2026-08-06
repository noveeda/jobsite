import { expect, test } from "@playwright/test";

test("keeps legal and source policies public", async ({ page }) => {
  await page.goto("/terms");
  await expect(page.getByRole("heading", { name: "이용약관", exact: true })).toBeVisible();
  await expect(page.getByText("시행일: 2026-08-07")).toBeVisible();
  await expect(page.getByRole("link", { name: "개인정보 처리방침" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "외부 출처 안내" })).toHaveAttribute("href", "/sources");

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "개인정보 처리방침", exact: true })).toBeVisible();
  await expect(page.getByText("시행일: 2026-08-07")).toBeVisible();
  await expect(page.getByRole("link", { name: "privacy@example.com" })).toHaveAttribute("href", "mailto:privacy@example.com");
  await expect(page.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms");

  await page.goto("/sources");
  await expect(page.getByRole("heading", { name: "외부 출처 안내", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1. 원문이 최종 기준입니다" })).toBeVisible();
  await expect(page.getByText(/제휴 관계를 주장하지 않습니다/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Powered by 취업 사람인" })).toHaveAttribute("href", /^https:\/\/www\.saramin\.co\.kr\/?$/);
});

test("distinguishes approved Saramin data from manual sources in the job list", async ({ page }) => {
  await page.goto("/jobs");

  const saraminCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "테스트 개발자 0", exact: true }),
  });
  const saraminSource = saraminCard.getByLabel("출처 안내");
  await expect(saraminSource.getByRole("link", { name: "Powered by 취업 사람인" })).toHaveAttribute("href", /^https:\/\/www\.saramin\.co\.kr\/?$/);
  await expect(saraminSource.getByRole("link", { name: "원문 보기" })).toHaveAttribute("href", /saramin\.co\.kr.*rec_idx=0/);
  await expect(saraminSource).toContainText("저장된 정보는 원문을 대체하지 않습니다.");
  await expect(saraminCard).toContainText(/최초 확인 .*마지막 자동 갱신/);

  const manualCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "테스트 개발자 1", exact: true }),
  });
  const manualSource = manualCard.getByLabel("출처 안내");
  await expect(manualSource).toContainText("외부 공고 · 수동 입력");
  await expect(manualSource.getByRole("link", { name: "Powered by 취업 사람인" })).toHaveCount(0);
  await expect(manualSource.getByRole("link", { name: "원문 보기" })).toHaveAttribute("href", "https://example.com/jobs/1");
  await expect(manualSource).toContainText("본 서비스는 해당 채용 플랫폼과 제휴 관계가 아닙니다.");
});
