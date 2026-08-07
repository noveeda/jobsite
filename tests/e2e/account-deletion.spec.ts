import { expect, test } from "@playwright/test";

const settingsPath = "/settings/data";
const sentinelJobId = "00000000-0000-4000-8000-000000000091";

test("offers export, warns about irreversibility, and preserves data for incorrect confirmation", async ({ page, request }) => {
  let browserDeleteRequests = 0;
  page.on("request", (browserRequest) => {
    if (browserRequest.method() === "DELETE" && new URL(browserRequest.url()).pathname === "/api/account") {
      browserDeleteRequests += 1;
    }
  });

  await request.delete(`/api/e2e/jobs/${sentinelJobId}`);
  const before = await (await request.get(`/api/e2e/jobs/${sentinelJobId}`)).json();
  await page.goto(settingsPath);

  await expect(page.getByRole("link", { name: "JSON 내보내기" })).toHaveAttribute("href", "/api/export");
  await expect(page.getByRole("link", { name: "탈퇴 전에 JSON 백업 내려받기" })).toHaveAttribute("href", "/api/export");
  await expect(page.getByText("인증 계정과 저장한 공고, 출처, 메모, 일정, 변경 이력 및 동의 기록이 영구 삭제됩니다.")).toBeVisible();
  await expect(page.getByText("이 작업은 되돌릴 수 없습니다.")).toBeVisible();

  const acknowledgement = page.getByRole("checkbox", { name: "백업 경로와 영구 삭제 범위를 확인했습니다." });
  const confirmation = page.getByRole("textbox", { name: /확인을 위해 회원탈퇴 입력/ });
  const deleteButton = page.getByRole("button", { name: "계정과 데이터 영구 삭제" });

  await expect(deleteButton).toBeDisabled();
  await acknowledgement.check();
  await expect(deleteButton).toBeDisabled();

  for (const invalid of [" 회원탈퇴", "회원탈퇴 ", "회원 탈퇴"]) {
    await confirmation.fill(invalid);
    await expect(deleteButton).toBeDisabled();
  }
  expect(browserDeleteRequests).toBe(0);

  const invalidResponse = await request.delete("/api/account", {
    data: { confirmation: " 회원탈퇴", exportAcknowledged: true },
    headers: { origin: "http://127.0.0.1:3000" },
  });
  expect(invalidResponse.status()).toBe(400);
  expect((await invalidResponse.json()).code).toBe("INVALID_CONFIRMATION");

  const after = await (await request.get(`/api/e2e/jobs/${sentinelJobId}`)).json();
  expect(after).toEqual(before);
  await expect(page).toHaveURL(/\/settings\/data$/);
});

test("downloads a backup before keyboard-only confirmation and redirects after route success", async ({ page }) => {
  await page.goto(settingsPath);

  const exportLink = page.getByRole("link", { name: "탈퇴 전에 JSON 백업 내려받기" });
  const acknowledgement = page.getByRole("checkbox", { name: "백업 경로와 영구 삭제 범위를 확인했습니다." });
  const confirmation = page.getByRole("textbox", { name: /확인을 위해 회원탈퇴 입력/ });
  const deleteButton = page.getByRole("button", { name: "계정과 데이터 영구 삭제" });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportLink.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^job-hub-export-\d{8}\.json$/);

  await exportLink.focus();
  await expect(exportLink).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(acknowledgement).toBeFocused();
  await page.keyboard.press("Space");
  await expect(acknowledgement).toBeChecked();
  await page.keyboard.press("Tab");
  await expect(confirmation).toBeFocused();
  await page.keyboard.type("회원탈퇴");
  await page.keyboard.press("Tab");
  await expect(deleteButton).toBeFocused();
  await expect(deleteButton).toBeEnabled();

  const deletionResponse = page.waitForResponse((response) =>
    response.request().method() === "DELETE"
      && new URL(response.url()).pathname === "/api/account"
  );
  await page.keyboard.press("Enter");

  expect((await deletionResponse).status()).toBe(204);
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
  await expect(page.getByRole("button", { name: "Google로 계속하기" })).toBeVisible();
});

test("prevents duplicate submission and allows retry after a sanitized server failure", async ({ page }) => {
  let attempts = 0;
  let releaseFailure!: () => void;
  const failureGate = new Promise<void>((resolve) => {
    releaseFailure = resolve;
  });

  await page.route("**/api/account", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await failureGate;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          code: "ACCOUNT_DELETE_UNAVAILABLE",
          message: "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          requestId: "e2e_delete_failure",
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(settingsPath);
  await page.getByRole("checkbox", { name: "백업 경로와 영구 삭제 범위를 확인했습니다." }).check();
  await page.getByRole("textbox", { name: /확인을 위해 회원탈퇴 입력/ }).fill("회원탈퇴");
  const deleteButton = page.getByRole("button", { name: "계정과 데이터 영구 삭제" });

  await deleteButton.dblclick();
  await expect(page.getByRole("button", { name: "삭제 중…" })).toBeDisabled();
  expect(attempts).toBe(1);
  releaseFailure();

  await expect(page.locator(".danger-zone").getByRole("alert")).toContainText("계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  await expect(deleteButton).toBeEnabled();
  expect(attempts).toBe(1);

  await deleteButton.click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
  expect(attempts).toBe(2);
});