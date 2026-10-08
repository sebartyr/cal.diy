import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVideoToken, verifyVideoToken } from "./videoTokens";

function generateOrFail(recordingId: string, expiresInMinutes: number): string {
  const token = generateVideoToken(recordingId, expiresInMinutes);
  if (!token) throw new Error("expected a token: CAL_VIDEO_RECORDING_TOKEN_SECRET should be set");
  return token;
}

describe("videoTokens", () => {
  beforeEach(() => {
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", "recording-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a token it generated", () => {
    const token = generateOrFail("rec_123", 5);
    expect(verifyVideoToken(token)).toEqual({ valid: true, recordingId: "rec_123" });
  });

  it("rejects a tampered recording id", () => {
    const [, expires, hmac] = generateOrFail("rec_123", 5).split(":");
    expect(verifyVideoToken(`rec_456:${expires}:${hmac}`)).toEqual({ valid: false });
  });

  it("rejects a token signed with another secret", () => {
    const token = generateOrFail("rec_123", 5);
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", "other-secret");
    expect(verifyVideoToken(token)).toEqual({ valid: false });
  });

  it("rejects a missing or empty signature", () => {
    const [recordingId, expires] = generateOrFail("rec_123", 5).split(":");
    expect(verifyVideoToken(`${recordingId}:${expires}`)).toEqual({ valid: false });
    expect(verifyVideoToken(`${recordingId}:${expires}:`)).toEqual({ valid: false });
  });

  it("rejects a token without a numeric expiry", () => {
    const [recordingId, , hmac] = generateOrFail("rec_123", 5).split(":");
    expect(verifyVideoToken(`${recordingId}:never:${hmac}`)).toEqual({ valid: false });
  });

  it("rejects an expired token", () => {
    const token = generateOrFail("rec_123", -1);
    expect(verifyVideoToken(token)).toEqual({ valid: false });
  });

  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("fails closed when the secret is %s", (_label, value) => {
    const token = generateOrFail("rec_123", 5);
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", value);

    expect(generateVideoToken("rec_123", 5)).toBeNull();
    expect(verifyVideoToken(token)).toEqual({ valid: false });
  });

  it("does not accept tokens signed with the former hard-coded default secret", () => {
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", "default-secret-change-me");
    const forged = generateOrFail("rec_123", 5);
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", undefined);
    expect(verifyVideoToken(forged)).toEqual({ valid: false });
  });
});
