import { describe, expect, it, vi } from "vitest";
import { generateHashedLink } from "./generateHashedLink";

describe("generateHashedLink", () => {
  it("returns different links for the same event type in the same millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-01T10:00:00.000Z"));
    try {
      expect(generateHashedLink(42)).not.toBe(generateHashedLink(42));
    } finally {
      vi.useRealTimers();
    }
  });

  it("works where crypto.randomUUID is missing (browser outside a secure context)", () => {
    const { getRandomValues } = globalThis.crypto;
    vi.stubGlobal("crypto", { getRandomValues: getRandomValues.bind(globalThis.crypto) });
    try {
      expect(generateHashedLink(42)).toMatch(/^[1-9A-HJ-NP-Za-km-z]{21,22}$/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
