import { describe, expect, it } from "vitest";

import { isPasswordValid } from "../isPasswordValid";

describe("isPasswordValid — SEC-005 floor bumped to 12", () => {
  it("rejects an 11-char password that satisfied the old (>=7) floor", () => {
    expect(isPasswordValid("Aa1bbbbcccc")).toBe(false);
  });

  it("accepts a 12-char password with cap+low+num", () => {
    expect(isPasswordValid("Aa1bbbbccccc")).toBe(true);
  });

  it("still requires a digit", () => {
    expect(isPasswordValid("AbcdefghijklM")).toBe(false);
  });

  it("still requires both cases", () => {
    expect(isPasswordValid("aaaaaaaaaaa1")).toBe(false);
    expect(isPasswordValid("AAAAAAAAAAA1")).toBe(false);
  });

  it("strict mode keeps the >14 length requirement", () => {
    // 14 chars: meets non-strict but not strict
    expect(isPasswordValid("Aaaaaaaaaaaaa1", true, true)).toEqual({
      caplow: true,
      num: true,
      min: false,
      admin_min: false,
    });
    // 15 chars: meets strict
    expect(isPasswordValid("Aaaaaaaaaaaaaa1", true, true)).toEqual({
      caplow: true,
      num: true,
      min: true,
      admin_min: true,
    });
  });

  it("breakdown shape unchanged for non-strict", () => {
    expect(isPasswordValid("Short1A", true)).toEqual({
      caplow: true,
      num: true,
      min: false,
    });
  });
});
