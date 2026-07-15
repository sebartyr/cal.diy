import crypto from "node:crypto";

/**
 * SEC-100 (Clever Cloud fork): symmetric encryption for credentials at rest.
 *
 * Externalized from `crypto.ts` so the upstream file stays a near-identical
 * one-liner — see `FORK-REFACTOR` note in commit history. Two formats are
 * supported on the decrypt path:
 *
 *   v1 (legacy):  "<hex(iv)>:<hex(ciphertext)>"           AES-256-CBC, no MAC
 *   v2 (current): "v2:<hex(iv)>:<hex(tag)>:<hex(ciphertext)>"  AES-256-GCM
 *
 * `symmetricEncryptV2` always produces v2. `symmetricDecryptV2` auto-detects
 * the format from the prefix — this gives us a lazy re-encrypt: every time
 * a credential round-trips through encrypt() (e.g. OAuth refresh), it ends
 * up stored as v2 on the next write. No big-bang migration.
 *
 * Why GCM:
 *  - CBC has no integrity check; any random ciphertext "decrypts" to
 *    garbage with no error, which made wrong-key detection unreliable.
 *  - With GCM the auth tag is verified on decrypt, so a wrong key or a
 *    tampered ciphertext throws cleanly.
 */

const LEGACY_ALGORITHM = "aes-256-cbc";
const GCM_ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 16; // AES block size; GCM is happy with 12 too but stay aligned.
const GCM_TAG_LENGTH_BYTES = 16;
const HEX = "hex";
const UTF8 = "utf8";
const V2_PREFIX = "v2:";

function keyBuffer(key: string): Buffer {
  return Buffer.from(key, "latin1");
}

export function symmetricEncryptV2(text: string, key: string): string {
  const k = keyBuffer(key);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(GCM_ALGORITHM, k, iv);
  const ciphered = Buffer.concat([cipher.update(text, UTF8), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${V2_PREFIX}${iv.toString(HEX)}:${tag.toString(HEX)}:${ciphered.toString(HEX)}`;
}

function decryptV2(payload: string, key: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("crypto: malformed v2 payload — expected iv:tag:ciphertext");
  }
  const [ivHex, tagHex, ctHex] = parts;
  const iv = Buffer.from(ivHex, HEX);
  const tag = Buffer.from(tagHex, HEX);
  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`crypto: invalid IV length (${iv.length})`);
  }
  if (tag.length !== GCM_TAG_LENGTH_BYTES) {
    throw new Error(`crypto: invalid GCM tag length (${tag.length})`);
  }
  const decipher = crypto.createDecipheriv(GCM_ALGORITHM, keyBuffer(key), iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(Buffer.from(ctHex, HEX)), decipher.final()]);
  return plain.toString(UTF8);
}

function decryptLegacyCbc(payload: string, key: string): string {
  const parts = payload.split(":");
  if (parts.length < 2 || !parts[0]) {
    throw new Error("crypto: malformed legacy CBC payload — expected iv:ciphertext");
  }
  const iv = Buffer.from(parts.shift() || "", HEX);
  if (iv.length !== IV_LENGTH_BYTES) {
    throw new Error(`crypto: invalid IV length (${iv.length})`);
  }
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, keyBuffer(key), iv);
  let deciphered = decipher.update(parts.join(":"), HEX, UTF8);
  deciphered += decipher.final(UTF8);
  return deciphered;
}

export function symmetricDecryptV2(text: string, key: string): string {
  if (typeof text !== "string" || text.length === 0) {
    throw new Error("crypto: empty payload");
  }
  if (text.startsWith(V2_PREFIX)) {
    return decryptV2(text.slice(V2_PREFIX.length), key);
  }
  return decryptLegacyCbc(text, key);
}

/**
 * Returns true if a stored payload is still in the legacy AES-256-CBC format
 * (i.e. would benefit from re-encryption on next write). Used by the
 * lazy-migration audit script, and to tag which format a payload was in when
 * decryption fails — a wrong key and a corrupted row look identical otherwise.
 */
export function isLegacyCiphertext(text: string): boolean {
  return typeof text === "string" && text.length > 0 && !text.startsWith(V2_PREFIX);
}
