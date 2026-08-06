import { expect, test } from "@playwright/test";

test("exports a portable file and completes a validated round trip", async ({ page }) => {
  await page.goto("/settings/data");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "JSON 내보내기" }).click();
  const download = await downloadPromise;
  const text = await (await download.createReadStream()).toArray();
  const exported = JSON.parse(Buffer.concat(text).toString("utf8"));
  expect(JSON.stringify(exported)).not.toMatch(/user_id|accessToken|rawBody/);
  expect(exported.jobs[0]).toMatchObject({ memo: "백업 메모", nextActionAt: "2026-08-08T00:00:00.000Z" });
  expect(exported.sources).toHaveLength(1);
  expect(exported.revisions).toHaveLength(1);
  expect(exported.duplicatePairs[0].decision).toBe("confirmed");

  await page.getByLabel("백업 JSON 파일").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  await expect(page.getByText(/충돌 1건/)).toBeVisible();
  await page.getByLabel("기존 데이터 덮어쓰기에 동의").check();
  await page.getByRole("button", { name: "복원 실행" }).click();
  await expect(page.getByRole("status")).toContainText("복원이 완료되었습니다");
});

test("rejects corrupt files without enabling restore", async ({ page }) => {
  await page.goto("/settings/data");
  await page.getByLabel("백업 JSON 파일").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await expect(page.getByText(/유효하지 않은 백업입니다/)).toBeVisible();
  await expect(page.getByRole("button", { name: "복원 실행" })).toBeDisabled();
});