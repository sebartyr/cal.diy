import { beforeEach, describe, expect, it, vi } from "vitest";

const { bookingInternalNoteCreate } = vi.hoisted(() => ({ bookingInternalNoteCreate: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  default: {
    bookingInternalNote: { create: bookingInternalNoteCreate },
    internalNotePreset: { findFirstOrThrow: vi.fn() },
  },
}));

import type { BookingToDelete } from "./getBookingToDelete";
import { handleInternalNote } from "./handleInternalNote";

const buildBooking = (hostUserIds: number[], ownerId: number | null = null) =>
  ({
    id: 1,
    eventType: {
      owner: ownerId ? { id: ownerId, hideBranding: false } : null,
      hosts: hostUserIds.map((userId) => ({ userId, user: { email: `${userId}@example.com` } })),
    },
  }) as unknown as BookingToDelete;

const otherNote = { id: -1, name: "Other", value: "note" };

describe("handleInternalNote", () => {
  beforeEach(() => {
    bookingInternalNoteCreate.mockReset();
    bookingInternalNoteCreate.mockResolvedValue({ id: 1 });
  });

  it("lets a host of the event type add a note", async () => {
    await handleInternalNote({
      internalNote: otherNote,
      booking: buildBooking([5, 6]),
      userId: 6,
      teamId: 1,
    });

    expect(bookingInternalNoteCreate).toHaveBeenCalledOnce();
  });

  it("lets the event type owner add a note", async () => {
    await handleInternalNote({
      internalNote: otherNote,
      booking: buildBooking([5], 7),
      userId: 7,
      teamId: 1,
    });

    expect(bookingInternalNoteCreate).toHaveBeenCalledOnce();
  });

  it("rejects a user who is neither host nor owner", async () => {
    await expect(
      handleInternalNote({ internalNote: otherNote, booking: buildBooking([5, 6], 7), userId: 8, teamId: 1 })
    ).rejects.toThrow("You do not have permission to add an internal note to this booking.");
    expect(bookingInternalNoteCreate).not.toHaveBeenCalled();
  });
});
