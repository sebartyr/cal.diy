import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const { prismaMock, sendOrganizerRequestReminderEmail } = vi.hoisted(() => ({
  prismaMock: {
    booking: { findMany: vi.fn() },
    reminderMail: { findMany: vi.fn(), create: vi.fn() },
  },
  sendOrganizerRequestReminderEmail: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextRequest: class MockNextRequest {
    url: string;
    method: string;
    nextUrl: { searchParams: URLSearchParams };
    private _headers: Map<string, string>;

    constructor(url: string, options: { method?: string } = {}) {
      this.url = url;
      this.method = options.method || "POST";
      this._headers = new Map();
      this.nextUrl = { searchParams: new URLSearchParams(url.split("?")[1] || "") };
    }

    headers = {
      get: (key: string): string | null => this._headers.get(key.toLowerCase()) || null,
      set: (key: string, value: string): void => {
        this._headers.set(key.toLowerCase(), value);
      },
    };
  },
  NextResponse: {
    json: vi.fn((body, init) => ({
      json: vi.fn().mockResolvedValue(body),
      status: init?.status || 200,
    })),
  },
}));

vi.mock("@calcom/prisma", () => ({
  default: prismaMock,
  bookingMinimalSelect: { id: true, createdAt: true },
}));
vi.mock("@calcom/emails/email-manager", () => ({ sendOrganizerRequestReminderEmail }));
vi.mock("@calcom/i18n/server", () => ({ getTranslation: vi.fn(async () => (key: string) => key) }));
vi.mock("@calcom/features/bookings/lib/getCalEventResponses", () => ({
  getCalEventResponses: vi.fn(() => ({ responses: {} })),
}));

const NOW = new Date("2026-10-09T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;
const URL_BASE = "http://localhost/api/cron/bookingReminder";

function buildBooking({
  id,
  ageHours,
  user,
}: {
  id: number;
  ageHours: number;
  user?: Record<string, unknown> | null;
}) {
  return {
    id,
    title: `Booking ${id}`,
    description: null,
    customInputs: null,
    userPrimaryEmail: null,
    startTime: new Date(NOW.getTime() + 24 * HOUR_MS),
    endTime: new Date(NOW.getTime() + 25 * HOUR_MS),
    createdAt: new Date(NOW.getTime() - ageHours * HOUR_MS),
    attendees: [{ name: "Attendee", email: "attendee@example.com", timeZone: "UTC", locale: "en" }],
    location: null,
    responses: {},
    uid: `uid-${id}`,
    destinationCalendar: null,
    eventType: { recurringEvent: null, bookingFields: null, metadata: null },
    user:
      user === null
        ? null
        : {
            id: 1,
            email: "organizer@example.com",
            name: "Organizer",
            username: "organizer",
            locale: "en",
            timeZone: "UTC",
            destinationCalendar: null,
            isPlatformManaged: false,
            platformOAuthClients: [],
            ...user,
          },
  };
}

async function callRoute() {
  const request = new NextRequest(URL_BASE);
  request.headers.set("authorization", "test-cron-key");
  const { POST } = await import("../route");
  const response = await POST(request, { params: Promise.resolve({}) });
  return { status: response.status, body: await response.json() };
}

function remindedTiers() {
  return prismaMock.reminderMail.create.mock.calls.map(([{ data }]) => [
    data.referenceId,
    data.elapsedMinutes,
  ]);
}

describe("/api/cron/bookingReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("CRON_API_KEY", "test-cron-key");
    prismaMock.booking.findMany.mockResolvedValue([]);
    prismaMock.reminderMail.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  test("rejects an unauthenticated call without querying", async () => {
    const { POST } = await import("../route");
    const response = await POST(new NextRequest(`${URL_BASE}?apiKey=wrong`), { params: Promise.resolve({}) });

    expect(response.status).toBe(401);
    expect(prismaMock.booking.findMany).not.toHaveBeenCalled();
  });

  test("reads bookings and reminders once for every tier", async () => {
    prismaMock.booking.findMany.mockResolvedValue([buildBooking({ id: 1, ageHours: 4 })]);

    await callRoute();

    expect(prismaMock.booking.findMany).toHaveBeenCalledOnce();
    expect(prismaMock.booking.findMany.mock.calls[0][0].where).toMatchObject({
      createdAt: { lte: new Date(NOW.getTime() - 3 * HOUR_MS) },
      endTime: { gte: NOW },
    });
    expect(prismaMock.reminderMail.findMany).toHaveBeenCalledOnce();
    expect(prismaMock.reminderMail.findMany).toHaveBeenCalledWith({
      where: {
        reminderType: "PENDING_BOOKING_CONFIRMATION",
        referenceId: { in: [1] },
        elapsedMinutes: { gte: 180 },
      },
      select: { referenceId: true, elapsedMinutes: true },
    });
  });

  test("sends only the longest reached tier that was not reminded yet", async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({ id: 1, ageHours: 50 }),
      buildBooking({ id: 2, ageHours: 30 }),
      buildBooking({ id: 3, ageHours: 4 }),
      buildBooking({ id: 4, ageHours: 50 }),
      buildBooking({ id: 5, ageHours: 30 }),
      buildBooking({ id: 6, ageHours: 4 }),
    ]);
    prismaMock.reminderMail.findMany.mockResolvedValue([
      { referenceId: 2, elapsedMinutes: 180 },
      { referenceId: 4, elapsedMinutes: 180 },
      { referenceId: 4, elapsedMinutes: 2880 },
      { referenceId: 5, elapsedMinutes: 1440 },
      { referenceId: 6, elapsedMinutes: 180 },
    ]);

    const { body } = await callRoute();

    expect(remindedTiers()).toEqual([
      [1, 2880],
      [2, 1440],
      [3, 180],
    ]);
    expect(sendOrganizerRequestReminderEmail).toHaveBeenCalledTimes(3);
    expect(body).toEqual({ notificationsSent: 3 });
  });

  test("ignores bookings younger than the shortest tier", async () => {
    prismaMock.booking.findMany.mockResolvedValue([buildBooking({ id: 1, ageHours: 2 })]);

    const { body } = await callRoute();

    expect(sendOrganizerRequestReminderEmail).not.toHaveBeenCalled();
    expect(body).toEqual({ notificationsSent: 0 });
  });

  test("records each reminder right after its email so a failure does not resend sent ones", async () => {
    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({ id: 1, ageHours: 50 }),
      buildBooking({ id: 2, ageHours: 50 }),
    ]);
    sendOrganizerRequestReminderEmail
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("smtp"));

    const { status } = await callRoute();

    expect(status).toBe(500);

    expect(remindedTiers()).toEqual([[1, 2880]]);
    expect(prismaMock.reminderMail.create.mock.invocationCallOrder[0]).toBeGreaterThan(
      sendOrganizerRequestReminderEmail.mock.invocationCallOrder[0]
    );
    expect(prismaMock.reminderMail.create.mock.invocationCallOrder[0]).toBeLessThan(
      sendOrganizerRequestReminderEmail.mock.invocationCallOrder[1]
    );
  });

  test("skips platform-managed users without emails enabled and bookings missing organizer data", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prismaMock.booking.findMany.mockResolvedValue([
      buildBooking({ id: 1, ageHours: 50, user: { isPlatformManaged: true, platformOAuthClients: [] } }),
      buildBooking({
        id: 2,
        ageHours: 50,
        user: { isPlatformManaged: true, platformOAuthClients: [{ id: "c", areEmailsEnabled: true }] },
      }),
      buildBooking({ id: 3, ageHours: 50, user: { timeZone: null } }),
      buildBooking({ id: 4, ageHours: 50, user: null }),
    ]);

    const { body } = await callRoute();

    expect(prismaMock.reminderMail.findMany.mock.calls[0][0].where.referenceId).toEqual({ in: [2, 3, 4] });
    expect(remindedTiers()).toEqual([[2, 2880]]);
    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(body).toEqual({ notificationsSent: 1 });
    consoleError.mockRestore();
  });
});
