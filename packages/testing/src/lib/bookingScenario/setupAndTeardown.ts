import { enableEmailFeature, mockNoTranslations } from "./bookingScenario";
import process from "node:process";
import { afterEach, beforeEach } from "vitest";

export function setupAndTeardown() {
  beforeEach(() => {
    // Required to able to generate token in email in some cases
    //@ts-expect-error - It is a readonly variable
    process.env.CALENDSO_ENCRYPTION_KEY = "abcdefghjnmkljhjklmnhjklkmnbhjui";
    //@ts-expect-error - It is a readonly variable
    process.env.STRIPE_WEBHOOK_SECRET = "MOCK_STRIPE_WEBHOOK_SECRET";

    // Ensure that Rate Limiting isn't enforced for tests
    process.env.RATE_LIMIT_STORE = "memory";
    mockNoTranslations();
    // mockEnableEmailFeature();
    enableEmailFeature();
    globalThis.testEmails = [];
    fetchMock.resetMocks();
  });
  afterEach(() => {
    //@ts-expect-error - It is a readonly variable
    delete process.env.CALENDSO_ENCRYPTION_KEY;
    //@ts-expect-error - It is a readonly variable
    delete process.env.STRIPE_WEBHOOK_SECRET;
    globalThis.testEmails = [];
    fetchMock.resetMocks();
  });
}
