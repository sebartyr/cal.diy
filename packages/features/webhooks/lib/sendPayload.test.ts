import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { WebhookVersion } from "./interface/IWebhookRepository";
import sendPayload from "./sendPayload";

describe("sendPayload", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  describe("X-Cal-Webhook-Version header", () => {
    it("should include X-Cal-Webhook-Version header with the webhook version", async () => {
      const webhook = {
        subscriberUrl: "https://example.com/webhook",
        appId: null,
        payloadTemplate: null,
        version: WebhookVersion.V_2021_10_20,
      };

      await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {
        title: "Test Booking",
        startTime: "2024-01-01T10:00:00Z",
        endTime: "2024-01-01T11:00:00Z",
        organizer: {
          email: "organizer@example.com",
          name: "Organizer",
          timeZone: "UTC",
          language: { locale: "en" },
        },
        attendees: [],
        type: "test-event",
        description: "",
      } as unknown as Parameters<typeof sendPayload>[4]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toBe("https://example.com/webhook");
      expect(options.headers).toHaveProperty("X-Cal-Webhook-Version", "2021-10-20");
    });

    it("should include X-Cal-Signature-256 header alongside version header", async () => {
      const webhook = {
        subscriberUrl: "https://example.com/webhook",
        appId: null,
        payloadTemplate: null,
        version: WebhookVersion.V_2021_10_20,
      };

      await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {
        title: "Test Booking",
        startTime: "2024-01-01T10:00:00Z",
        endTime: "2024-01-01T11:00:00Z",
        organizer: {
          email: "organizer@example.com",
          name: "Organizer",
          timeZone: "UTC",
          language: { locale: "en" },
        },
        attendees: [],
        type: "test-event",
        description: "",
      } as unknown as Parameters<typeof sendPayload>[4]);

      const [, options] = mockFetch.mock.calls[0];

      expect(options.headers).toHaveProperty("X-Cal-Signature-256");
      expect(options.headers).toHaveProperty("X-Cal-Webhook-Version");
      expect(options.headers).toHaveProperty("Content-Type", "application/json");
    });

    it("should send correct version for different webhook versions", async () => {
      // Test with the current version
      const webhook = {
        subscriberUrl: "https://example.com/webhook",
        appId: null,
        payloadTemplate: null,
        version: WebhookVersion.V_2021_10_20,
      };

      await sendPayload("test-secret", "BOOKING_CREATED", new Date().toISOString(), webhook, {
        title: "Test",
        startTime: "2024-01-01T10:00:00Z",
        endTime: "2024-01-01T11:00:00Z",
        organizer: {
          email: "test@example.com",
          name: "Test",
          timeZone: "UTC",
          language: { locale: "en" },
        },
        attendees: [],
        type: "test",
        description: "",
      } as unknown as Parameters<typeof sendPayload>[4]);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-Cal-Webhook-Version"]).toBe("2021-10-20");
    });
  });

  describe("SSRF protection (SEC-103)", () => {
    const baseEvt = {
      title: "T",
      startTime: "2024-01-01T10:00:00Z",
      endTime: "2024-01-01T11:00:00Z",
      organizer: { email: "o@e.com", name: "O", timeZone: "UTC", language: { locale: "en" } },
      attendees: [],
      type: "test",
      description: "",
    } as unknown as Parameters<typeof sendPayload>[4];

    // Note: under IS_SELF_HOSTED=true (the default cal.diy build), private/
    // loopback IPs are intentionally allowed so internal webhooks work.
    // The cloud-metadata block is unconditional — it's the most-abused SSRF
    // target on cloud-hosted deployments.
    it("refuses to fetch a cloud-metadata URL (always blocked)", async () => {
      const webhook = {
        subscriberUrl: "http://169.254.169.254/latest/meta-data/",
        appId: null,
        payloadTemplate: null,
        version: WebhookVersion.V_2021_10_20,
      };
      const res = await sendPayload("k", "BOOKING_CREATED", new Date().toISOString(), webhook, baseEvt);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(res).toEqual({ ok: false, status: 0 });
    });

    it("refuses to fetch the GCP metadata hostname", async () => {
      const webhook = {
        subscriberUrl: "http://metadata.google.internal/computeMetadata/v1/",
        appId: null,
        payloadTemplate: null,
        version: WebhookVersion.V_2021_10_20,
      };
      const res = await sendPayload("k", "BOOKING_CREATED", new Date().toISOString(), webhook, baseEvt);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(res).toEqual({ ok: false, status: 0 });
    });

    it("refuses to fetch a file:// URL", async () => {
      const webhook = {
        subscriberUrl: "file:///etc/passwd",
        appId: null,
        payloadTemplate: null,
        version: WebhookVersion.V_2021_10_20,
      };
      const res = await sendPayload("k", "BOOKING_CREATED", new Date().toISOString(), webhook, baseEvt);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(res).toEqual({ ok: false, status: 0 });
    });
  });
});
