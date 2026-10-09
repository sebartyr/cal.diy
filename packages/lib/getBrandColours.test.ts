import { renderHook } from "@testing-library/react-hooks";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_DARK_BRAND_COLOR, DEFAULT_LIGHT_BRAND_COLOR } from "./constants";
import useGetBrandingColours, { createColorMap, isCustomBrandColor } from "./getBrandColours";

vi.mock("@calcom/embed-core/embed-iframe", () => ({
  useBrandColors: () => ({}),
}));

describe("useGetBrandingColours", () => {
  it("should return the correct color values for given lightVal and darkVal", () => {
    const expectedResult = {
      light: {
        "50": "#fff3f3",
        "100": "#ffe8e8",
        "200": "#ffc5c5",
        "300": "#ffa2a2",
        "400": "#ff5c5c",
        "500": "#ff1616",
        "600": "#e61414",
        "700": "#bf1111",
        "800": "#990d0d",
        "900": "#7d0b0b",
      },
      dark: {
        "50": "#f2f5ff",
        "100": "#e6ecff",
        "200": "#bfcfff",
        "300": "#99b3ff",
        "400": "#4d79ff",
        "500": "#0040ff",
        "600": "#003ae6",
        "700": "#0030bf",
        "800": "#002699",
        "900": "#001f7d",
      },
      // ...
    };

    const lightMap = createColorMap("#ff1616");
    const darkMap = createColorMap("#0040ff");

    expect(lightMap).toEqual(expectedResult.light);
    expect(darkMap).toEqual(expectedResult.dark);
  });
});

describe("isCustomBrandColor", () => {
  it("treats the current defaults as not custom, regardless of case", () => {
    expect(isCustomBrandColor(DEFAULT_LIGHT_BRAND_COLOR, false)).toBe(false);
    expect(isCustomBrandColor(DEFAULT_DARK_BRAND_COLOR.toUpperCase(), true)).toBe(false);
  });

  it("treats the legacy defaults persisted by older appearance settings as not custom", () => {
    expect(isCustomBrandColor("#292929", false)).toBe(false);
    expect(isCustomBrandColor("#FAFAFA", true)).toBe(false);
  });

  it("treats any other color as custom", () => {
    expect(isCustomBrandColor("#ff1616", false)).toBe(true);
    expect(isCustomBrandColor(DEFAULT_LIGHT_BRAND_COLOR, true)).toBe(true);
  });
});

describe("useGetBrandingColours accent variables", () => {
  const defaultLightAccent = {
    "cal-accent": "#cb1c42",
    "cal-accent-emphasis": "#a51050",
    "cal-accent-subtle": "#fbe3ec",
    "cal-accent-contrast": "#ffffff",
  };
  const defaultDarkAccent = {
    "cal-accent": "#f2546a",
    "cal-accent-emphasis": "#f57461",
    "cal-accent-subtle": "#3d1a2e",
    "cal-accent-contrast": "#13172e",
  };

  it("writes the default accent explicitly for both modes when no custom color is set", () => {
    const { result } = renderHook(() =>
      useGetBrandingColours({ lightVal: DEFAULT_LIGHT_BRAND_COLOR, darkVal: DEFAULT_DARK_BRAND_COLOR })
    );

    expect(result.current.light).toMatchObject(defaultLightAccent);
    expect(result.current.dark).toMatchObject(defaultDarkAccent);
  });

  it("uses the custom color as accent only for the mode where it is set", () => {
    const { result } = renderHook(() =>
      useGetBrandingColours({ lightVal: "#0040ff", darkVal: DEFAULT_DARK_BRAND_COLOR })
    );

    expect(result.current.light["cal-accent"]).toBe("#0040ff");
    expect(result.current.light["cal-accent-contrast"]).toBe("#FFFFFF");
    expect(result.current.dark).toMatchObject(defaultDarkAccent);
  });

  it("falls back to the default accent when going back from a custom color", () => {
    const { result, rerender } = renderHook((props) => useGetBrandingColours(props), {
      initialProps: { lightVal: "#0040ff" as string | null, darkVal: "#ff1616" as string | null },
    });
    expect(result.current.dark["cal-accent"]).toBe("#ff1616");

    rerender({ lightVal: null, darkVal: null });

    expect(result.current.light).toMatchObject(defaultLightAccent);
    expect(result.current.dark).toMatchObject(defaultDarkAccent);
  });
});
