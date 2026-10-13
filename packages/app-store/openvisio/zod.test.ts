import { describe, expect, it } from "vitest";

import { DEFAULT_MEETING_URL_PATTERN, appKeysSchema } from "./zod";

const REQUIRED_KEYS = {
  apiBaseUrl: "https://visio.clever.cloud",
  clientId: "client-id",
  clientSecret: "client-secret",
};

describe("appKeysSchema", () => {
  it("falls back to the default pattern when the key is absent", () => {
    expect(appKeysSchema.parse(REQUIRED_KEYS).meetingUrlPattern).toBe(DEFAULT_MEETING_URL_PATTERN);
  });

  // The admin app form seeds every key with "", so this is the shape actually stored when
  // an administrator fills in the three required keys and leaves this one untouched.
  // Without normalisation it would survive as "" and yield a booking with no meeting link.
  it.each(["", "   "])("falls back to the default pattern when the key is blank (%j)", (blank) => {
    expect(appKeysSchema.parse({ ...REQUIRED_KEYS, meetingUrlPattern: blank }).meetingUrlPattern).toBe(
      DEFAULT_MEETING_URL_PATTERN
    );
  });

  it("keeps a pattern the administrator did provide", () => {
    const parsed = appKeysSchema.parse({
      ...REQUIRED_KEYS,
      meetingUrlPattern: "https://meet.clever-cloud.com/{slug}",
    });
    expect(parsed.meetingUrlPattern).toBe("https://meet.clever-cloud.com/{slug}");
  });

  it("rejects a non-URL api base", () => {
    expect(() => appKeysSchema.parse({ ...REQUIRED_KEYS, apiBaseUrl: "not-a-url" })).toThrow();
  });

  it.each(["clientId", "clientSecret"])("requires %s", (key) => {
    expect(() => appKeysSchema.parse({ ...REQUIRED_KEYS, [key]: "" })).toThrow();
  });
});
