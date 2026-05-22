import { describe, expect, it } from "vitest";

import { MAGIC_LINK_MAX_AGE_SECONDS } from "../magicLinkMaxAge";

describe("MAGIC_LINK_MAX_AGE_SECONDS (SEC-008)", () => {
  it("is exactly 10 minutes in seconds", () => {
    expect(MAGIC_LINK_MAX_AGE_SECONDS).toBe(600);
  });

  it("is not the old 10-hour value (36000s)", () => {
    expect(MAGIC_LINK_MAX_AGE_SECONDS).not.toBe(36000);
  });

  it("is at most 15 minutes (defensive ceiling)", () => {
    expect(MAGIC_LINK_MAX_AGE_SECONDS).toBeLessThanOrEqual(15 * 60);
  });

  it("is at least 60 seconds (sanity)", () => {
    expect(MAGIC_LINK_MAX_AGE_SECONDS).toBeGreaterThanOrEqual(60);
  });
});
