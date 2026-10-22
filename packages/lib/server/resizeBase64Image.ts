import { Jimp, JimpMime } from "jimp";

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
function detectImageMime(buf: Buffer): typeof JimpMime.png | typeof JimpMime.jpeg | null {
  if (buf.length < 4) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return JimpMime.png;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return JimpMime.jpeg;
  return null;
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
  // Encode with the format the bytes actually are, not the declared one, so a
  // mislabelled data URL (e.g. "image/jpg" over PNG bytes) can't pick the encoder.
  const imageMime = detectImageMime(buffer);
  if (!imageMime) {
    throw new Error("Decoded payload does not match a supported image format (PNG or JPEG)");
  }

  const {
    // 96px is the height of the image on https://cal.com/peer
    maxSize = 96 * 4,
  } = opts ?? {};
  const image = await Jimp.read(buffer);
  const currentSize = Math.max(image.width, image.height);
  if (currentSize > maxSize) {
    image.resize({ h: maxSize });
  }
  const newBuffer = await image.getBuffer(imageMime);

  return `data:${imageMime};base64,${newBuffer.toString("base64")}`;
}
