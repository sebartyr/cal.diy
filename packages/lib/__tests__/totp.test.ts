import { generateSync, stringToBytes } from "otplib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { totpAuthenticatorCheck, totpRawCheck } from "../totp";

// Expected codes were generated with otplib 12 so that secrets already stored for
// users keep producing the same tokens after the otplib 13 upgrade.
const BASE32_SECRET = "H5CQCOTREEXQUCISFITU63BCGJ4DWYCX";
// md5(email + CALENDSO_ENCRYPTION_KEY) as hex, the shape used for email verification codes
const RAW_SECRET = "d98aedc5e395fdd24887c596f470000e";

const setEpoch = (seconds: number) => vi.setSystemTime(new Date(seconds * 1000));

describe("totpAuthenticatorCheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Inside the 30s period [1700000010, 1700000040)
    setEpoch(1700000020);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts the token of the current period", () => {
    expect(totpAuthenticatorCheck("116207", BASE32_SECRET)).toBe(true);
  });

  it("accepts the token of the previous period", () => {
    expect(totpAuthenticatorCheck("385145", BASE32_SECRET)).toBe(true);
  });

  it("rejects the token of the next period", () => {
    expect(totpAuthenticatorCheck("316476", BASE32_SECRET)).toBe(false);
  });

  it("rejects the token from two periods ago", () => {
    expect(totpAuthenticatorCheck("001975", BASE32_SECRET)).toBe(false);
  });

  it("widens the accepted range with a larger window", () => {
    expect(totpAuthenticatorCheck("001975", BASE32_SECRET, { window: [2, 0] })).toBe(true);
    expect(totpAuthenticatorCheck("316476", BASE32_SECRET, { window: 1 })).toBe(true);
  });

  it("returns false instead of throwing on malformed input", () => {
    expect(totpAuthenticatorCheck("abcdef", BASE32_SECRET)).toBe(false);
    expect(totpAuthenticatorCheck("12345", BASE32_SECRET)).toBe(false);
    expect(totpAuthenticatorCheck("116207", "not-base32!")).toBe(false);
  });
});

describe("totpRawCheck", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Inside the 900s period [1700000100, 1700001000)
    setEpoch(1700000500);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts the token of the current 15-minute period", () => {
    expect(totpRawCheck("755114", RAW_SECRET, { step: 900 })).toBe(true);
  });

  it("accepts the token of the previous 15-minute period", () => {
    expect(totpRawCheck("341928", RAW_SECRET, { step: 900 })).toBe(true);
  });

  it("rejects the token of the next 15-minute period", () => {
    expect(totpRawCheck("153785", RAW_SECRET, { step: 900 })).toBe(false);
  });

  it("accepts codes generated the way verifyEmail generates them", () => {
    const code = generateSync({ secret: stringToBytes(RAW_SECRET), period: 900 });

    expect(code).toBe("755114");
    expect(totpRawCheck(code, RAW_SECRET, { step: 900 })).toBe(true);
  });
});
