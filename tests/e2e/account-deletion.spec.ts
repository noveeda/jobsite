import { expect, test } from "@playwright/test";

const settingsPath = "/settings/data";

test("requires backup acknowledgement and the exact irreversible confirmation", async ({ page }) => {
  let deleteRequests = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE" && new URL(request.url()).pathname === "/api/account") {
      deleteRequests += 1;
    }
  });

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

  await confirmation.fill(" 회원탈퇴");
  await expect(deleteButton).toBeDisabled();
  await confirmation.fill("회원탈퇴 ");
  await expect(deleteButton).toBeDisabled();
  await confirmation.fill("회원 탈퇴");
  await expect(deleteButton).toBeDisabled();

  await expect(page).toHaveURL(new RegExp(`${settingsPath.replace("/", "\\/")}$`));
  expect(deleteRequests).toBe(0);
});

test("deletes through the E2E route and reaches login using only the keyboard", async ({ page }) => {
  await page.goto(settingsPath);

  const exportLink = page.getByRole("link", { name: "탈퇴 전에 JSON 백업 내려받기" });
  const acknowledgement = page.getByRole("checkbox", { name: "백업 경로와 영구 삭제 범위를 확인했습니다." });
  const confirmation = page.getByRole("textbox", { name: /확인을 위해 회원탈퇴 입력/ });
  const deleteButton = page.getByRole("button", { name: "계정과 데이터 영구 삭제" });

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
