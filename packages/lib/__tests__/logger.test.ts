import { describe, expect, it } from "vitest";

import { isSillyEnabled } from "../logger";

describe("isSillyEnabled (PERF-002)", () => {
  it("returns true when minLevel <= 0", () => {
    expect(isSillyEnabled({ settings: { minLevel: 0 } } as never)).toBe(true);
    expect(isSillyEnabled({ settings: { minLevel: -1 } } as never)).toBe(true);
  });

  it("returns false at the default warn level (4)", () => {
    expect(isSillyEnabled({ settings: { minLevel: 4 } } as never)).toBe(false);
  });

  it("returns false at info, debug, trace (>0)", () => {
    expect(isSillyEnabled({ settings: { minLevel: 1 } } as never)).toBe(false);
    expect(isSillyEnabled({ settings: { minLevel: 2 } } as never)).toBe(false);
    expect(isSillyEnabled({ settings: { minLevel: 3 } } as never)).toBe(false);
  });

  it("defaults to false when minLevel is missing", () => {
    expect(isSillyEnabled({ settings: {} } as never)).toBe(false);
  });
});
