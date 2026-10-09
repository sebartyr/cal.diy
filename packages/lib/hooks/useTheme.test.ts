import { renderHook } from "@testing-library/react-hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useTheme from "./useTheme";

const setTheme = vi.fn();
let activeTheme: string | undefined;
let embedTheme: string | null;

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme, forcedTheme: undefined, theme: activeTheme }),
}));

vi.mock("@calcom/embed-core/embed-iframe", () => ({
  useEmbedTheme: () => embedTheme,
}));

describe("useTheme", () => {
  beforeEach(() => {
    setTheme.mockReset();
    activeTheme = undefined;
    embedTheme = null;
    window.localStorage.clear();
  });

  it("switches back to system when the preference is null, even if a forced theme was persisted", () => {
    window.localStorage.setItem("app-theme", "light");
    activeTheme = "light";

    renderHook(() => useTheme(null));

    expect(setTheme).toHaveBeenCalledWith("system");
  });

  it("applies an explicit theme", () => {
    activeTheme = "system";

    renderHook(() => useTheme("dark"));

    expect(setTheme).toHaveBeenCalledWith("dark");
  });

  it("does nothing while the preference is still loading", () => {
    renderHook(() => useTheme(undefined));

    expect(setTheme).not.toHaveBeenCalled();
  });

  it("does not reapply the theme that is already active", () => {
    activeTheme = "system";

    renderHook(() => useTheme(null));

    expect(setTheme).not.toHaveBeenCalled();
  });

  it("gives precedence to the embed theme, mapping auto to system", () => {
    embedTheme = "auto";
    activeTheme = "light";

    renderHook(() => useTheme("dark"));

    expect(setTheme).toHaveBeenCalledWith("system");
  });

  it("only reads values in getOnly mode", () => {
    const { result } = renderHook(() => useTheme(null, true));

    expect(setTheme).not.toHaveBeenCalled();
    expect(result.current).toEqual({
      resolvedTheme: "light",
      forcedTheme: undefined,
      activeTheme: undefined,
    });
  });
});
