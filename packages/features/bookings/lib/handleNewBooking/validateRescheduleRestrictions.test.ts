import { ErrorCode } from "@calcom/lib/errorCodes";
import { HttpError } from "@calcom/lib/http-error";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSeatedBookingMock, getOriginalRescheduledBookingMock } = vi.hoisted(() => ({
  getSeatedBookingMock: vi.fn(),
  getOriginalRescheduledBookingMock: vi.fn(),
}));

vi.mock("./getSeatedBooking", () => ({ getSeatedBooking: getSeatedBookingMock }));
vi.mock("./originalRescheduledBookingUtils", () => ({
  getOriginalRescheduledBooking: getOriginalRescheduledBookingMock,
}));

import { validateRescheduleRestrictions } from "./validateRescheduleRestrictions";

const eventType = { seatsPerTimeSlot: null, minimumRescheduleNotice: null };
const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

describe("validateRescheduleRestrictions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null without querying when it is not a reschedule", async () => {
    await expect(validateRescheduleRestrictions({ rescheduleUid: null, userId: 1, eventType })).resolves.toBe(
      null
    );
    expect(getSeatedBookingMock).not.toHaveBeenCalled();
    expect(getOriginalRescheduledBookingMock).not.toHaveBeenCalled();
  });

  it("returns the seat and original booking it loaded so the caller can reuse them", async () => {
    const originalBooking = { userId: 2, startTime: farFuture, eventType: { minimumRescheduleNotice: null } };
    getSeatedBookingMock.mockResolvedValue(null);
    getOriginalRescheduledBookingMock.mockResolvedValue(originalBooking);

    const lookup = await validateRescheduleRestrictions({ rescheduleUid: "uid-1", userId: 1, eventType });

    expect(lookup).toEqual({
      rescheduleUid: "uid-1",
      bookingSeat: null,
      originalRescheduledBooking: originalBooking,
    });
    expect(getOriginalRescheduledBookingMock).toHaveBeenCalledWith("uid-1", false);
  });

  it("resolves the original booking through the seat's booking uid", async () => {
    const bookingSeat = { booking: { uid: "booking-uid" }, attendeeId: 7 };
    const originalBooking = { userId: 2, startTime: farFuture, eventType: null };
    getSeatedBookingMock.mockResolvedValue(bookingSeat);
    getOriginalRescheduledBookingMock.mockResolvedValue(originalBooking);

    const lookup = await validateRescheduleRestrictions({
      rescheduleUid: "seat-uid",
      userId: null,
      eventType: { seatsPerTimeSlot: 3, minimumRescheduleNotice: null },
    });

    expect(getOriginalRescheduledBookingMock).toHaveBeenCalledWith("booking-uid", true);
    expect(lookup).toEqual({
      rescheduleUid: "seat-uid",
      bookingSeat,
      originalRescheduledBooking: originalBooking,
    });
  });

  it.each([
    new HttpError({ statusCode: 404, message: "Could not find original booking" }),
    new HttpError({ statusCode: 400, message: ErrorCode.CancelledBookingsCannotBeRescheduled }),
  ])("rethrows HttpError %s from the original booking lookup", async (error) => {
    getSeatedBookingMock.mockResolvedValue(null);
    getOriginalRescheduledBookingMock.mockRejectedValue(error);

    await expect(
      validateRescheduleRestrictions({ rescheduleUid: "uid-1", userId: 1, eventType })
    ).rejects.toBe(error);
  });

  it("swallows other errors and returns no original booking so the caller queries it again", async () => {
    getSeatedBookingMock.mockResolvedValue(null);
    getOriginalRescheduledBookingMock.mockRejectedValue(new Error("connection reset"));

    const lookup = await validateRescheduleRestrictions({ rescheduleUid: "uid-1", userId: 1, eventType });

    expect(lookup).toEqual({ rescheduleUid: "uid-1", bookingSeat: null, originalRescheduledBooking: null });
  });

  it("throws 403 for a non-organizer within the minimum reschedule notice", async () => {
    getSeatedBookingMock.mockResolvedValue(null);
    getOriginalRescheduledBookingMock.mockResolvedValue({
      userId: 2,
      startTime: new Date(Date.now() + 10 * 60 * 1000),
      eventType: { minimumRescheduleNotice: 60 },
    });

    await expect(
      validateRescheduleRestrictions({ rescheduleUid: "uid-1", userId: 1, eventType })
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
