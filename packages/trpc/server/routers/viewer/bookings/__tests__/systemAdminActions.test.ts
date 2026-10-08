import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getUserSessionMock,
  doesUserIdHaveAccessToBookingMock,
  doesSystemAdminHaveAccessToBookingMock,
  prismaMock,
  bookingRepositoryMock,
  findUserByIdOrThrowMock,
} = vi.hoisted(() => ({
  getUserSessionMock: vi.fn(),
  doesUserIdHaveAccessToBookingMock: vi.fn(),
  // Mirrors the real service once the database role is confirmed: access follows the session check.
  doesSystemAdminHaveAccessToBookingMock: vi.fn(
    async ({ isSystemAdmin }: { isSystemAdmin: boolean }) => isSystemAdmin
  ),
  prismaMock: {
    booking: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  },
  bookingRepositoryMock: {
    findByUidIncludeEventTypeAndReferences: vi.fn(),
    updateBookingStatus: vi.fn(),
  },
  findUserByIdOrThrowMock: vi.fn(),
}));

vi.mock("@calcom/features/auth/lib/userFromSessionUtils", () => ({
  getUserSession: getUserSessionMock,
}));

vi.mock("@calcom/features/audit-log/adminAuditLog", () => ({
  recordAdminAction: vi.fn(),
  recordAdminDenial: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn() }));

vi.mock("@calcom/features/di/containers/BookingAccessService", () => ({
  getBookingAccessService: () => ({
    doesUserIdHaveAccessToBooking: doesUserIdHaveAccessToBookingMock,
    doesSystemAdminHaveAccessToBooking: doesSystemAdminHaveAccessToBookingMock,
  }),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: prismaMock,
  default: prismaMock,
  readonlyPrisma: prismaMock,
}));

vi.mock("@calcom/features/bookings/repositories/BookingRepository", () => ({
  BookingRepository: vi.fn(function () {
    return bookingRepositoryMock;
  }),
}));

vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  UserRepository: vi.fn(function () {
    return { findByIdOrThrow: findUserByIdOrThrowMock };
  }),
}));

import { createContextInner } from "../../../../createContext";
import { createCallerFactory, router } from "../../../../trpc";
import { confirmHandler } from "../confirm.handler";
import { requestRescheduleHandler } from "../requestReschedule.handler";
import { hasBookingAccessOrIsSystemAdmin } from "../systemAdminBookingAccess";
import { bookingsProcedure } from "../util";

type Role = "USER" | "ADMIN";

const ADMIN_ID = 1;
const ORGANIZER_ID = 2;

const impersonatedBy = { id: 99, uuid: "impersonator-uuid", role: "ADMIN" as const };

function buildSession(user: Partial<Session["user"]> = {}): Session {
  return {
    hasValidLicense: true,
    upId: `usr-${ADMIN_ID}`,
    expires: new Date(Date.now() + 60_000).toISOString(),
    user: { id: ADMIN_ID, uuid: "admin-uuid", email: "admin@example.com", role: "ADMIN", ...user },
  };
}

// The three callers every action must distinguish: an acting admin, a regular user, and an admin
// session impersonating someone (here an admin too, the worst case).
const actors: { label: string; role: Role; session: Session; allowed: boolean }[] = [
  { label: "an acting system admin", role: "ADMIN", session: buildSession(), allowed: true },
  { label: "a regular user", role: "USER", session: buildSession({ role: "USER" }), allowed: false },
  {
    label: "an impersonating admin",
    role: "ADMIN",
    session: buildSession({ impersonatedBy }),
    allowed: false,
  },
];

const sessionUser = (role: Role) => ({
  id: ADMIN_ID,
  uuid: "admin-uuid",
  email: "admin@example.com",
  username: "admin",
  name: "Admin",
  role,
  locale: "en",
  timeZone: "UTC",
  destinationCalendar: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  doesUserIdHaveAccessToBookingMock.mockResolvedValue(false);
});

describe("hasBookingAccessOrIsSystemAdmin (confirm, reject, booking details)", () => {
  it("keeps regular access without evaluating the admin case", async () => {
    doesUserIdHaveAccessToBookingMock.mockResolvedValue(true);

    await expect(
      hasBookingAccessOrIsSystemAdmin({
        actor: { user: { id: 5, role: "USER" }, session: { user: {} } },
        bookingId: 10,
        path: "viewer.bookings.confirm",
        action: "confirm",
      })
    ).resolves.toBe(true);
    expect(doesSystemAdminHaveAccessToBookingMock).not.toHaveBeenCalled();
  });

  it.each(actors)("for $label, grants access: $allowed", async ({ role, session, allowed }) => {
    await expect(
      hasBookingAccessOrIsSystemAdmin({
        actor: { user: { id: ADMIN_ID, role }, session },
        bookingId: 10,
        path: "viewer.bookings.confirm",
        action: "reject",
      })
    ).resolves.toBe(allowed);
    expect(doesSystemAdminHaveAccessToBookingMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ADMIN_ID, isSystemAdmin: allowed, bookingId: 10, action: "reject" })
    );
  });
});

describe("confirmHandler", () => {
  beforeEach(() => {
    // Already accepted: once authorized the handler stops with BAD_REQUEST, before any side effect.
    prismaMock.booking.findUniqueOrThrow.mockResolvedValue({
      status: "ACCEPTED",
      user: { id: ORGANIZER_ID, email: "organizer@example.com" },
      payment: [],
    });
  });

  it.each(actors)("handles $label", async ({ role, session, allowed }) => {
    const result = confirmHandler({
      ctx: {
        user: sessionUser(role),
        session,
        traceContext: { traceId: "t", spanId: "s", operation: "confirm" },
      },
      input: { bookingId: 10, confirmed: true },
    });

    if (allowed) {
      await expect(result).rejects.toMatchObject({
        code: "BAD_REQUEST",
        message: "Booking already confirmed",
      });
    } else {
      await expect(result).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("never grants the admin access to callers without a session (API v2, magic links)", async () => {
    await expect(
      confirmHandler({
        ctx: {
          user: sessionUser("ADMIN"),
          traceContext: { traceId: "t", spanId: "s", operation: "confirm" },
        },
        input: { bookingId: 10, confirmed: false },
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("bookingsProcedure (editLocation)", () => {
  const testRouter = router({
    editLocation: bookingsProcedure.mutation(({ ctx }) => ({
      bookingId: ctx.booking.id,
      isSystemAdminAction: ctx.isSystemAdminAction ?? false,
    })),
  });
  const createCaller = createCallerFactory(testRouter);

  async function callerFor(role: Role, session: Session) {
    getUserSessionMock.mockResolvedValue({ user: { ...sessionUser(role), twoFactorEnabled: true }, session });
    return createCaller(await createContextInner({ locale: "en", session }));
  }

  beforeEach(() => {
    // Neither team admin nor organizer: only the system admin case can grant access.
    prismaMock.booking.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      "eventType" in where || "AND" in where ? null : { id: 10, userId: ORGANIZER_ID }
    );
  });

  it.each(actors)("handles $label", async ({ role, session, allowed }) => {
    const caller = await callerFor(role, session);
    const result = caller.editLocation({ bookingId: 10 });

    if (allowed) {
      await expect(result).resolves.toEqual({ bookingId: 10, isSystemAdminAction: true });
      expect(doesSystemAdminHaveAccessToBookingMock).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: 10, path: "editLocation", action: "editLocation" })
      );
    } else {
      await expect(result).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    }
  });

  it("does not flag the organizer's own edits as admin actions", async () => {
    prismaMock.booking.findFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      "AND" in where ? { id: 10, userId: ADMIN_ID } : null
    );
    const caller = await callerFor("ADMIN", buildSession());

    await expect(caller.editLocation({ bookingId: 10 })).resolves.toEqual({
      bookingId: 10,
      isSystemAdminAction: false,
    });
    expect(doesSystemAdminHaveAccessToBookingMock).not.toHaveBeenCalled();
  });
});

describe("requestRescheduleHandler", () => {
  const stopAfterAuthorization = new Error("stop after authorization");

  beforeEach(() => {
    bookingRepositoryMock.findByUidIncludeEventTypeAndReferences.mockResolvedValue({
      id: 10,
      uid: "booking-uid",
      status: "ACCEPTED",
      userId: ORGANIZER_ID,
      user: { id: ORGANIZER_ID, email: "organizer@example.com" },
      eventType: { teamId: null },
      dynamicEventSlugRef: null,
      attendees: [],
      references: [],
    });
    findUserByIdOrThrowMock.mockResolvedValue({
      id: ORGANIZER_ID,
      email: "organizer@example.com",
      name: "Organizer",
      username: "organizer",
      locale: "en",
      timeZone: "UTC",
    });
    bookingRepositoryMock.updateBookingStatus.mockRejectedValue(stopAfterAuthorization);
  });

  it.each(actors)("handles $label", async ({ role, session, allowed }) => {
    const result = requestRescheduleHandler({
      ctx: {
        user: sessionUser(role) as Parameters<typeof requestRescheduleHandler>[0]["ctx"]["user"],
        session,
      },
      input: { bookingUid: "booking-uid", rescheduleReason: "" },
      source: "WEBAPP",
    });

    if (allowed) {
      await expect(result).rejects.toBe(stopAfterAuthorization);
      // The admin is recorded as the canceller; the organizer stays the sender of the emails.
      expect(bookingRepositoryMock.updateBookingStatus).toHaveBeenCalledWith(
        expect.objectContaining({ cancelledBy: "admin@example.com" })
      );
      expect(findUserByIdOrThrowMock).toHaveBeenCalledWith({ id: ORGANIZER_ID });
    } else {
      await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(bookingRepositoryMock.updateBookingStatus).not.toHaveBeenCalled();
    }
  });
});
