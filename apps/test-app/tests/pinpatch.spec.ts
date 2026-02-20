import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, type Locator, type Page } from "@playwright/test";

type PinPlacementOptions = {
  expectComposerFocused?: boolean;
  expectHoverHighlight?: boolean;
};

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const screenshotsDir = path.join(repoRoot, ".pinpatch", "screenshots");

const readPngDimensions = (buffer: Buffer): { width: number; height: number } | null => {
  if (buffer.length < 24) {
    return null;
  }

  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) {
    return null;
  }

  if (buffer.toString("ascii", 12, 16) !== "IHDR") {
    return null;
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
};

const assertTaskScreenshotCaptured = async (taskId: string): Promise<void> => {
  const screenshotPath = path.join(screenshotsDir, `${taskId}.png`);

  await expect
    .poll(
      async () => {
        try {
          const stats = await fs.stat(screenshotPath);
          return stats.size;
        } catch {
          return 0;
        }
      },
      { timeout: 5_000 },
    )
    .toBeGreaterThan(1_024);

  const screenshot = await fs.readFile(screenshotPath);
  const dimensions = readPngDimensions(screenshot);
  expect(dimensions).not.toBeNull();

  if (!dimensions) {
    return;
  }

  expect(dimensions.width).toBeGreaterThan(1);
  expect(dimensions.height).toBeGreaterThan(1);
};

const openComposerOnTarget = async (
  page: Page,
  targetTestId: string,
  options?: PinPlacementOptions,
): Promise<void> => {
  await page.locator("body").click({ position: { x: 16, y: 16 } });
  await page.keyboard.press("c");

  const target = page.getByTestId(targetTestId);
  const buttonBox = await target.boundingBox();
  if (buttonBox) {
    await page.mouse.move(
      buttonBox.x + buttonBox.width / 2,
      buttonBox.y + buttonBox.height / 2,
    );
  }
  if (options?.expectHoverHighlight) {
    await expect(page.getByTestId("pinpatch-hover-highlight")).toBeVisible();
  }

  await target.click({ force: true });
  const input = page.getByTestId("pinpatch-pin-input");
  if (options?.expectComposerFocused) {
    await expect(input).toBeFocused();
  }
};

const openComposerOnLocator = async (
  page: Page,
  locator: Locator,
  options?: PinPlacementOptions,
): Promise<{ clickX: number; clickY: number }> => {
  await page.locator("body").click({ position: { x: 16, y: 16 } });
  await page.keyboard.press("c");

  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  if (!box) {
    throw new Error("Target locator is not visible for pin placement.");
  }

  const clickX = box.x + box.width - 8;
  const clickY = box.y + 20;
  await page.mouse.move(clickX, clickY);

  if (options?.expectHoverHighlight) {
    await expect(page.getByTestId("pinpatch-hover-highlight")).toBeVisible();
  }

  await page.mouse.click(clickX, clickY);
  const input = page.getByTestId("pinpatch-pin-input");
  if (options?.expectComposerFocused) {
    await expect(input).toBeFocused();
  }

  return { clickX, clickY };
};

const createPinOnTarget = async (
  page: Page,
  targetTestId: string,
  pin: string,
  options?: PinPlacementOptions,
): Promise<void> => {
  await openComposerOnTarget(page, targetTestId, options);
  const input = page.getByTestId("pinpatch-pin-input");
  await input.fill(pin);
  await input.press("Enter");

  await expect(page.getByTestId("pinpatch-pin").first()).toBeVisible();
};

const assertPinAlignedToTarget = async (
  page: Page,
  targetTestId: string,
  tolerancePx = 24,
): Promise<void> => {
  const pinBox = await page.getByTestId("pinpatch-pin").first().boundingBox();
  const targetBox = await page.getByTestId(targetTestId).boundingBox();

  expect(pinBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  if (!pinBox || !targetBox) {
    return;
  }

  const pinCenterX = pinBox.x + pinBox.width / 2;
  const pinCenterY = pinBox.y + pinBox.height / 2;
  const targetCenterX = targetBox.x + targetBox.width / 2;
  const targetCenterY = targetBox.y + targetBox.height / 2;

  expect(Math.abs(pinCenterX - targetCenterX)).toBeLessThanOrEqual(tolerancePx);
  expect(Math.abs(pinCenterY - targetCenterY)).toBeLessThanOrEqual(tolerancePx);
};

const assertRouteSmokeFlow = async (
  page: Page,
  route: string,
  targetTestId: string,
  pin: string,
): Promise<void> => {
  await page.goto(route);
  await page.waitForSelector("#pinpatch-overlay-root");
  await createPinOnTarget(page, targetTestId, pin, {
    expectHoverHighlight: true,
    expectComposerFocused: true,
  });

  await expect(page.getByTestId("pinpatch-pin").first()).toBeVisible();

  await page.getByTestId("pinpatch-pin").first().hover();
  await expect(page.getByTestId("pinpatch-pin-target-highlight")).toBeVisible();
  await expect(page.getByTestId("pinpatch-pin-message").first()).toContainText(
    /Queued|Scanning repository|Applying UI changes|Applied UI request/,
  );
};

test("pin mode toggles and submits a pin on home route", async ({ page }) => {
  const createTaskResponsePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === "POST" &&
      pathname === "/api/tasks" &&
      response.status() === 201
    );
  });

  await assertRouteSmokeFlow(
    page,
    "/",
    "upgrade-button",
    "Move this button to the right and reduce padding.",
  );
  const pin = page.getByTestId("pinpatch-pin").first();
  await expect(pin).toHaveAttribute("data-status", "completed", {
    timeout: 10_000,
  });
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);
  await expect(pin).toHaveAttribute("data-status", "completed");

  const createTaskResponse = await createTaskResponsePromise;
  const createTaskPayload = (await createTaskResponse.json()) as {
    taskId: string;
  };
  await assertTaskScreenshotCaptured(createTaskPayload.taskId);
});

test("completed pin supports follow-up submit and clear", async ({ page }) => {
  const expectedProvider = "claude";
  const expectedModel = "sonnet";

  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");

  const waitForInitialSubmit = page.waitForRequest((request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      request.method() !== "POST" ||
      !/\/api\/tasks\/[^/]+\/submit$/.test(pathname)
    ) {
      return false;
    }

    const postData = request.postData();
    if (!postData) {
      return false;
    }

    try {
      const payload = JSON.parse(postData) as {
        provider?: string;
        model?: string;
      };
      return (
        payload.provider === expectedProvider && payload.model === expectedModel
      );
    } catch {
      return false;
    }
  });

  await createPinOnTarget(
    page,
    "upgrade-button",
    "Move this button to the right and reduce padding.",
  );
  await waitForInitialSubmit;

  const pin = page.getByTestId("pinpatch-pin").first();
  await expect(pin).toHaveAttribute("data-status", "completed", {
    timeout: 10_000,
  });

  await pin.hover();
  const followUpInput = page.getByTestId("pinpatch-followup-input");
  await expect(followUpInput).toBeVisible();
  await expect(page.getByTestId("pinpatch-clear-pin")).toBeVisible();
  await expect(page.getByTestId("pinpatch-followup-submit")).toBeVisible();

  await followUpInput.fill("Line one");
  await followUpInput.press("Shift+Enter");
  await followUpInput.type("Line two");
  const followUpBody = "Line one\nLine two";
  await expect(followUpInput).toHaveValue(followUpBody);

  const waitForFollowUpSubmit = page.waitForRequest((request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      request.method() !== "POST" ||
      !/\/api\/tasks\/[^/]+\/submit$/.test(pathname)
    ) {
      return false;
    }

    const postData = request.postData();
    if (!postData) {
      return false;
    }

    try {
      const payload = JSON.parse(postData) as {
        followUpBody?: string;
        provider?: string;
        model?: string;
      };
      return (
        payload.followUpBody === followUpBody &&
        payload.provider === expectedProvider &&
        payload.model === expectedModel
      );
    } catch {
      return false;
    }
  });

  await followUpInput.press("Enter");
  await waitForFollowUpSubmit;

  await expect(pin).toHaveAttribute("data-status", "completed", {
    timeout: 10_000,
  });

  const markedAsRetryable = await page.evaluate(() => {
    const key = "pinpatch.overlay.pins.v1";
    const raw = window.sessionStorage.getItem(key);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as unknown;
    const wrapper =
      parsed && typeof parsed === "object" && "pins" in parsed
        ? (parsed as { version?: number; pins?: unknown[] })
        : null;
    const pins = wrapper?.pins;
    if (!Array.isArray(pins) || pins.length === 0) {
      return false;
    }

    const pin = pins[0] as {
      status?: string;
      message?: string;
    };
    pin.status = "error";
    pin.message = "Retry me";

    window.sessionStorage.setItem(
      key,
      JSON.stringify({
        version: wrapper?.version ?? 1,
        pins,
      }),
    );
    return true;
  });
  expect(markedAsRetryable).toBe(true);

  await page.reload();
  await page.waitForSelector("#pinpatch-overlay-root");

  const retryPin = page.getByTestId("pinpatch-pin").first();
  await retryPin.hover();
  await expect(page.getByTestId("pinpatch-retry")).toBeVisible();

  const waitForRetrySubmit = page.waitForRequest((request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      request.method() !== "POST" ||
      !/\/api\/tasks\/[^/]+\/submit$/.test(pathname)
    ) {
      return false;
    }

    const postData = request.postData();
    if (!postData) {
      return false;
    }

    try {
      const payload = JSON.parse(postData) as {
        provider?: string;
        model?: string;
      };
      return (
        payload.provider === expectedProvider && payload.model === expectedModel
      );
    } catch {
      return false;
    }
  });

  await page.getByTestId("pinpatch-retry").click();
  await waitForRetrySubmit;
  await expect(retryPin).toHaveAttribute("data-status", "completed", {
    timeout: 10_000,
  });

  await retryPin.hover();
  await page.getByTestId("pinpatch-clear-pin").click();
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(0);
});

test("pin mode toggles and submits a pin on settings route", async ({
  page,
}) => {
  await assertRouteSmokeFlow(
    page,
    "/settings",
    "save-settings-button",
    "Make the save button full width on mobile.",
  );
});

test("task payload targets clicked container when text duplicates an ancestor", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");

  const container = page.locator("main > div").first();
  await openComposerOnLocator(page, container, {
    expectHoverHighlight: true,
    expectComposerFocused: true,
  });

  const waitForCreate = page.waitForRequest((request) => {
    const pathname = new URL(request.url()).pathname;
    return request.method() === "POST" && pathname === "/api/tasks";
  });

  const input = page.getByTestId("pinpatch-pin-input");
  await input.fill("Make the background red");
  await input.press("Enter");

  const createRequest = await waitForCreate;
  const postData = createRequest.postData();
  expect(postData).toBeTruthy();
  if (!postData) {
    return;
  }

  const payload = JSON.parse(postData) as {
    viewport: { width: number };
    uiChangePacket: {
      element: {
        tag: string;
        attributes: { class: string | null };
        boundingBox: { width: number };
      };
    };
  };

  expect(payload.uiChangePacket.element.tag).toBe("div");
  expect(payload.uiChangePacket.element.attributes.class).toContain(
    "mx-auto flex w-full max-w-3xl",
  );
  expect(payload.uiChangePacket.element.boundingBox.width).toBeLessThan(
    payload.viewport.width,
  );
});

test("pin stays aligned after viewport resize", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");

  await createPinOnTarget(
    page,
    "upgrade-button",
    "Keep this aligned during resize.",
  );
  await assertPinAlignedToTarget(page, "upgrade-button");

  await page.setViewportSize({ width: 430, height: 900 });
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);
  await assertPinAlignedToTarget(page, "upgrade-button", 28);
});

test("pin stays aligned while scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 360 });
  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "1600px";
    spacer.style.width = "1px";
    document.body.appendChild(spacer);
  });

  await createPinOnTarget(
    page,
    "upgrade-button",
    "Keep this aligned during scroll.",
  );
  await assertPinAlignedToTarget(page, "upgrade-button");

  await page.evaluate(() => window.scrollTo(0, 180));
  await expect
    .poll(async () => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);

  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);
  await assertPinAlignedToTarget(page, "upgrade-button", 28);
});

test("pins persist across routes and reload while remaining aligned", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");

  await createPinOnTarget(
    page,
    "upgrade-button",
    "Persist this pin on home route.",
  );
  await assertPinAlignedToTarget(page, "upgrade-button");

  await page.getByTestId("settings-route-link").click();
  await page.waitForSelector("#pinpatch-overlay-root");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(0);

  await createPinOnTarget(
    page,
    "save-settings-button",
    "Persist this pin on settings route.",
  );
  await assertPinAlignedToTarget(page, "save-settings-button");

  await page.locator('a[href="/"]').first().click();
  await page.waitForSelector("#pinpatch-overlay-root");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);
  await assertPinAlignedToTarget(page, "upgrade-button");

  await page.getByTestId("settings-route-link").click();
  await page.waitForSelector("#pinpatch-overlay-root");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);
  await assertPinAlignedToTarget(page, "save-settings-button");

  await page.reload();
  await page.waitForSelector("#pinpatch-overlay-root");
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);
  await assertPinAlignedToTarget(page, "save-settings-button");
});

test("shortcut clears all pins", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");

  const waitForCreate = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === "POST" &&
      pathname === "/api/tasks" &&
      response.status() === 201
    );
  });
  const waitForSubmit = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname;
    return (
      response.request().method() === "POST" &&
      /\/api\/tasks\/[^/]+\/submit$/.test(pathname) &&
      response.status() === 202
    );
  });

  await createPinOnTarget(page, "upgrade-button", "Cancel me");
  await waitForCreate;
  await waitForSubmit;
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);

  const clearShortcut = await page.evaluate(() => {
    return /mac/i.test(navigator.platform)
      ? "Meta+Backspace"
      : "Control+Delete";
  });

  const waitForCancel = page.waitForRequest((request) => {
    const pathname = new URL(request.url()).pathname;
    return (
      request.method() === "POST" &&
      /\/api\/tasks\/[^/]+\/cancel$/.test(pathname)
    );
  });

  await page.keyboard.press(clearShortcut);

  await waitForCancel;
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(0);
});

test("clicking outside an open composer removes the draft pin", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");

  await openComposerOnTarget(page, "upgrade-button", {
    expectComposerFocused: true,
  });
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);

  await page.locator("body").click({ position: { x: 16, y: 16 }, force: true });

  await expect(page.getByTestId("pinpatch-pin-input")).toHaveCount(0);
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(0);
});

test("reloading with an open composer does not leave an orphan idle pin", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");

  await openComposerOnTarget(page, "upgrade-button", {
    expectComposerFocused: true,
  });
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);

  await page.reload();
  await page.waitForSelector("#pinpatch-overlay-root");

  await expect(page.getByTestId("pinpatch-pin-input")).toHaveCount(0);
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(0);
});

test("shift-enter inserts a newline and enter submits", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector("#pinpatch-overlay-root");

  await openComposerOnTarget(page, "upgrade-button", {
    expectComposerFocused: true,
  });

  const input = page.getByTestId("pinpatch-pin-input");
  await input.fill("Line one");
  await input.press("Shift+Enter");
  await input.type("Line two");

  await expect(input).toHaveValue("Line one\nLine two");
  await expect(page.getByTestId("pinpatch-pin")).toHaveCount(1);

  await input.press("Enter");
  await expect(page.getByTestId("pinpatch-pin-input")).toHaveCount(0);
});
