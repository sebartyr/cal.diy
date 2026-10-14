import { describe, expect, it } from "vitest";
import { getLegacyVideoRedirectUrl } from "./getLegacyVideoRedirectUrl";

describe("getLegacyVideoRedirectUrl", () => {
  it("redirects to the most recent meeting URL of the booking", () => {
    expect(
      getLegacyVideoRedirectUrl({
        uid: "abc",
        references: [
          { id: 1, meetingUrl: "https://cal.daily.co/old-room" },
          { id: 2, meetingUrl: "https://meet.jit.si/cal/new-room" },
        ],
      })
    ).toBe("https://meet.jit.si/cal/new-room");
  });

  it("falls back to the booking page when no reference has a usable URL", () => {
    expect(
      getLegacyVideoRedirectUrl({
        uid: "abc",
        references: [
          { id: 1, meetingUrl: null },
          { id: 2, meetingUrl: "javascript:alert(1)" },
        ],
      })
    ).toBe("/booking/abc");
  });

  it("falls back to the booking page when the booking has no video reference", () => {
    expect(getLegacyVideoRedirectUrl({ uid: "a b", references: [] })).toBe("/booking/a%20b");
  });
});
