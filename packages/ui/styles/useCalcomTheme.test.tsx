import { renderHook } from "@testing-library/react-hooks";
import { afterEach, describe, expect, it } from "vitest";
import { useCalcomTheme } from "./useCalcomTheme";

describe("useCalcomTheme", () => {
  afterEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
  });

  it("overwrites a previous accent when the next theme provides explicit values", () => {
    const root = document.documentElement;
    root.className = "light";
    const initialTheme: Record<string, Record<string, string>> = { light: { "cal-accent": "#0040ff" } };
    const { rerender } = renderHook((theme) => useCalcomTheme(theme), { initialProps: initialTheme });
    expect(root.style.getPropertyValue("--cal-accent")).toBe("#0040ff");

    root.className = "dark";
    rerender({ light: { "cal-accent": "#0040ff" }, dark: { "cal-accent": "#f2546a" } });

    expect(root.style.getPropertyValue("--cal-accent")).toBe("#f2546a");
  });
});
