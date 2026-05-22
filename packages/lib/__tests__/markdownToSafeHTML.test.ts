import { describe, expect, it } from "vitest";

import { markdownToSafeHTML } from "../markdownToSafeHTML";

describe("markdownToSafeHTML — SEC-203 noopener noreferrer", () => {
  it("adds target=_blank AND rel=noopener noreferrer to every <a>", () => {
    const html = markdownToSafeHTML("Check [docs](https://example.test)");
    expect(html).toContain("target='_blank'");
    expect(html).toContain("rel='noopener noreferrer'");
  });

  it("applies the rel attribute to multiple links", () => {
    const html = markdownToSafeHTML("[a](https://a.test) and [b](https://b.test)");
    const rels = html.match(/rel='noopener noreferrer'/g) ?? [];
    expect(rels.length).toBe(2);
  });

  it("returns empty string for null", () => {
    expect(markdownToSafeHTML(null)).toBe("");
  });
});
