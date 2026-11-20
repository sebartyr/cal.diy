import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// PermissionsGuard only reads which permissions an OAuth client has; proving who the caller is stays the
// job of ApiAuthGuard. A route declaring @Permissions without it would trust whatever credentials it is sent.
const SRC_DIR = join(__dirname, "../../../..");
const STRICT_AUTH_GUARD = /(?<!Optional)\bApiAuthGuard\b/;

function listControllers(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listControllers(path);
    return entry.name.endsWith(".controller.ts") ? [path] : [];
  });
}

function decoratorBlockAround(lines: string[], index: number): string {
  let start = index;
  while (start > 0 && lines[start - 1].trim().startsWith("@")) start--;
  let end = index;
  while (end < lines.length - 1 && !/^\s*(async\s+)?\w+\s*\(/.test(lines[end + 1])) end++;
  return lines.slice(start, end + 2).join("\n");
}

function routesWithPermissionsButNoAuthGuard(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const classIndex = source.indexOf("export class");
  if (classIndex === -1 || STRICT_AUTH_GUARD.test(source.slice(0, classIndex).split("@Controller")[1] ?? "")) {
    return [];
  }
  const lines = source.slice(classIndex).split("\n");
  return lines.flatMap((line, index) => {
    if (!line.trim().startsWith("@Permissions(")) return [];
    const block = decoratorBlockAround(lines, index);
    return STRICT_AUTH_GUARD.test(block) ? [] : [`${relative(SRC_DIR, file)}: ${block.split("\n").pop()?.trim()}`];
  });
}

describe("routes declaring @Permissions", () => {
  it("all use ApiAuthGuard", () => {
    const controllers = listControllers(SRC_DIR);
    expect(controllers.length).toBeGreaterThan(20);

    expect(controllers.flatMap(routesWithPermissionsButNoAuthGuard)).toEqual([]);
  });
});
