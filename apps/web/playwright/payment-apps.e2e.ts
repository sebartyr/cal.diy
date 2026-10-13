import prisma from "@calcom/prisma";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";
import { selectFirstAvailableTimeSlotNextMonth, submitAndWaitForResponse } from "./lib/testUtils";

test.describe.configure({ mode: "parallel" });
test.afterEach(({ users }) => users.deleteAll());

async function goToAppsTab(page: Page, eventTypeId?: number): Promise<void> {
  await page.goto(`event-types/${eventTypeId}?tabName=apps`);
  await expect(page.getByTestId("vertical-tab-apps").first()).toHaveAttribute("aria-current", "page");
}

/**
 * Ensures an app is enabled in the App table and returns a cleanup function.
 * This is needed because apps without valid keys are now disabled during seeding.
 * For E2E tests, we need to enable the app to test the UI behavior.
 * The cleanup function restores the original enabled state to avoid side-effects.
 */
async function ensureAppEnabled(appSlug: string): Promise<() => Promise<void>> {
  const app = await prisma.app.findUnique({
    where: { slug: appSlug },
    select: { enabled: true },
  });
  const originalEnabled = app?.enabled ?? false;

  await prisma.app.update({
    where: { slug: appSlug },
    data: { enabled: true },
  });

  return async () => {
    await prisma.app.update({
      where: { slug: appSlug },
      data: { enabled: originalEnabled },
    });
  };
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: E2E test suites naturally have many test cases
test.describe("Payment app", () => {
  /**
   * For now almost all the payment apps show display "This app has not been setup yet"
   * this can change in the future
   */
  test("Should not display App is not setup already for non payment app", async ({ page, users }) => {
    // We use the QR code app here: it is kept, and it is not a payment app
    const user = await users.create();
    await user.apiLogin();
    // Any event should work here
    const paymentEvent = user.eventTypes.find((item) => item.slug === "paid");
    expect(paymentEvent).not.toBeNull();

    await prisma.credential.create({
      data: {
        type: "qr_code_other",
        userId: user.id,
        appId: "qr_code",
        invalid: false,
        key: {},
      },
    });

    await goToAppsTab(page, paymentEvent?.id);

    await page.locator("#event-type-form").getByRole("switch").click();

    // The setup warning is reserved for payment apps missing their keys; a non-payment app
    // must never show it. This used to drive ga4 and assert on its Tracking ID field, which
    // only existed because ga4 was an analytics app.
    await expect(page.locator("text=This app has not been setup yet")).toHaveCount(0);
  });
});
