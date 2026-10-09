import type { Webhook } from "@calcom/prisma/client";
import { WebhookTriggerEvents } from "@calcom/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { prismaMock, taskerMock } = vi.hoisted(() => ({
  prismaMock: {
    webhook: { create: vi.fn() },
    booking: { findMany: vi.fn() },
    team: { findFirst: vi.fn() },
    eventType: { findMany: vi.fn() },
    webhookScheduledTriggers: { createMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    task: { deleteMany: vi.fn() },
  },
  taskerMock: { create: vi.fn(), cancelWithReference: vi.fn() },
}));

vi.mock("@calcom/prisma", () => ({ prisma: prismaMock, default: prismaMock }));
vi.mock("@calcom/features/tasker", () => ({ default: taskerMock }));

import {
  addSubscription,
  cancelNoShowTasksForBooking,
  updateTriggerForExistingBookings,
} from "./scheduleTrigger";

const startTime = new Date("2030-01-01T10:00:00.000Z");
const endTime = new Date("2030-01-01T10:30:00.000Z");

const buildBooking = (id: number) => ({
  id,
  uid: `uid-${id}`,
  title: `Booking ${id}`,
  startTime,
  endTime,
  location: "integrations:daily",
  responses: { name: "Attendee", email: "attendee@example.com" },
  status: "ACCEPTED",
});

const webhook = {
  id: "webhook-1",
  userId: 1,
  teamId: null,
  eventTypeId: null,
  appId: null,
  subscriberUrl: "https://example.com/hook",
  time: null,
  timeUnit: null,
  version: "2021-10-20",
} as unknown as Webhook;

describe("scheduleTrigger bulk writes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.webhookScheduledTriggers.createMany.mockResolvedValue({ count: 0 });
    prismaMock.task.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe("addSubscription", () => {
    it("schedules all existing bookings with one awaited createMany and keeps the full payload", async () => {
      prismaMock.webhook.create.mockResolvedValue({
        id: "webhook-1",
        appId: "zapier",
        subscriberUrl: "https://example.com/hook",
      });
      const bookings = [1, 2].map((id) => ({
        ...buildBooking(id),
        eventType: { bookingFields: null },
        attendees: [{ name: "Attendee", email: "attendee@example.com" }],
      }));
      prismaMock.booking.findMany.mockResolvedValue(bookings);

      await addSubscription({
        triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
        subscriberUrl: "https://example.com/hook",
        appId: "zapier",
        account: { id: 1, name: null, isTeam: false },
      });

      expect(prismaMock.webhookScheduledTriggers.create).not.toHaveBeenCalled();
      expect(prismaMock.webhookScheduledTriggers.createMany).toHaveBeenCalledTimes(1);
      const { data } = prismaMock.webhookScheduledTriggers.createMany.mock.calls[0][0];
      expect(data).toHaveLength(2);
      expect(data[0]).toEqual({
        payload: expect.any(String),
        appId: "zapier",
        startAfter: endTime,
        subscriberUrl: "https://example.com/hook",
        webhookId: "webhook-1",
        bookingId: 1,
      });
      const payload = JSON.parse(data[0].payload);
      expect(payload).toMatchObject({
        triggerEvent: WebhookTriggerEvents.MEETING_ENDED,
        id: 1,
        uid: "uid-1",
        title: "Booking 1",
        location: "integrations:daily",
        eventType: { bookingFields: null },
        attendees: [{ name: "Attendee", email: "attendee@example.com" }],
        responses: {
          name: { label: "name", value: "Attendee" },
          email: { label: "email", value: "attendee@example.com" },
        },
      });
    });

    it("still returns the subscription when scheduling the triggers fails", async () => {
      const subscription = { id: "webhook-1", appId: "zapier", subscriberUrl: "https://example.com/hook" };
      prismaMock.webhook.create.mockResolvedValue(subscription);
      prismaMock.booking.findMany.mockResolvedValue([{ ...buildBooking(1), eventType: null, attendees: [] }]);
      prismaMock.webhookScheduledTriggers.createMany.mockRejectedValue(new Error("db down"));
      prismaMock.webhookScheduledTriggers.create.mockRejectedValue(new Error("db down"));

      const result = await addSubscription({
        triggerEvent: WebhookTriggerEvents.MEETING_STARTED,
        subscriberUrl: "https://example.com/hook",
        appId: "zapier",
        account: { id: 1, name: null, isTeam: false },
      });

      expect(result).toBe(subscription);
    });

    it("falls back to one insert per booking when the bulk insert fails, so one bad row does not drop the batch", async () => {
      prismaMock.webhook.create.mockResolvedValue({
        id: "webhook-1",
        appId: "zapier",
        subscriberUrl: "https://example.com/hook",
      });
      prismaMock.booking.findMany.mockResolvedValue(
        [1, 2, 3].map((id) => ({ ...buildBooking(id), eventType: null, attendees: [] }))
      );
      prismaMock.webhookScheduledTriggers.createMany.mockRejectedValue(new Error("FK violation"));
      prismaMock.webhookScheduledTriggers.create
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error("FK violation"))
        .mockResolvedValueOnce({});

      await addSubscription({
        triggerEvent: WebhookTriggerEvents.MEETING_STARTED,
        subscriberUrl: "https://example.com/hook",
        appId: "zapier",
        account: { id: 1, name: null, isTeam: false },
      });

      const { data: batch } = prismaMock.webhookScheduledTriggers.createMany.mock.calls[0][0];
      expect(prismaMock.webhookScheduledTriggers.create.mock.calls.map(([arg]) => arg.data)).toEqual(batch);
    });
  });

  describe("updateTriggerForExistingBookings", () => {
    it("writes scheduled triggers in batches of 500 per added trigger", async () => {
      prismaMock.booking.findMany.mockResolvedValue(
        Array.from({ length: 501 }, (_, i) => buildBooking(i + 1))
      );

      await updateTriggerForExistingBookings(
        webhook,
        [],
        [WebhookTriggerEvents.MEETING_STARTED, WebhookTriggerEvents.MEETING_ENDED]
      );

      const calls = prismaMock.webhookScheduledTriggers.createMany.mock.calls.map(([arg]) => arg.data);
      expect(calls.map((data) => data.length)).toEqual([500, 1, 500, 1]);
      expect(calls[0][0]).toMatchObject({ startAfter: startTime, webhookId: "webhook-1", bookingId: 1 });
      expect(calls[2][0]).toMatchObject({ startAfter: endTime, webhookId: "webhook-1", bookingId: 1 });
      expect(JSON.parse(calls[0][0].payload)).toEqual(
        JSON.parse(JSON.stringify({ triggerEvent: WebhookTriggerEvents.MEETING_STARTED, ...buildBooking(1) }))
      );
      expect(prismaMock.webhookScheduledTriggers.create).not.toHaveBeenCalled();
    });

    it("loads org bookings with a single query covering sub-team event types and members", async () => {
      prismaMock.team.findFirst.mockResolvedValue({
        id: 10,
        children: [{ id: 11 }, { id: 12 }],
        members: [{ userId: 1 }, { userId: 2 }],
      });
      prismaMock.booking.findMany.mockResolvedValue([buildBooking(1)]);

      await updateTriggerForExistingBookings(
        { ...webhook, userId: null, teamId: 10 },
        [],
        [WebhookTriggerEvents.MEETING_STARTED]
      );

      expect(prismaMock.eventType.findMany).not.toHaveBeenCalled();
      expect(prismaMock.booking.findMany).toHaveBeenCalledTimes(1);
      const { where } = prismaMock.booking.findMany.mock.calls[0][0];
      expect(where.AND).toContainEqual({
        OR: [{ eventType: { teamId: { in: [11, 12] } } }, { userId: { in: [1, 2] } }],
      });
      expect(JSON.stringify(where)).not.toContain("notIn");
      expect(prismaMock.webhookScheduledTriggers.createMany).toHaveBeenCalledTimes(1);
    });

    it("deletes scheduled triggers for removed triggers", async () => {
      prismaMock.booking.findMany.mockResolvedValue([buildBooking(1)]);

      await updateTriggerForExistingBookings(webhook, [WebhookTriggerEvents.MEETING_ENDED], []);

      expect(prismaMock.webhookScheduledTriggers.createMany).not.toHaveBeenCalled();
      expect(prismaMock.webhookScheduledTriggers.deleteMany).toHaveBeenCalledWith({
        where: { webhookId: "webhook-1", payload: { contains: '"triggerEvent":"MEETING_ENDED"' } },
      });
    });
  });

  describe("cancelNoShowTasksForBooking", () => {
    it("deletes the tasks of all the webhook's bookings with batched queries", async () => {
      prismaMock.booking.findMany.mockResolvedValue(
        Array.from({ length: 501 }, (_, i) => buildBooking(i + 1))
      );

      await cancelNoShowTasksForBooking({ webhook });

      expect(prismaMock.task.deleteMany).toHaveBeenCalledTimes(2);
      const firstUids = prismaMock.task.deleteMany.mock.calls[0][0].where.referenceUid.in;
      expect(firstUids).toHaveLength(500);
      expect(firstUids[0]).toBe("uid-1");
      expect(prismaMock.task.deleteMany.mock.calls[1][0]).toEqual({
        where: { referenceUid: { in: ["uid-501"] } },
      });
    });

    it("does nothing when the webhook has no upcoming bookings", async () => {
      prismaMock.booking.findMany.mockResolvedValue([]);

      await cancelNoShowTasksForBooking({ webhook });

      expect(prismaMock.task.deleteMany).not.toHaveBeenCalled();
    });
  });
});
