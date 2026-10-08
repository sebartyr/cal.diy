import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ default: { lookup: lookupMock } }));

import { WebhookVersion } from "./interface/IWebhookRepository";
import sendPayload from "./sendPayload";

describe("sendPayload", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    lookupMock.mockResolvedValue([{ address: "93.184.215.14", family: 4 }]);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

    const webhookTo = (subscriberUrl: string) => ({
      subscriberUrl,
      appId: null,
      payloadTemplate: null,
      version: WebhookVersion.V_2021_10_20,
    });

    const send = (subscriberUrl: string) =>
      sendPayload("k", "BOOKING_CREATED", new Date().toISOString(), webhookTo(subscriberUrl), baseEvt);

    it.each([
      ["http://127.0.0.1:8080/hook", "loopback"],
      ["http://[::ffff:a9fe:a9fe]/latest/meta-data/", "IPv4-mapped metadata"],
      ["http://10.0.0.5/hook", "private network"],
    ])("refuses to post to %s (%s)", async (url) => {
      expect(await send(url)).toEqual({ ok: false, status: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("refuses a hostname that resolves to an internal address", async () => {
      lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
      expect(await send("https://rebind.example.com/hook")).toEqual({ ok: false, status: 0 });
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("posts to a private network host listed in SSRF_ALLOWED_PRIVATE_HOSTS", async () => {
      vi.stubEnv("SSRF_ALLOWED_PRIVATE_HOSTS", "hooks.corp.example");
      lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
      expect(await send("https://hooks.corp.example/hook")).toEqual({ ok: true, status: 200 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

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
