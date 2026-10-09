import { DailyLocationType } from "@calcom/app-store/constants";
import tasker from "@calcom/features/tasker";
import type { WebhookSubscriber } from "@calcom/features/webhooks/lib/dto/types";
import { getWebhooksForTriggers } from "@calcom/features/webhooks/lib/getWebhooks";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleNoShowTriggers } from "./scheduleNoShowTriggers";

vi.mock("@calcom/features/webhooks/lib/getWebhooks", () => ({
  default: vi.fn(),
  getWebhooksForTriggers: vi.fn(),
}));
vi.mock("@calcom/features/tasker", () => ({ default: { create: vi.fn() } }));

const { AFTER_HOSTS_CAL_VIDEO_NO_SHOW, AFTER_GUESTS_CAL_VIDEO_NO_SHOW } = WebhookTriggerEvents;

const makeSubscriber = (id: string, trigger: WebhookTriggerEvents): WebhookSubscriber =>
  ({
    id,
    subscriberUrl: `https://example.com/${id}`,
    payloadTemplate: null,
    appId: null,
    secret: null,
    time: 10,
    timeUnit: "MINUTE",
    eventTriggers: [trigger],
    version: "2021-10-20",
  }) as WebhookSubscriber;

const booking = {
  startTime: new Date("2026-01-01T10:00:00Z"),
  id: 42,
  location: DailyLocationType,
  uid: "booking-uid",
};

describe("scheduleNoShowTriggers", () => {
  beforeEach(() => {
    vi.mocked(tasker.create).mockReset().mockResolvedValue("task-id");
    vi.mocked(getWebhooksForTriggers)
      .mockReset()
      .mockResolvedValue({
        [AFTER_HOSTS_CAL_VIDEO_NO_SHOW]: [makeSubscriber("host-hook", AFTER_HOSTS_CAL_VIDEO_NO_SHOW)],
        [AFTER_GUESTS_CAL_VIDEO_NO_SHOW]: [makeSubscriber("guest-hook", AFTER_GUESTS_CAL_VIDEO_NO_SHOW)],
      } as Record<WebhookTriggerEvents, WebhookSubscriber[]>);
  });

  it("fetches both no-show triggers in one lookup with the same subscriber options", async () => {
    await scheduleNoShowTriggers({
      booking,
      triggerForUser: true,
      organizerUser: { id: 7 },
      eventTypeId: 3,
      teamId: 5,
      orgId: 9,
      oAuthClientId: "client",
    });

    expect(getWebhooksForTriggers).toHaveBeenCalledTimes(1);
    expect(getWebhooksForTriggers).toHaveBeenCalledWith(
      { userId: 7, eventTypeId: 3, teamId: 5, orgId: 9, oAuthClientId: "client" },
      [AFTER_HOSTS_CAL_VIDEO_NO_SHOW, AFTER_GUESTS_CAL_VIDEO_NO_SHOW]
    );
  });

  it("schedules host and guest tasks from their respective subscribers", async () => {
    await scheduleNoShowTriggers({
      booking,
      triggerForUser: null,
      organizerUser: { id: 7 },
      eventTypeId: 3,
    });

    expect(vi.mocked(getWebhooksForTriggers).mock.calls[0][0].userId).toBeNull();
    const scheduledAt = new Date("2026-01-01T10:10:00Z");
    expect(tasker.create).toHaveBeenCalledWith(
      "triggerHostNoShowWebhook",
      expect.objectContaining({
        triggerEvent: AFTER_HOSTS_CAL_VIDEO_NO_SHOW,
        bookingId: 42,
        webhook: expect.objectContaining({ id: "host-hook" }),
      }),
      { scheduledAt, referenceUid: "booking-uid" }
    );
    expect(tasker.create).toHaveBeenCalledWith(
      "triggerGuestNoShowWebhook",
      expect.objectContaining({
        triggerEvent: AFTER_GUESTS_CAL_VIDEO_NO_SHOW,
        webhook: expect.objectContaining({ id: "guest-hook" }),
      }),
      { scheduledAt, referenceUid: "booking-uid" }
    );
    expect(tasker.create).toHaveBeenCalledTimes(2);
  });

  it("does not look up webhooks outside Cal Video or on dry run", async () => {
    await scheduleNoShowTriggers({
      booking: { ...booking, location: "https://zoom.us/j/1" },
      organizerUser: { id: 7 },
      eventTypeId: 3,
    });
    await scheduleNoShowTriggers({ booking, organizerUser: { id: 7 }, eventTypeId: 3, isDryRun: true });

    expect(getWebhooksForTriggers).not.toHaveBeenCalled();
    expect(tasker.create).not.toHaveBeenCalled();
  });
});
