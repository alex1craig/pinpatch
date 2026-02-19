import { test, expect, type Page } from "@playwright/test";

const createPinOnTarget = async (
  page: Page,
  targetTestId: string,
  comment: string,
  options?: { expectHoverHighlight?: boolean; expectComposerFocused?: boolean }
): Promise<void> => {
  await page.locator("body").click({ position: { x: 16, y: 16 } });
  await page.keyboard.press("c");

  const target = page.getByTestId(targetTestId);
  const buttonBox = await target.boundingBox();
  if (buttonBox) {
    await page.mouse.move(buttonBox.x + buttonBox.width / 2, buttonBox.y + buttonBox.height / 2);
  }
  if (options?.expectHoverHighlight) {
    await expect(page.getByTestId("pinpatch-hover-highlight")).toBeVisible();
  }

  await target.click({ force: true });
  const input = page.getByTestId("pinpatch-comment-input");
  if (options?.expectComposerFocused) {
    await expect(input).toBeFocused();
  }
  await input.fill(comment);
  const submitShortcut = await page.evaluate(() => {
    return /mac/i.test(navigator.platform) ? "Meta+Enter" : "Control+Enter";
  });
  await input.press(submitShortcut);

  await expect(page.getByTestId("pinpatch-pin").first()).toBeVisible();
};

const assertRouteSmokeFlow = async (page: Page, route: string, targetTestId: string, comment: string): Promise<void> => {
  await page.goto(route);
  await page.waitForSelector("#pinpatch-overlay-root");
  await createPinOnTarget(page, targetTestId, comment, { expectHoverHighlight: true, expectComposerFocused: true });

  await expect(page.getByTestId("pinpatch-pin").first()).toBeVisible();

  await page.getByTestId("pinpatch-pin").first().hover();
  await expect(page.getByTestId("pinpatch-pin-target-highlight")).toBeVisible();
  await expect(page.getByTestId("pinpatch-pin-message").first()).toContainText(/Queued|Scanning repository|Applying UI changes|Applied UI request/);
};

test("comment mode toggles and submits a pin on home route", async ({ page }) => {
  await assertRouteSmokeFlow(page, "/", "upgrade-button", "Move this button to the right and reduce padding.");
  const pin = page.getByTestId("pinpatch-pin").first();
  await expect(pin).toHaveClass(/bg-emerald-600/, { timeout: 10_000 });
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);
  await expect(pin).toHaveClass(/bg-emerald-600/);
});

test("comment mode toggles and submits a pin on settings route", async ({ page }) => {
  await assertRouteSmokeFlow(page, "/settings", "save-settings-button", "Make the save button full width on mobile.");
});

test("shortcut clears all pins", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");

  const waitForCreate = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return response.request().method() === "POST" && pathname === "/api/tasks" && response.status() === 201;
  });
  const waitForSubmit = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return response.request().method() === "POST" && /\/api\/tasks\/[^/]+\/submit$/.test(pathname) && response.status() === 202;
  });

  await createPinOnTarget(page, "upgrade-button", "Cancel me");
  await waitForCreate;
  await waitForSubmit;
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);

  const clearShortcut = await page.evaluate(() => {
    return /mac/i.test(navigator.platform) ? "Meta+Backspace" : "Control+Delete";
  });

  const waitForCancel = page.waitForRequest((request) => {
    const pathname = new URL(request.url()).pathname;
    return request.method() === "POST" && /\/api\/tasks\/[^/]+\/cancel$/.test(pathname);
  });

  await page.keyboard.press(clearShortcut);

  await waitForCancel;
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(0);
});
