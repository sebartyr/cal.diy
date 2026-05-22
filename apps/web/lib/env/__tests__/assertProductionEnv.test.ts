import { describe, expect, it } from "vitest";
import { checkProductionEnv, formatAssertProductionEnvError } from "../assertProductionEnv";

const fullProdEnv: Record<string, string | undefined> = {
  NODE_ENV: "production",
  NEXT_RUNTIME: "nodejs",
  DATABASE_URL: "postgresql://localhost/cal",
  NEXTAUTH_SECRET: "x".repeat(32),
  CALENDSO_ENCRYPTION_KEY: "y".repeat(32),
  UNKEY_ROOT_KEY: "unkey_xxxxxxxxxx",
};

describe("checkProductionEnv", () => {
  it("passes when NODE_ENV is not production", () => {
    expect(checkProductionEnv({})).toEqual({ ok: true });
    expect(checkProductionEnv({ NODE_ENV: "development" })).toEqual({ ok: true });
    expect(checkProductionEnv({ NODE_ENV: "test" })).toEqual({ ok: true });
  });

  it("skips the edge runtime", () => {
    const r = checkProductionEnv({ NODE_ENV: "production", NEXT_RUNTIME: "edge" });
    expect(r.ok).toBe(true);
  });

  it("passes when every required var is present and not a placeholder", () => {
    expect(checkProductionEnv(fullProdEnv)).toEqual({ ok: true });
  });

  it("flags missing DATABASE_URL", () => {
    const r = checkProductionEnv({ ...fullProdEnv, DATABASE_URL: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("DATABASE_URL");
  });

  it("flags missing UNKEY_ROOT_KEY", () => {
    const r = checkProductionEnv({ ...fullProdEnv, UNKEY_ROOT_KEY: undefined });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain("UNKEY_ROOT_KEY");
  });

  it("flags placeholder value 'secret'", () => {
    const r = checkProductionEnv({ ...fullProdEnv, NEXTAUTH_SECRET: "secret" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.placeholders).toContain("NEXTAUTH_SECRET");
  });

  it("flags too-short CALENDSO_ENCRYPTION_KEY", () => {
    const r = checkProductionEnv({ ...fullProdEnv, CALENDSO_ENCRYPTION_KEY: "short" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.placeholders.some((p) => p.includes("CALENDSO_ENCRYPTION_KEY"))).toBe(true);
  });

  it("aggregates multiple problems", () => {
    const r = checkProductionEnv({
      NODE_ENV: "production",
      NEXT_RUNTIME: "nodejs",
      DATABASE_URL: "",
      NEXTAUTH_SECRET: "secret",
      CALENDSO_ENCRYPTION_KEY: "short",
      UNKEY_ROOT_KEY: "",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("DATABASE_URL");
      expect(r.missing).toContain("UNKEY_ROOT_KEY");
      expect(r.placeholders).toContain("NEXTAUTH_SECRET");
    }
  });
});

describe("formatAssertProductionEnvError", () => {
  it("renders a single-line error mentioning all problems", () => {
    const message = formatAssertProductionEnvError({
      missing: ["DATABASE_URL", "UNKEY_ROOT_KEY"],
      placeholders: ["NEXTAUTH_SECRET"],
    });
    expect(message).toMatch(/Refusing to boot in production/);
    expect(message).toMatch(/missing: DATABASE_URL, UNKEY_ROOT_KEY/);
    expect(message).toMatch(/placeholder.*NEXTAUTH_SECRET/);
    expect(message).toMatch(/OPS_TODO/);
  });
});
