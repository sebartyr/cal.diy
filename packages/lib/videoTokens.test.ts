import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateVideoToken, verifyVideoToken } from "./videoTokens";

describe("videoTokens", () => {
  beforeEach(() => {
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", "recording-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("verifies a token it generated", () => {
    const token = generateVideoToken("rec_123", 5);
    expect(verifyVideoToken(token)).toEqual({ valid: true, recordingId: "rec_123" });
  });

  it("rejects a tampered recording id", () => {
    const [, expires, hmac] = generateVideoToken("rec_123", 5).split(":");
    expect(verifyVideoToken(`rec_456:${expires}:${hmac}`)).toEqual({ valid: false });
  });

  it("rejects a token signed with another secret", () => {
    const token = generateVideoToken("rec_123", 5);
    vi.stubEnv("CAL_VIDEO_RECORDING_TOKEN_SECRET", "other-secret");
    expect(verifyVideoToken(token)).toEqual({ valid: false });
  });

  it("rejects a missing or empty signature", () => {
    const [recordingId, expires] = generateVideoToken("rec_123", 5).split(":");
    expect(verifyVideoToken(`${recordingId}:${expires}`)).toEqual({ valid: false });
    expect(verifyVideoToken(`${recordingId}:${expires}:`)).toEqual({ valid: false });
  });

  it("rejects an expired token", () => {
    const token = generateVideoToken("rec_123", -1);
    expect(verifyVideoToken(token)).toEqual({ valid: false });
  });
});
