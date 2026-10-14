import { FAKE_JITSI_CREDENTIAL } from "@calcom/app-store/jitsivideo/lib/fakeCredential";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { CredentialForCalendarService } from "@calcom/types/Credential";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { appFindUnique, getVideoAdapters, jitsiCreateMeeting, zoomCreateMeeting } = vi.hoisted(() => ({
  appFindUnique: vi.fn(),
  getVideoAdapters: vi.fn(),
  jitsiCreateMeeting: vi.fn(),
  zoomCreateMeeting: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({ prisma: { app: { findUnique: appFindUnique } } }));
vi.mock("@calcom/app-store/getVideoAdapters", () => ({ getVideoAdapters }));
vi.mock("@calcom/emails/integration-email-service", () => ({
  sendBrokenIntegrationEmail: vi.fn(),
}));

import { createMeeting } from "./videoClient";

const ZOOM_CREDENTIAL = {
  ...FAKE_JITSI_CREDENTIAL,
  id: 7,
  type: "zoom_video",
  appId: "zoom",
} as CredentialForCalendarService;

const JITSI_MEETING = { type: "jitsi_video", id: "room", password: "", url: "https://meet.jit.si/cal/room" };

const calEvent = () =>
  ({
    uid: "booking-uid",
    title: "Meeting",
    startTime: "2030-01-07T09:00:00.000Z",
    endTime: "2030-01-07T09:30:00.000Z",
    organizer: { email: "organizer@example.com", name: "Organizer", timeZone: "UTC", language: {} },
    attendees: [],
  }) as unknown as CalendarEvent;

const enabledApps = (...slugs: string[]) =>
  appFindUnique.mockImplementation(async ({ where }: { where: { slug: string } }) => ({
    enabled: slugs.includes(where.slug),
  }));

describe("createMeeting Jitsi fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    jitsiCreateMeeting.mockResolvedValue(JITSI_MEETING);
    zoomCreateMeeting.mockRejectedValue(new Error("zoom is down"));
    getVideoAdapters.mockImplementation(async ([credential]: CredentialForCalendarService[]) => [
      { createMeeting: credential.appId === "zoom" ? zoomCreateMeeting : jitsiCreateMeeting },
    ]);
  });

  it("falls back to Jitsi when another provider fails and Jitsi is enabled", async () => {
    enabledApps("zoom", "jitsi");

    const result = await createMeeting(ZOOM_CREDENTIAL, calEvent());

    expect(result.createdEvent).toEqual(JITSI_MEETING);
  });

  it("does not fall back to Jitsi when it is disabled", async () => {
    enabledApps("zoom");

    const result = await createMeeting(ZOOM_CREDENTIAL, calEvent());

    expect(jitsiCreateMeeting).not.toHaveBeenCalled();
    expect(result.createdEvent).toBeUndefined();
    expect(result.success).toBe(false);
  });

  it("creates no Jitsi meeting when Jitsi itself is requested but disabled", async () => {
    enabledApps();

    const result = await createMeeting(FAKE_JITSI_CREDENTIAL, calEvent());

    expect(jitsiCreateMeeting).not.toHaveBeenCalled();
    expect(result.createdEvent).toBeUndefined();
  });
});
