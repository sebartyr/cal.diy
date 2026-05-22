import jimp from "jimp";

export function isBase64Image(value: string): boolean {
  return /^data:image\/(png|jpe?g);base64,/i.test(value);
}

// SEC-015 (Sprint 4): hard ceiling on the encoded base64 input length so a
// 50 MB avatar request can't exhaust memory or get persisted into a row that
// breaks downstream consumers. 8 MB of base64 ≈ ~6 MB of binary — generous
// for any reasonable avatar but bounded.
export const MAX_BASE64_IMAGE_BYTES = 8 * 1024 * 1024;

// Magic bytes for PNG and JPEG. SVG is intentionally not accepted here — the
// SVG path goes through imageUtils.ts which rasterizes to PNG first.
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  return false;
}

export async function resizeBase64Image(
  base64OrUrl: string,
  opts?: {
    maxSize?: number;
  }
) {
  if (!base64OrUrl.startsWith("data:")) {
    // might be a `https://` or something
    return base64OrUrl;
  }
  if (base64OrUrl.length > MAX_BASE64_IMAGE_BYTES) {
    throw new Error(`Avatar exceeds ${MAX_BASE64_IMAGE_BYTES} byte limit`);
  }
  const mimeMatch = base64OrUrl.match(/^data:(\w+\/\w+);/);
  const mimetype = mimeMatch?.[1];
  if (!mimetype) {
    throw new Error(`Could not distinguish mimetype`);
  }
  const buffer = Buffer.from(base64OrUrl.replace(/^data:image\/\w+;base64,/, ""), "base64");
  if (!looksLikeImage(buffer)) {
    throw new Error("Decoded payload does not match a supported image format (PNG or JPEG)");
  }

  const {
    // 96px is the height of the image on https://cal.com/peer
    maxSize = 96 * 4,
  } = opts ?? {};
  const image = await jimp.read(buffer);
  const currentSize = Math.max(image.getWidth(), image.getHeight());
  if (currentSize > maxSize) {
    image.resize(jimp.AUTO, maxSize);
  }
  const newBuffer = await image.getBufferAsync(mimetype);

  return `data:${mimetype};base64,${newBuffer.toString("base64")}`;
}
