import type { WebhookSubscriber } from "@calcom/features/webhooks/lib/dto/types";
import getWebhooks from "@calcom/features/webhooks/lib/getWebhooks";
import sendPayload from "@calcom/features/webhooks/lib/sendOrSchedulePayload";
import type { WebhookPayloadType } from "@calcom/features/webhooks/lib/sendPayload";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleWebhookTrigger } from "./handleWebhookTrigger";

vi.mock("@calcom/features/webhooks/lib/getWebhooks", () => ({ default: vi.fn() }));
vi.mock("@calcom/features/webhooks/lib/sendOrSchedulePayload", () => ({ default: vi.fn() }));

const subscriber = {
  id: "wh-1",
  subscriberUrl: "https://example.com/hook",
  payloadTemplate: null,
  appId: null,
  secret: "secret",
  eventTriggers: [WebhookTriggerEvents.BOOKING_CREATED],
  version: "2021-10-20",
} as WebhookSubscriber;

const subscriberOptions = {
  userId: 1,
  eventTypeId: 2,
  triggerEvent: WebhookTriggerEvents.BOOKING_CREATED,
};
const webhookData = { bookingId: 1, uid: "uid" } as unknown as WebhookPayloadType;
const traceContext = { traceId: "trace", spanId: "span", operation: "test" };

describe("handleWebhookTrigger", () => {
  beforeEach(() => {
    vi.mocked(getWebhooks).mockReset().mockResolvedValue([subscriber]);
    vi.mocked(sendPayload).mockReset().mockResolvedValue({ ok: true, status: 200 });
  });

  it("looks up subscribers when none are provided", async () => {
    await handleWebhookTrigger({
      subscriberOptions,
      eventTrigger: WebhookTriggerEvents.BOOKING_CREATED,
      webhookData,
      traceContext,
    });

    expect(getWebhooks).toHaveBeenCalledWith(subscriberOptions);
    expect(sendPayload).toHaveBeenCalledTimes(1);
  });

  it("uses the provided subscribers without querying again", async () => {
    await handleWebhookTrigger({
      subscriberOptions,
      eventTrigger: WebhookTriggerEvents.BOOKING_CREATED,
      webhookData,
      traceContext,
      subscribers: [subscriber],
    });

    expect(getWebhooks).not.toHaveBeenCalled();
    expect(sendPayload).toHaveBeenCalledWith(
      subscriber.secret,
      WebhookTriggerEvents.BOOKING_CREATED,
      expect.any(String),
      subscriber,
      webhookData
    );
  });

  it("sends nothing for an empty provided list", async () => {
    await handleWebhookTrigger({
      subscriberOptions,
      eventTrigger: WebhookTriggerEvents.BOOKING_CREATED,
      webhookData,
      traceContext,
      subscribers: [],
    });

    expect(getWebhooks).not.toHaveBeenCalled();
    expect(sendPayload).not.toHaveBeenCalled();
  });

  it("skips everything on dry run", async () => {
    await handleWebhookTrigger({
      subscriberOptions,
      eventTrigger: WebhookTriggerEvents.BOOKING_CREATED,
      webhookData,
      traceContext,
      isDryRun: true,
      subscribers: [subscriber],
    });

    expect(getWebhooks).not.toHaveBeenCalled();
    expect(sendPayload).not.toHaveBeenCalled();
  });
});
