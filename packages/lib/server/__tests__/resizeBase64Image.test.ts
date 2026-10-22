import { Jimp, JimpMime } from "jimp";
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

  it("downscales an oversized PNG to maxSize height, keeping the aspect ratio", async () => {
    const png = await new Jimp({ width: 800, height: 400, color: 0xff0000ff }).getBase64(JimpMime.png);

    const resized = await resizeBase64Image(png, { maxSize: 100 });

    expect(resized.startsWith("data:image/png;base64,")).toBe(true);
    const image = await Jimp.read(Buffer.from(resized.split(",")[1], "base64"));
    expect(image.height).toBe(100);
    expect(image.width).toBe(200);
  });

  it("re-encodes an image already within maxSize without resizing it", async () => {
    const jpeg = await new Jimp({ width: 50, height: 40, color: 0x00ff00ff }).getBase64(JimpMime.jpeg);

    const result = await resizeBase64Image(jpeg, { maxSize: 100 });

    expect(result.startsWith("data:image/jpeg;base64,")).toBe(true);
    const image = await Jimp.read(Buffer.from(result.split(",")[1], "base64"));
    expect(image.width).toBe(50);
    expect(image.height).toBe(40);
  });

  it("encodes with the format of the decoded bytes, not the declared mimetype", async () => {
    const png = await new Jimp({ width: 10, height: 10, color: 0x0000ffff }).getBase64(JimpMime.png);
    const mislabelled = png.replace("data:image/png", "data:image/jpg");

    const result = await resizeBase64Image(mislabelled);

    expect(result.startsWith("data:image/png;base64,")).toBe(true);
  });
});
