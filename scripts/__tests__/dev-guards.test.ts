import { describe, expect, it } from "vitest";
import { checkDevDatabase } from "../lib/assert-dev-database";

describe("checkDevDatabase", () => {
  it("accepts localhost", () => {
    const r = checkDevDatabase({ DATABASE_URL: "postgresql://u:p@localhost:5432/cal" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hostname).toBe("localhost");
  });

  it("accepts 127.0.0.1", () => {
    const r = checkDevDatabase({ DATABASE_URL: "postgresql://u:p@127.0.0.1/cal" });
    expect(r.ok).toBe(true);
  });

  it("accepts ::1 (IPv6 loopback, stripped of brackets)", () => {
    const r = checkDevDatabase({ DATABASE_URL: "postgresql://u:p@[::1]:5432/cal" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hostname).toBe("::1");
  });

  it("accepts docker-compose hostname 'db'", () => {
    const r = checkDevDatabase({ DATABASE_URL: "postgresql://u:p@db:5432/cal" });
    expect(r.ok).toBe(true);
  });

  it("accepts docker-compose hostname 'postgres'", () => {
    const r = checkDevDatabase({ DATABASE_URL: "postgresql://u:p@postgres:5432/cal" });
    expect(r.ok).toBe(true);
  });

  it("refuses Clever Cloud hosted hostname (bxxx-postgresql.services.clever-cloud.com)", () => {
    const r = checkDevDatabase({
      DATABASE_URL: "postgresql://u_xxx:p@b1234abcd-postgresql.services.clever-cloud.com:5432/b1234abcd",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("clever-cloud.com");
  });

  it("refuses generic clever-cloud.com hostname", () => {
    const r = checkDevDatabase({
      DATABASE_URL: "postgresql://u:p@postgresql.services.clever-cloud.com:5432/cal",
    });
    expect(r.ok).toBe(false);
  });

  it("refuses RDS hostnames (none of them contain 'prod')", () => {
    const r = checkDevDatabase({
      DATABASE_URL: "postgresql://u:p@my-instance.cz1abc.eu-west-1.rds.amazonaws.com:5432/cal",
    });
    expect(r.ok).toBe(false);
  });

  it("refuses when NODE_ENV=production even with localhost", () => {
    const r = checkDevDatabase({
      DATABASE_URL: "postgresql://u:p@localhost:5432/cal",
      NODE_ENV: "production",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("production");
  });

  it("refuses missing DATABASE_URL", () => {
    const r = checkDevDatabase({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("DATABASE_URL");
  });

  it("refuses malformed DATABASE_URL", () => {
    const r = checkDevDatabase({ DATABASE_URL: "not a url" });
    expect(r.ok).toBe(false);
  });

  it("accepts hosted hostname when ALLOW_DEV_DB_HOSTNAME matches exactly", () => {
    const r = checkDevDatabase({
      DATABASE_URL:
        "postgresql://u:p@b1234abcd-postgresql.services.clever-cloud.com:5432/b1234abcd",
      ALLOW_DEV_DB_HOSTNAME: "b1234abcd-postgresql.services.clever-cloud.com",
    });
    expect(r.ok).toBe(true);
  });

  it("refuses hosted hostname when ALLOW_DEV_DB_HOSTNAME mismatches", () => {
    const r = checkDevDatabase({
      DATABASE_URL:
        "postgresql://u:p@b1234abcd-postgresql.services.clever-cloud.com:5432/b1234abcd",
      ALLOW_DEV_DB_HOSTNAME: "b9999zzzz-postgresql.services.clever-cloud.com",
    });
    expect(r.ok).toBe(false);
  });

  it("refuses hosted hostname when ALLOW_DEV_DB_HOSTNAME is empty", () => {
    const r = checkDevDatabase({
      DATABASE_URL:
        "postgresql://u:p@b1234abcd-postgresql.services.clever-cloud.com:5432/b1234abcd",
      ALLOW_DEV_DB_HOSTNAME: "",
    });
    expect(r.ok).toBe(false);
  });

  it("override does not bypass NODE_ENV=production", () => {
    const r = checkDevDatabase({
      DATABASE_URL: "postgresql://u:p@b1234.services.clever-cloud.com:5432/cal",
      ALLOW_DEV_DB_HOSTNAME: "b1234.services.clever-cloud.com",
      NODE_ENV: "production",
    });
    expect(r.ok).toBe(false);
  });
});
