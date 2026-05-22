import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import { symmetricDecrypt, symmetricEncrypt } from "@calcom/lib/crypto";

import {
  generatePlaintextBackupCodes,
  hashBackupCodesForStorage,
  parseStoredBackupCodes,
  reencryptBackupCodes,
  verifyAndConsumeBackupCode,
} from "../backupCodes";

const KEY = "12345678901234567890123456789012";

describe("backupCodes (SEC-009)", () => {
  describe("generatePlaintextBackupCodes", () => {
    it("returns 10 unique hex codes by default", () => {
      const codes = generatePlaintextBackupCodes();
      expect(codes).toHaveLength(10);
      expect(new Set(codes).size).toBe(10);
      for (const c of codes) {
        expect(c).toMatch(/^[0-9a-f]{10}$/);
      }
    });

    it("respects custom count", () => {
      expect(generatePlaintextBackupCodes(3)).toHaveLength(3);
    });
  });

  describe("hashBackupCodesForStorage", () => {
    it("produces a symmetricEncrypt'd JSON array of bcrypt hashes", async () => {
      const codes = generatePlaintextBackupCodes();
      const stored = await hashBackupCodesForStorage(codes, KEY);
      // decrypt back and inspect shape
      const arr = JSON.parse(symmetricDecrypt(stored, KEY));
      expect(arr).toHaveLength(10);
      for (const h of arr) {
        expect(h).toMatch(/^\$2[aby]\$\d{1,2}\$.{53}$/);
      }
    });
  });

  describe("verifyAndConsumeBackupCode — modern (bcrypt) path", () => {
    it("matches a correct code and nulls it out in the returned array", async () => {
      const codes = generatePlaintextBackupCodes();
      const stored = await hashBackupCodesForStorage(codes, KEY);
      const entries = parseStoredBackupCodes(stored, KEY);

      const result = await verifyAndConsumeBackupCode(codes[3], entries);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.updatedHashes[3]).toBeNull();
        expect(result.upgraded).toBe(false);
        // The other slots are untouched.
        expect(result.updatedHashes.filter((e) => e !== null)).toHaveLength(9);
      }
    });

    it("accepts hyphenated input from the user", async () => {
      const codes = generatePlaintextBackupCodes();
      const stored = await hashBackupCodesForStorage(codes, KEY);
      const entries = parseStoredBackupCodes(stored, KEY);
      const hyphenated = codes[0].replace(/(.{5})/, "$1-");

      const result = await verifyAndConsumeBackupCode(hyphenated, entries);
      expect(result.ok).toBe(true);
    });

    it("rejects an unknown code", async () => {
      const codes = generatePlaintextBackupCodes();
      const stored = await hashBackupCodesForStorage(codes, KEY);
      const entries = parseStoredBackupCodes(stored, KEY);

      const result = await verifyAndConsumeBackupCode("deadbeefca", entries);
      expect(result.ok).toBe(false);
    });

    it("rejects an empty / whitespace-only code", async () => {
      const codes = generatePlaintextBackupCodes();
      const stored = await hashBackupCodesForStorage(codes, KEY);
      const entries = parseStoredBackupCodes(stored, KEY);

      expect((await verifyAndConsumeBackupCode("", entries)).ok).toBe(false);
      expect((await verifyAndConsumeBackupCode("---", entries)).ok).toBe(false);
    });

    it("does not match a code that has already been consumed (null)", async () => {
      const codes = generatePlaintextBackupCodes();
      const stored = await hashBackupCodesForStorage(codes, KEY);
      const entries = parseStoredBackupCodes(stored, KEY);
      entries[0] = null;

      expect((await verifyAndConsumeBackupCode(codes[0], entries)).ok).toBe(false);
    });
  });

  describe("verifyAndConsumeBackupCode — legacy (plaintext) path", () => {
    it("matches a legacy code and lazy-upgrades the rest to bcrypt", async () => {
      const legacyCodes = ["aaaaaaaaaa", "bbbbbbbbbb", "cccccccccc", null, "eeeeeeeeee"];
      const legacyStored = symmetricEncrypt(JSON.stringify(legacyCodes), KEY);
      const entries = parseStoredBackupCodes(legacyStored, KEY);

      const result = await verifyAndConsumeBackupCode("bbbbbbbbbb", entries);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.upgraded).toBe(true);
        // matched slot is null
        expect(result.updatedHashes[1]).toBeNull();
        // already-consumed slot stays null
        expect(result.updatedHashes[3]).toBeNull();
        // the others are now bcrypt hashes
        for (const idx of [0, 2, 4]) {
          const h = result.updatedHashes[idx];
          expect(h).toMatch(/^\$2[aby]\$\d{1,2}\$.{53}$/);
          expect(await bcrypt.compare(legacyCodes[idx] as string, h as string)).toBe(true);
        }
      }
    });

    it("rejects an unknown code on the legacy path", async () => {
      const legacyCodes = ["aaaaaaaaaa", "bbbbbbbbbb"];
      const legacyStored = symmetricEncrypt(JSON.stringify(legacyCodes), KEY);
      const entries = parseStoredBackupCodes(legacyStored, KEY);

      expect((await verifyAndConsumeBackupCode("zzzzzzzzzz", entries)).ok).toBe(false);
    });
  });

  describe("reencryptBackupCodes", () => {
    it("round-trips through symmetricEncrypt/Decrypt", async () => {
      const codes = generatePlaintextBackupCodes(3);
      const stored = await hashBackupCodesForStorage(codes, KEY);
      const entries = parseStoredBackupCodes(stored, KEY);

      const re = reencryptBackupCodes(entries, KEY);
      expect(JSON.parse(symmetricDecrypt(re, KEY))).toEqual(entries);
    });
  });

  describe("parseStoredBackupCodes", () => {
    it("throws on a non-array payload", () => {
      const stored = symmetricEncrypt(JSON.stringify({ not: "array" }), KEY);
      expect(() => parseStoredBackupCodes(stored, KEY)).toThrow();
    });
  });
});
