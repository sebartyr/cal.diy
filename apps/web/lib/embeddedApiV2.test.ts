import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("embeddedApiV2", () => {
  let dir: string;

  beforeEach(() => {
    vi.resetModules();
    dir = mkdtempSync(path.join(tmpdir(), "embedded-api-v2-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const load = () => import("./embeddedApiV2");

  it("is enabled only by API_V2_EMBEDDED=true", async () => {
    const { isApiV2Embedded } = await load();
    expect(isApiV2Embedded({ API_V2_EMBEDDED: "true" })).toBe(true);
    expect(isApiV2Embedded({ API_V2_EMBEDDED: "1" })).toBe(false);
    expect(isApiV2Embedded({})).toBe(false);
  });

  it.each([
    ["/api/v2/bookings", "/v2/bookings"],
    ["/api/v2/bookings?take=10&ids[]=1", "/v2/bookings?take=10&ids[]=1"],
    ["/api/v2", "/v2"],
    ["/api/v2?x=1", "/v2?x=1"],
    ["/api/v20/bookings", "/api/v20/bookings"],
    ["/api/trpc/v2", "/api/trpc/v2"],
  ])("maps %s to the API's own path %s", async (url, expected) => {
    const { toApiV2Url } = await load();
    expect(toApiV2Url(url)).toBe(expected);
  });

  it("loads the default export of the compiled entry once", async () => {
    const entry = path.join(dir, "main.js");
    writeFileSync(
      entry,
      "globalThis.__apiV2Loads = (globalThis.__apiV2Loads ?? 0) + 1; exports.default = () => 'handled';"
    );
    const { loadApiV2Handler } = await load();

    const handler = await loadApiV2Handler(entry);
    expect(await loadApiV2Handler(entry)).toBe(handler);
    expect(Reflect.get(globalThis, "__apiV2Loads")).toBe(1);
    Reflect.deleteProperty(globalThis, "__apiV2Loads");
  });

  it("rejects an entry without a default handler, then retries on the next call", async () => {
    const entry = path.join(dir, "main.js");
    writeFileSync(entry, "exports.notAHandler = 1;");
    const { loadApiV2Handler } = await load();

    await expect(loadApiV2Handler(entry)).rejects.toThrow("has no default request handler");

    writeFileSync(path.join(dir, "fixed.js"), "exports.default = () => 'handled';");
    await expect(loadApiV2Handler(path.join(dir, "fixed.js"))).resolves.toBeTypeOf("function");
  });

  it("rejects when the entry does not exist", async () => {
    const { loadApiV2Handler } = await load();
    await expect(loadApiV2Handler(path.join(dir, "missing.js"))).rejects.toThrow();
  });
});
