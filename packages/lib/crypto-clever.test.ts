import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { isLegacyCiphertext, symmetricDecryptV2, symmetricEncryptV2 } from "./crypto-clever";

describe("crypto-clever (SEC-100)", () => {
  const testKey = "12345678901234567890123456789012"; // 32 bytes
  const testText = "Hello, World!";

  describe("symmetricEncryptV2 — v2 (AES-256-GCM)", () => {
    it("emits the v2: prefix", () => {
      const out = symmetricEncryptV2(testText, testKey);
      expect(out.startsWith("v2:")).toBe(true);
    });

    it("emits iv:tag:ciphertext after the prefix", () => {
      const out = symmetricEncryptV2(testText, testKey);
      const [iv, tag, ct] = out.slice(3).split(":");
      // iv 16 bytes -> 32 hex chars, tag 16 bytes -> 32 hex chars
      expect(iv).toHaveLength(32);
      expect(tag).toHaveLength(32);
      expect(ct.length).toBeGreaterThan(0);
    });

    it("never produces the same ciphertext twice (random IV)", () => {
      const a = symmetricEncryptV2(testText, testKey);
      const b = symmetricEncryptV2(testText, testKey);
      expect(a).not.toBe(b);
    });

    it("throws if key is wrong length", () => {
      expect(() => symmetricEncryptV2(testText, "short")).toThrow();
    });
  });

  describe("symmetricDecryptV2 — v2 round-trip", () => {
    it("decrypts what symmetricEncryptV2 produces", () => {
      expect(symmetricDecryptV2(symmetricEncryptV2(testText, testKey), testKey)).toBe(testText);
    });

    it("handles empty string", () => {
      expect(symmetricDecryptV2(symmetricEncryptV2("", testKey), testKey)).toBe("");
    });

    it("handles unicode", () => {
      const s = "Hello, 世界! 👋 🌍";
      expect(symmetricDecryptV2(symmetricEncryptV2(s, testKey), testKey)).toBe(s);
    });

    it("handles long text (1 KB)", () => {
      const s = "a".repeat(1000);
      expect(symmetricDecryptV2(symmetricEncryptV2(s, testKey), testKey)).toBe(s);
    });

    it("throws on wrong key (GCM authenticates)", () => {
      const enc = symmetricEncryptV2(testText, testKey);
      const wrong = "12345678901234567890123456789013";
      expect(() => symmetricDecryptV2(enc, wrong)).toThrow();
    });

    it("throws if the auth tag is tampered with", () => {
      const enc = symmetricEncryptV2(testText, testKey);
      const [prefix, ...rest] = enc.split(":");
      const [iv, tag, ct] = rest;
      // Flip one bit in the tag hex.
      const flippedTag =
        (parseInt(tag.slice(0, 2), 16) ^ 1).toString(16).padStart(2, "0") + tag.slice(2);
      const tampered = `${prefix}:${iv}:${flippedTag}:${ct}`;
      expect(() => symmetricDecryptV2(tampered, testKey)).toThrow();
    });

    it("throws if the ciphertext is tampered with", () => {
      const enc = symmetricEncryptV2(testText, testKey);
      const [prefix, ...rest] = enc.split(":");
      const [iv, tag, ct] = rest;
      const flippedCt =
        (parseInt(ct.slice(0, 2), 16) ^ 1).toString(16).padStart(2, "0") + ct.slice(2);
      const tampered = `${prefix}:${iv}:${tag}:${flippedCt}`;
      expect(() => symmetricDecryptV2(tampered, testKey)).toThrow();
    });

    it("throws on a malformed v2 payload", () => {
      expect(() => symmetricDecryptV2("v2:onlyone", testKey)).toThrow();
      expect(() => symmetricDecryptV2("v2:", testKey)).toThrow();
    });
  });

  describe("symmetricDecryptV2 — legacy CBC (backwards compat)", () => {
    // Hand-build a legacy ciphertext exactly like the previous implementation did.
    function legacyEncrypt(text: string, key: string): string {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key, "latin1"), iv);
      let ciphered = cipher.update(text, "utf8", "hex");
      ciphered += cipher.final("hex");
      return `${iv.toString("hex")}:${ciphered}`;
    }

    it("decrypts a legacy payload produced before the migration", () => {
      const legacy = legacyEncrypt(testText, testKey);
      expect(legacy.startsWith("v2:")).toBe(false);
      expect(symmetricDecryptV2(legacy, testKey)).toBe(testText);
    });

    it("decrypts a legacy payload with unicode", () => {
      const s = "Hello, 世界! 👋 🌍";
      expect(symmetricDecryptV2(legacyEncrypt(s, testKey), testKey)).toBe(s);
    });

    it("throws on malformed legacy payload", () => {
      expect(() => symmetricDecryptV2("invalid", testKey)).toThrow();
      expect(() => symmetricDecryptV2(":", testKey)).toThrow();
    });
  });

  describe("isLegacyCiphertext", () => {
    it("returns true for legacy CBC payloads", () => {
      expect(isLegacyCiphertext("abc123:def456")).toBe(true);
    });

    it("returns false for v2 payloads", () => {
      expect(isLegacyCiphertext(symmetricEncryptV2(testText, testKey))).toBe(false);
    });

    it("returns false for an empty string", () => {
      expect(isLegacyCiphertext("")).toBe(false);
    });
  });
});
