// The public booking page must not let a booking uid reveal the other bookings of its reschedule chain.
import type { GetServerSidePropsContext } from "next";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ----- Fake database: A -> B -> C reschedule chain, three "different" participants -----
const BOOKING_A_UID = "uid-booking-A-original";
const BOOKING_B_UID = "uid-booking-B-rescheduled";
const BOOKING_C_UID = "uid-booking-C-rescheduled-again";

function fakeBookingInfo(uid: string, fromReschedule: string | null, rescheduled: boolean) {
  const bookingInfo = {
    id: 1,
    uid,
    title: "Consultation",
    description: "notes",
    status: rescheduled ? "CANCELLED" : "ACCEPTED",
    rescheduled,
    fromReschedule,
    rescheduledBy: fromReschedule ? "rescheduler@example.com" : null,
    recurringEventId: null,
    startTime: new Date("2026-12-01T10:00:00.000Z"),
    endTime: new Date("2026-12-01T10:30:00.000Z"),
    attendees: [
      {
        name: "Attendee",
        email: "attendee@example.com",
        timeZone: "Europe/Paris",
        phoneNumber: "+33600000000",
      },
    ],
    user: { id: 7, name: "Host", email: "host@example.com", username: "host" },
    responses: { email: "attendee@example.com", notes: "details" },
    eventType: { eventName: null },
    seatsReferences: [],
  };
  const bookingInfoRaw = {
    ...bookingInfo,
    eventTypeId: 42,
  };
  return { bookingInfoRaw, bookingInfo };
}

const chain: Record<string, ReturnType<typeof fakeBookingInfo>> = {
  [BOOKING_A_UID]: fakeBookingInfo(BOOKING_A_UID, null, true),
  [BOOKING_B_UID]: fakeBookingInfo(BOOKING_B_UID, BOOKING_A_UID, true),
  [BOOKING_C_UID]: fakeBookingInfo(BOOKING_C_UID, BOOKING_B_UID, false),
};

const successors: Record<string, string> = {
  [BOOKING_A_UID]: BOOKING_B_UID,
  [BOOKING_B_UID]: BOOKING_C_UID,
};

const reschedulers: Record<string, { rescheduledBy: string | null; uid: string }> = {
  [BOOKING_A_UID]: { rescheduledBy: "host@example.com", uid: BOOKING_A_UID },
  [BOOKING_B_UID]: { rescheduledBy: "attendee@example.com", uid: BOOKING_B_UID },
};

const { mockGetServerSession, mockFindFirstBookingByReschedule, mockFindReschedulerByUid } = vi.hoisted(
  () => ({
    mockGetServerSession: vi.fn(),
    mockFindFirstBookingByReschedule: vi.fn(),
    mockFindReschedulerByUid: vi.fn(),
  })
);

vi.mock("@calcom/features/auth/lib/getServerSession", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@calcom/features/auth/lib/isSessionActingSystemAdmin", () => ({
  isSessionActingSystemAdmin: vi.fn(async () => false),
}));

vi.mock("@calcom/features/bookings/lib/getBookingInfo", () => ({
  // Fresh deep copy per call: the real getServerSideProps mutates bookingInfo.startTime/endTime.
  default: vi.fn(async (uid: string) => {
    const entry = chain[uid];
    if (!entry) return { bookingInfoRaw: undefined, bookingInfo: undefined };
    return {
      bookingInfoRaw: { ...entry.bookingInfoRaw },
      bookingInfo: { ...entry.bookingInfo, attendees: [...entry.bookingInfo.attendees] },
    };
  }),
}));

vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => ({
  BookingRepository: class {
    findFirstBookingByReschedule = mockFindFirstBookingByReschedule;
    findReschedulerByUid = mockFindReschedulerByUid;
  },
}));

vi.mock("@calcom/lib/server/maybeGetBookingUidFromSeat", () => ({
  maybeGetBookingUidFromSeat: vi.fn(async (_prisma: unknown, uid: string) => ({ uid })),
}));

vi.mock("@calcom/prisma", () => ({
  default: {
    payment: { findFirst: vi.fn(async () => null) },
    internalNotePreset: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@calcom/trpc/server/routers/viewer/me/_router", () => ({ meRouter: {} }));
vi.mock("app/_trpc/context", () => ({
  createRouterCaller: vi.fn(async () => ({
    get: async () => ({ timeZone: "Europe/Paris", timeFormat: 24 }),
  })),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: class {},
}));

vi.mock("@calcom/features/profile/lib/getBranding", () => ({
  getBrandingForEventType: vi.fn(() => ({})),
}));

vi.mock("@calcom/features/profile/lib/hideBranding", () => ({
  shouldHideBrandingForEvent: vi.fn(async () => false),
}));

const fakeEventType = {
  id: 42,
  slug: "consultation",
  seatsPerTimeSlot: null,
  requiresConfirmation: false,
  periodStartDate: null,
  periodEndDate: null,
  metadata: null,
  recurringEvent: null,
  customInputs: [],
  hideOrganizerEmail: false,
  bookingFields: [],
  users: [
    {
      id: 7,
      name: "Host",
      email: "host@example.com",
      username: "host",
      hideBranding: false,
      theme: null,
      brandColor: null,
      darkBrandColor: null,
      isPlatformManaged: false,
    },
  ],
  hosts: [],
  owner: null,
  team: null,
  parent: null,
};

vi.mock("@lib/booking", () => ({
  getRecurringBookings: vi.fn(async () => null),
  handleSeatsEventTypeOnBooking: vi.fn(async () => {}),
  getEventTypesFromDB: vi.fn(async () => fakeEventType),
}));

import { getServerSideProps } from "./bookings-single-view.getServerSideProps";

function ctxFor(uid: string): GetServerSidePropsContext {
  return { query: { uid }, req: {}, params: {} } as unknown as GetServerSidePropsContext;
}

describe("bookings single view getServerSideProps - reschedule chain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirstBookingByReschedule.mockImplementation(
      async ({ originalBookingUid }: { originalBookingUid: string }) =>
        successors[originalBookingUid] ? { uid: successors[originalBookingUid] } : null
    );
    mockFindReschedulerByUid.mockImplementation(
      async ({ uid }: { uid: string }) => reschedulers[uid] ?? null
    );
  });

  const propsFor = async (uid: string) => {
    const result = await getServerSideProps(ctxFor(uid));
    return (result as { props: Record<string, unknown> }).props;
  };

  it("gives an anonymous visitor neither neighbour uid nor the rescheduler's email", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const props = await propsFor(BOOKING_B_UID);

    expect(props.previousBooking).toBeNull();
    expect(props.rescheduledToUid).toBeNull();
    expect(mockFindFirstBookingByReschedule).not.toHaveBeenCalled();
    expect(mockFindReschedulerByUid).not.toHaveBeenCalled();
    expect(props.bookingInfo).toMatchObject({ fromReschedule: null, rescheduledBy: null });
    expect(JSON.stringify(props)).not.toContain(BOOKING_A_UID);
    expect(JSON.stringify(props)).not.toContain("rescheduler@example.com");
  });

  it("does not show the chain to a signed-in user who is not the host", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 99 } });

    const props = await propsFor(BOOKING_B_UID);

    expect(props.previousBooking).toBeNull();
    expect(props.rescheduledToUid).toBeNull();
  });

  it("shows both neighbours to the host", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: 7 } });

    const props = await propsFor(BOOKING_B_UID);

    expect(props.previousBooking).toEqual({ uid: BOOKING_A_UID, rescheduledBy: "host@example.com" });
    expect(props.rescheduledToUid).toBe(BOOKING_C_UID);
    expect(props.bookingInfo).toMatchObject({
      fromReschedule: BOOKING_A_UID,
      rescheduledBy: "rescheduler@example.com",
    });
  });
});
