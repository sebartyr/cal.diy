import bcrypt from "bcryptjs";
import crypto from "node:crypto";

import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";

/**
 * SEC-009: backup codes were previously stored as a JSON array of *plaintext*
 * codes inside `symmetricEncrypt(JSON.stringify(codes), CALENDSO_ENCRYPTION_KEY)`.
 *
 * Problems with the previous approach:
 *   1. An operator (or attacker with DB+key) can read back the raw codes and
 *      use them silently.
 *   2. Code reuse detection relies on `indexOf` over a plaintext array — the
 *      array is recoverable, so a leaked DB dump is sufficient to bypass 2FA
 *      against any user.
 *   3. Backup codes are credentials of equal weight to passwords; they
 *      deserve the same hashing treatment.
 *
 * New format: codes are hashed with bcrypt (one hash per code, `null` for a
 * consumed code). The resulting array is JSON-stringified and stored under
 * `symmetricEncrypt` for defense in depth (so a partial leak of the column
 * alone, without the encryption key, doesn't expose the bcrypt hashes for
 * offline cracking).
 *
 * Backwards compatibility: `parseStoredBackupCodes` and `verifyAndConsume`
 * detect a legacy plaintext payload (an entry that doesn't look like a
 * bcrypt hash). When a legacy payload is verified successfully, the caller
 * gets back a re-hashed array so the on-disk format upgrades lazily.
 */

const BCRYPT_COST = 10;
const CODE_BYTES = 5;
const CODES_PER_USER = 10;

export type StoredBackupCodeEntry = string | null;

function looksLikeBcryptHash(value: unknown): value is string {
  return typeof value === "string" && /^\$2[aby]\$\d{1,2}\$.{53}$/.test(value);
}

function normalizeUserInput(raw: string): string {
  return raw.replaceAll("-", "").trim();
}

/**
 * Generate a fresh batch of plaintext backup codes — the user sees these
 * exactly once at setup. Format is 10 hex characters per code.
 */
export function generatePlaintextBackupCodes(count = CODES_PER_USER): string[] {
  return Array.from({ length: count }, () => crypto.randomBytes(CODE_BYTES).toString("hex"));
}

/**
 * Hash the freshly-generated batch and wrap in symmetricEncrypt for the DB.
 */
export async function hashBackupCodesForStorage(plaintextCodes: string[], encryptionKey: string): Promise<string> {
  const hashes = await Promise.all(plaintextCodes.map((code) => bcrypt.hash(normalizeUserInput(code), BCRYPT_COST)));
  return symmetricEncrypt(JSON.stringify(hashes), encryptionKey);
}

/**
 * Decode the stored payload back into the JSON array. Throws on malformed
 * payloads (callers should catch and treat as "no usable backup codes").
 */
export function parseStoredBackupCodes(stored: string, encryptionKey: string): StoredBackupCodeEntry[] {
  const decrypted = symmetricDecrypt(stored, encryptionKey);
  const parsed = JSON.parse(decrypted);
  if (!Array.isArray(parsed)) {
    throw new Error("backupCodes: stored payload is not a JSON array");
  }
  return parsed as StoredBackupCodeEntry[];
}

export type VerifyAndConsumeResult =
  | { ok: false }
  | {
      ok: true;
      /**
       * Updated array to persist back. The matched code is replaced with `null`.
       * If the stored payload was in the legacy plaintext format, the entire
       * array is returned re-hashed (lazy upgrade).
       */
      updatedHashes: StoredBackupCodeEntry[];
      /** True if a legacy payload was upgraded to the bcrypt format. */
      upgraded: boolean;
    };

/**
 * Compare a user-supplied code (with or without hyphens) against the stored
 * array and, if it matches, return the array with the matched entry nulled
 * out so the caller can persist it. Constant work on miss to avoid trivial
 * timing oracles.
 */
export async function verifyAndConsumeBackupCode(
  userInput: string,
  storedEntries: StoredBackupCodeEntry[]
): Promise<VerifyAndConsumeResult> {
  const normalized = normalizeUserInput(userInput);
  if (!normalized) return { ok: false };

  // Detect legacy plaintext format: any non-null, non-bcrypt-shaped entry
  // means the array is still in the old `["abc123",...]` shape.
  const isLegacy = storedEntries.some((e) => e !== null && !looksLikeBcryptHash(e));

  if (isLegacy) {
    // Legacy path — array entries are plaintext (or null for consumed).
    // Walk the whole array to keep work proportional to N regardless of where
    // the match is (mild timing-side-channel hardening).
    let matchIndex = -1;
    for (let i = 0; i < storedEntries.length; i++) {
      const entry = storedEntries[i];
      if (entry !== null && typeof entry === "string" && entry === normalized) {
        matchIndex = i;
      }
    }
    if (matchIndex === -1) return { ok: false };

    // Lazy upgrade: re-hash all remaining (still-active) codes with bcrypt.
    const upgraded: StoredBackupCodeEntry[] = await Promise.all(
      storedEntries.map(async (entry, i) => {
        if (i === matchIndex) return null;
        if (entry === null || typeof entry !== "string") return null;
        return bcrypt.hash(entry, BCRYPT_COST);
      })
    );
    return { ok: true, updatedHashes: upgraded, upgraded: true };
  }

  // Modern path — compare against each bcrypt hash. Track the first match
  // but keep comparing to keep wall time constant in N.
  let matchIndex = -1;
  for (let i = 0; i < storedEntries.length; i++) {
    const entry = storedEntries[i];
    if (entry === null || !looksLikeBcryptHash(entry)) continue;
    // Sequential await is intentional: bcrypt.compare is CPU-bound and we
    // want bounded concurrency. 10 codes × ~20ms ≈ 200ms in the worst case.
    // eslint-disable-next-line no-await-in-loop
    const matches = await bcrypt.compare(normalized, entry);
    if (matches && matchIndex === -1) {
      matchIndex = i;
    }
  }

  if (matchIndex === -1) return { ok: false };

  const updated = [...storedEntries];
  updated[matchIndex] = null;
  return { ok: true, updatedHashes: updated, upgraded: false };
}

/**
 * Convenience wrapper that re-encrypts an updated array for storage.
 */
export function reencryptBackupCodes(entries: StoredBackupCodeEntry[], encryptionKey: string): string {
  return symmetricEncrypt(JSON.stringify(entries), encryptionKey);
}
