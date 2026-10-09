import { describe, expect, it } from "vitest";
import { DEFAULT_DARK_BRAND_COLOR, DEFAULT_LIGHT_BRAND_COLOR } from "./constants";
import { createColorMap, isCustomBrandColor } from "./getBrandColours";

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
