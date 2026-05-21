import { describe, expect, it } from "vitest";

import { isBase64Image, MAX_BASE64_IMAGE_BYTES, resizeBase64Image } from "../resizeBase64Image";

describe("resizeBase64Image — SEC-015 size + magic-bytes guards", () => {
  it("isBase64Image accepts PNG/JPEG data URLs", () => {
    expect(isBase64Image("data:image/png;base64,iVBOR")).toBe(true);
    expect(isBase64Image("data:image/jpeg;base64,/9j/")).toBe(true);
    expect(isBase64Image("data:image/jpg;base64,/9j/")).toBe(true);
  });

  it("isBase64Image rejects SVG / other types here (SVG goes via imageUtils)", () => {
    expect(isBase64Image("data:image/svg+xml;base64,PHN2Zw==")).toBe(false);
    expect(isBase64Image("https://example.com/x.png")).toBe(false);
  });

  it("returns non-data URIs unchanged", async () => {
    const url = "https://example.com/avatar.png";
    expect(await resizeBase64Image(url)).toBe(url);
  });

  it("rejects payloads larger than the cap", async () => {
    const big = `data:image/png;base64,${"A".repeat(MAX_BASE64_IMAGE_BYTES)}`;
    await expect(resizeBase64Image(big)).rejects.toThrow(/exceeds.*byte limit/);
  });

  it("rejects payloads whose decoded bytes don't match PNG/JPEG magic", async () => {
    // valid base64 that decodes to plain text, not a real image
    const fake = `data:image/png;base64,${Buffer.from("not a real image").toString("base64")}`;
    await expect(resizeBase64Image(fake)).rejects.toThrow(/does not match a supported image format/);
  });

  it("rejects when the mimetype prefix is missing", async () => {
    await expect(resizeBase64Image("data:base64,XYZ")).rejects.toThrow(/mimetype/);
  });
});
