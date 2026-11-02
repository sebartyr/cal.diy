import loadConfig from "./app";

// DATABASE_URL is declared read-only on process.env elsewhere in the monorepo.
const env: Record<string, string | undefined> = process.env;

describe("loadConfig database URLs", () => {
  const saved = {
    DATABASE_URL: env.DATABASE_URL,
    DATABASE_READ_URL: env.DATABASE_READ_URL,
    DATABASE_WRITE_URL: env.DATABASE_WRITE_URL,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  });

  it("uses DATABASE_URL when no read or write URL is set", () => {
    env.DATABASE_URL = "postgresql://single/db";
    delete env.DATABASE_READ_URL;
    delete env.DATABASE_WRITE_URL;

    const { db } = loadConfig();

    expect(db.readUrl).toBe("postgresql://single/db");
    expect(db.writeUrl).toBe("postgresql://single/db");
  });

  it("prefers the dedicated read and write URLs when set", () => {
    env.DATABASE_URL = "postgresql://single/db";
    env.DATABASE_READ_URL = "postgresql://replica/db";
    env.DATABASE_WRITE_URL = "postgresql://primary/db";

    const { db } = loadConfig();

    expect(db.readUrl).toBe("postgresql://replica/db");
    expect(db.writeUrl).toBe("postgresql://primary/db");
  });

  it("fails when no database URL is set at all", () => {
    delete env.DATABASE_URL;
    delete env.DATABASE_READ_URL;
    delete env.DATABASE_WRITE_URL;

    expect(() => loadConfig()).toThrow("Missing environment variable: DATABASE_URL.");
  });
});
