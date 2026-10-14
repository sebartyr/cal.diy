import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { appStoreMetadata } from "../appStoreMetaData";

const MIGRATION = join(
  __dirname,
  "../../prisma/migrations/20261014130000_drop_removed_app_rows/migration.sql"
);

describe("drop_removed_app_rows migration", () => {
  it("never deletes the App row of an app that is still in the app store", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const removedSlugs = [...sql.matchAll(/^ {2}\('([^']+)'\)/gm)].map(([, slug]) => slug);
    const currentSlugs = Object.values(appStoreMetadata).map((app) => app.slug);

    expect(removedSlugs.length).toBeGreaterThan(0);
    expect(removedSlugs.filter((slug) => currentSlugs.includes(slug))).toEqual([]);
  });
});
