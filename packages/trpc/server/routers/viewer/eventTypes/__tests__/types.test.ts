import { describe, expect, it } from "vitest";
import { ZUpdateInputSchema } from "../types";

describe("ZUpdateInputSchema.successRedirectUrl", () => {
  const parse = (successRedirectUrl: unknown) => ZUpdateInputSchema.safeParse({ id: 1, successRedirectUrl });

  it.each([
    "https://example.com/thanks",
    "http://example.com",
    "",
    null,
    undefined,
  ])("accepts %s", (value) => {
    expect(parse(value).success).toBe(true);
  });

  it.each([
    "javascript:alert(document.domain)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:someone@example.com",
    "not a url",
  ])("rejects %s", (value) => {
    expect(parse(value).success).toBe(false);
  });
});
