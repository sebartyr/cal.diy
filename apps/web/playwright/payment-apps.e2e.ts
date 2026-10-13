import prisma from "@calcom/prisma";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { test } from "./lib/fixtures";
import {
  IS_STRIPE_ENABLED,
  selectFirstAvailableTimeSlotNextMonth,
  submitAndWaitForResponse,
} from "./lib/testUtils";

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
  test("Should be able to edit stripe price, currency", async ({ page, users }) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(!IS_STRIPE_ENABLED, "It should only run if Stripe is installed");
    const user = await users.create();
    await user.apiLogin();
    const paymentEvent = user.eventTypes.find((item) => item.slug === "paid");
    expect(paymentEvent).not.toBeNull();
    await prisma.credential.create({
      data: {
        type: "stripe_payment",
        appId: "stripe",
        userId: user.id,
        key: {
          scope: "read_write",
          livemode: false,
          token_type: "bearer",
          access_token: "sk_test_randomString",
          refresh_token: "rt_randomString",
          stripe_user_id: "acct_randomString",
          default_currency: "usd",
          stripe_publishable_key: "pk_test_randomString",
        },
      },
    });

    await goToAppsTab(page, paymentEvent?.id);
    await page.locator("#event-type-form").getByRole("switch").click();
    await page.getByTestId("stripe-currency-select").click();
    await page.getByTestId("select-option-usd").click();

    await page.getByTestId("stripe-price-input").click();
    await page.getByTestId("stripe-price-input").fill("350");
    await page.getByTestId("update-eventtype").click();

    await page.goto(`${user.username}/${paymentEvent?.slug}`);

    // expect 350 USD to be displayed in page
    await expect(page.locator("text=350").first()).toBeVisible();

    await selectFirstAvailableTimeSlotNextMonth(page);
    await expect(page.locator("text=350").first()).toBeVisible();

    // go to /event-types and check if the price is 350 USD
    await page.goto(`event-types/`);
    await expect(page.locator("text=350").first()).toBeVisible();
  });

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
    // make sure Tracking ID is displayed
    await expect(page.locator("text=Tracking ID").first()).toBeVisible();
    await page.getByLabel("Tracking ID").click();
    await page.getByLabel("Tracking ID").fill("demo");
    await page.getByTestId("update-eventtype").click();
  });

  test("Should only be allowed to enable one payment app", async ({ page, users }) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(!IS_STRIPE_ENABLED, "It should only run if Stripe is installed");
    const user = await users.create();
    await user.apiLogin();
    const paymentEvent = user.eventTypes.find((item) => item.slug === "paid");
    if (!paymentEvent) {
      throw new Error("No payment event found");
    }
    await prisma.credential.createMany({
      data: [
        {
          // paypal was removed from the app store; mock-payment-app is the other
          // payment app still installable, and what matters here is that two of them
          // are mutually exclusive.
          type: "mock-payment-app_payment",
          appId: "mock-payment-app",
          userId: user.id,
          key: {},
        },
        {
          type: "stripe_payment",
          appId: "stripe",
          userId: user.id,
          key: {
            scope: "read_write",
            livemode: false,
            token_type: "bearer",
            access_token: "sk_test_randomString",
            refresh_token: "rt_randomString",
            stripe_user_id: "acct_randomString",
            default_currency: "usd",
            stripe_publishable_key: "pk_test_randomString",
          },
        },
      ],
    });

    await goToAppsTab(page, paymentEvent?.id);

    await page.locator("[data-testid='mock-payment-app-app-switch']").click();
    // After enabling mock-payment-app, its switch should be checked and stripe should be unchecked (mutual exclusivity)
    await expect(page.locator("[data-testid='mock-payment-app-app-switch']")).toBeChecked();
    await expect(page.locator("[data-testid='stripe-app-switch']")).not.toBeChecked();
  });

  test("when more than one payment app is installed the price should be updated when changing settings", async ({
    page,
    users,
  }) => {
    // eslint-disable-next-line playwright/no-skipped-test
    test.skip(!IS_STRIPE_ENABLED, "It should only run if Stripe is installed");
    const user = await users.create();
    await user.apiLogin();
    const paymentEvent = user.eventTypes.find((item) => item.slug === "paid");
    if (!paymentEvent) {
      throw new Error("No payment event found");
    }

    await prisma.credential.createMany({
      data: [
        {
          // paypal was removed from the app store; mock-payment-app is the other
          // payment app still installable, and what matters here is that two of them
          // are mutually exclusive.
          type: "mock-payment-app_payment",
          appId: "mock-payment-app",
          userId: user.id,
          key: {},
        },
        {
          type: "stripe_payment",
          appId: "stripe",
          userId: user.id,
          key: {
            scope: "read_write",
            livemode: false,
            token_type: "bearer",
            access_token: "sk_test_randomString",
            refresh_token: "rt_randomString",
            stripe_user_id: "acct_randomString",
            default_currency: "usd",
            stripe_publishable_key: "pk_test_randomString",
          },
        },
      ],
    });

    await goToAppsTab(page, paymentEvent?.id);

    await page.getByTestId("mock-payment-app-app-switch").click();
    await page.getByTestId("mock-payment-app-price-input").fill("100");
    await page.getByTestId("mock-payment-app-currency-select").first().click();
    await page.getByTestId("select-option-MXN").click();
    // await page.locator(".mb-1 > .bg-default > div > div:nth-child(2)").first().click();
    // await page.getByText("$MXNCurrencyMexican pesoPayment option").click();
    await page.getByTestId("update-eventtype").click();

    // Need to wait for the DB to be updated
    await page.waitForResponse((res) => res.url().includes("update") && res.status() === 200);

    const mockAppPrice = await prisma.eventType.findFirst({
      where: {
        id: paymentEvent.id,
      },
      select: {
        price: true,
      },
    });

    expect(mockAppPrice?.price).toEqual(10000);

    await page.getByTestId("mock-payment-app-app-switch").click();
    await page.getByTestId("stripe-app-switch").click();
    await page.getByTestId("stripe-price-input").fill("200");
    await page.getByTestId("update-eventtype").click();

    // Need to wait for the DB to be updated
    await page.waitForResponse((res) => res.url().includes("update") && res.status() === 200);

    const stripePrice = await prisma.eventType.findFirst({
      where: {
        id: paymentEvent.id,
      },
      select: {
        price: true,
      },
    });

    expect(stripePrice?.price).toEqual(20000);
  });
});
