import { describe, expect, it } from "vitest";

import { shouldEnableApp } from "./validateAppKeys";

describe("shouldEnableApp", () => {
  describe("Apps without key schemas", () => {
    it("should return true for apps that don't require keys", () => {
      // Use a dirName that doesn't have a schema (e.g., a non-existent app)
      const result = shouldEnableApp("non-existent-app", null);
      expect(result).toBe(true);
    });

    it("should return true even if keys are null for apps without schemas", () => {
      const result = shouldEnableApp("non-existent-app", null);
      expect(result).toBe(true);
    });

    it("should return true even if keys are empty object for apps without schemas", () => {
      const result = shouldEnableApp("non-existent-app", {});
      expect(result).toBe(true);
    });
  });

  describe("Apps with key schemas", () => {
    // zoomvideo requires client_id and client_secret
    it("should return false when keys are null", () => {
      const result = shouldEnableApp("zoomvideo", null);
      expect(result).toBe(false);
    });

    it("should return false when keys are undefined", () => {
      const result = shouldEnableApp("zoomvideo", undefined);
      expect(result).toBe(false);
    });

    it("should return false when keys is an empty object", () => {
      const result = shouldEnableApp("zoomvideo", {});
      expect(result).toBe(false);
    });

    it("should return false when keys is an array", () => {
      const result = shouldEnableApp("zoomvideo", [] as any);
      expect(result).toBe(false);
    });

    it("should return false when keys is a string", () => {
      const result = shouldEnableApp("zoomvideo", "invalid" as any);
      expect(result).toBe(false);
    });

    it("should return false when keys is a number", () => {
      const result = shouldEnableApp("zoomvideo", 123 as any);
      expect(result).toBe(false);
    });

    it("should return false when required keys are missing", () => {
      const result = shouldEnableApp("zoomvideo", {
        client_id: "client-id",
      });
      expect(result).toBe(false);
    });

    it("should return false when required keys are empty strings", () => {
      const result = shouldEnableApp("zoomvideo", {
        client_id: "",
        client_secret: "client-secret",
      });
      expect(result).toBe(false);
    });

    it("should return true when all required keys are present and valid", () => {
      const result = shouldEnableApp("zoomvideo", {
        client_id: "client-id",
        client_secret: "client-secret",
      });
      expect(result).toBe(true);
    });

    it("should return true when required keys are present and optional fields use defaults", () => {
      // openvisio's meetingUrlPattern has a default, so it can be omitted
      const result = shouldEnableApp("openvisio", {
        apiBaseUrl: "https://visio.clever.cloud",
        clientId: "client-id",
        clientSecret: "client-secret",
      });
      expect(result).toBe(true);
    });

    it("should return false when keys have wrong types", () => {
      const result = shouldEnableApp("zoomvideo", {
        client_id: 123 as any,
        client_secret: "client-secret",
      });
      expect(result).toBe(false);
    });
  });

  describe("Apps with multiple required fields", () => {
    // openvisio requires apiBaseUrl, clientId and clientSecret
    it("should return false when any required field is missing", () => {
      const result = shouldEnableApp("openvisio", {
        apiBaseUrl: "https://visio.clever.cloud",
        clientId: "client-id",
        // Missing clientSecret
      });
      expect(result).toBe(false);
    });

    it("should return true when all required fields are present", () => {
      const result = shouldEnableApp("openvisio", {
        apiBaseUrl: "https://visio.clever.cloud",
        clientId: "client-id",
        clientSecret: "client-secret",
      });
      expect(result).toBe(true);
    });

    it("should return false when any required field is empty", () => {
      const result = shouldEnableApp("openvisio", {
        apiBaseUrl: "https://visio.clever.cloud",
        clientId: "",
        clientSecret: "client-secret",
      });
      expect(result).toBe(false);
    });
  });
  
  describe("Apps with empty key schemas (user-configured apps like QR code, mock payment)", () => {
    // These apps have `appKeysSchema = z.object({})` - they don't need server-side keys
    // Users configure them after installation, so they should always be enabled

    it("should return true for QR code when keys are null", () => {
      const result = shouldEnableApp("qr_code", null);
      expect(result).toBe(true);
    });

    it("should return true for QR code when keys are undefined", () => {
      const result = shouldEnableApp("qr_code", undefined);
      expect(result).toBe(true);
    });

    it("should return true for QR code when keys are empty object", () => {
      const result = shouldEnableApp("qr_code", {});
      expect(result).toBe(true);
    });

    it("should return true for mock payment app when keys are null", () => {
      const result = shouldEnableApp("mock-payment-app", null);
      expect(result).toBe(true);
    });
  });
});
