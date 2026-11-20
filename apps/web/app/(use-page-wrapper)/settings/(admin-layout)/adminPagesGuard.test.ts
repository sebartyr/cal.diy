import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Layouts are not re-rendered on client-side navigation, so the layout check alone would keep serving
// admin pages to an account demoted or denied since (project rule: permission checks go in page.tsx).
const ADMIN_DIR = join(__dirname, "admin");

function listPages(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listPages(path);
    return entry.name === "page.tsx" ? [path] : [];
  });
}

describe("admin pages", () => {
  it("each server page calls requireSystemAdmin", () => {
    const pages = listPages(ADMIN_DIR);
    expect(pages.length).toBeGreaterThan(5);

    const unguarded = pages
      .filter((page) => {
        const source = readFileSync(page, "utf8");
        return !source.startsWith('"use client"') && !source.includes("await requireSystemAdmin()");
      })
      .map((page) => relative(ADMIN_DIR, page));

    expect(unguarded).toEqual([]);
  });
});
