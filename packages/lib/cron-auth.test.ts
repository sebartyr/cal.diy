import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isAuthorizedCronApiKey,
  isAuthorizedCronBearer,
  isAuthorizedCronRequest,
  safeCompareSecret,
} from "./cron-auth";

describe("safeCompareSecret", () => {
  it("matches identical secrets", () => {
    expect(safeCompareSecret("s3cret", "s3cret")).toBe(true);
  });

  it("rejects different secrets, including different lengths", () => {
    expect(safeCompareSecret("s3cret", "s3creT")).toBe(false);
    expect(safeCompareSecret("s3cret", "s3cret-longer")).toBe(false);
  });

  it("fails closed when the expected secret is empty or undefined", () => {
    expect(safeCompareSecret("", "")).toBe(false);
    expect(safeCompareSecret("undefined", undefined)).toBe(false);
    expect(safeCompareSecret(null, undefined)).toBe(false);
  });

  it("rejects a missing provided value", () => {
    expect(safeCompareSecret(null, "s3cret")).toBe(false);
    expect(safeCompareSecret(undefined, "s3cret")).toBe(false);
    expect(safeCompareSecret("", "s3cret")).toBe(false);
  });
});

describe("isAuthorizedCronRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the CRON_API_KEY", () => {
    vi.stubEnv("CRON_API_KEY", "api-key");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect(isAuthorizedCronRequest("api-key")).toBe(true);
  });

  it("accepts Bearer CRON_SECRET", () => {
    vi.stubEnv("CRON_API_KEY", "api-key");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect(isAuthorizedCronRequest("Bearer cron-secret")).toBe(true);
  });

  it("rejects wrong values", () => {
    vi.stubEnv("CRON_API_KEY", "api-key");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect(isAuthorizedCronRequest("Bearer api-key")).toBe(false);
    expect(isAuthorizedCronRequest("cron-secret")).toBe(false);
    expect(isAuthorizedCronRequest(null)).toBe(false);
  });

  it("rejects 'Bearer undefined' and empty values when secrets are unset", () => {
    vi.stubEnv("CRON_API_KEY", undefined);
    vi.stubEnv("CRON_SECRET", undefined);
    expect(isAuthorizedCronRequest("Bearer undefined")).toBe(false);
    expect(isAuthorizedCronRequest("undefined")).toBe(false);
    expect(isAuthorizedCronRequest("")).toBe(false);
    expect(isAuthorizedCronRequest(null)).toBe(false);
  });

  it("rejects 'Bearer ' and empty values when secrets are set to empty strings", () => {
    vi.stubEnv("CRON_API_KEY", "");
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedCronRequest("Bearer ")).toBe(false);
    expect(isAuthorizedCronRequest("")).toBe(false);
  });
});

describe("isAuthorizedCronBearer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts Bearer CRON_SECRET only", () => {
    vi.stubEnv("CRON_API_KEY", "api-key");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect(isAuthorizedCronBearer("Bearer cron-secret")).toBe(true);
    expect(isAuthorizedCronBearer("api-key")).toBe(false);
  });

  it("rejects 'Bearer undefined' when CRON_SECRET is unset or empty", () => {
    vi.stubEnv("CRON_SECRET", undefined);
    expect(isAuthorizedCronBearer("Bearer undefined")).toBe(false);
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedCronBearer("Bearer ")).toBe(false);
  });
});

describe("isAuthorizedCronApiKey", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the CRON_API_KEY only", () => {
    vi.stubEnv("CRON_API_KEY", "api-key");
    vi.stubEnv("CRON_SECRET", "cron-secret");
    expect(isAuthorizedCronApiKey("api-key")).toBe(true);
    expect(isAuthorizedCronApiKey("Bearer cron-secret")).toBe(false);
    expect(isAuthorizedCronApiKey("api-key2")).toBe(false);
  });

  it("fails closed when CRON_API_KEY is unset or empty", () => {
    vi.stubEnv("CRON_API_KEY", undefined);
    expect(isAuthorizedCronApiKey("undefined")).toBe(false);
    expect(isAuthorizedCronApiKey(null)).toBe(false);
    vi.stubEnv("CRON_API_KEY", "");
    expect(isAuthorizedCronApiKey("")).toBe(false);
  });
});
