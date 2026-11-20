import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuidV4 } from "./randomUuidV4";

describe("randomUuidV4", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an RFC 4122 version 4 UUID", () => {
    expect(randomUuidV4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("works where crypto.randomUUID is missing (browser outside a secure context)", () => {
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: getRandomValues.bind(globalThis.crypto) });

    expect(randomUuidV4()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does not repeat over many generations", () => {
    expect(new Set(Array.from({ length: 10_000 }, randomUuidV4)).size).toBe(10_000);
  });
});
