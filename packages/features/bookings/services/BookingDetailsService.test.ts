import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RescheduleNode } from "../lib/rescheduleHistory";
import { BookingRepository } from "../repositories/BookingRepository";
import { BookingAccessService } from "./BookingAccessService";
import { BookingDetailsService } from "./BookingDetailsService";

vi.mock("../repositories/BookingRepository");
vi.mock("./BookingAccessService");

const makeNode = (overrides: Partial<RescheduleNode> & { uid: string }): RescheduleNode => ({
  startTime: new Date("2026-11-01T10:00:00Z"),
  endTime: new Date("2026-11-01T10:30:00Z"),
  createdAt: new Date("2026-10-01T09:00:00Z"),
  updatedAt: null,
  rescheduled: null,
  fromReschedule: null,
  rescheduledBy: null,
  cancelledBy: null,
  cancellationReason: null,
  ...overrides,
});

describe("BookingDetailsService", () => {
  const a = makeNode({ uid: "a", rescheduled: true, rescheduledBy: "attendee@example.com" });
  const b = makeNode({ uid: "b", rescheduled: true, fromReschedule: "a" });
  const c = makeNode({ uid: "c", fromReschedule: "b", cancellationReason: "Changement de plan" });
  const nodes = [a, b, c];

  let repo: {
    findByUidForDetails: ReturnType<typeof vi.fn>;
    findRescheduleNodeByUid: ReturnType<typeof vi.fn>;
    findRescheduleNodeByFromReschedule: ReturnType<typeof vi.fn>;
  };
  let access: {
    doesUserIdHaveAccessToBooking: ReturnType<typeof vi.fn>;
    doesSystemAdminHaveAccessToBooking: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo = {
      findByUidForDetails: vi.fn(),
      findRescheduleNodeByUid: vi.fn(
        async ({ uid }: { uid: string }) => nodes.find((node) => node.uid === uid) ?? null
      ),
      findRescheduleNodeByFromReschedule: vi.fn(
        async ({ fromReschedule }: { fromReschedule: string }) =>
          nodes.find((node) => node.fromReschedule === fromReschedule) ?? null
      ),
    };
    access = {
      doesUserIdHaveAccessToBooking: vi.fn().mockResolvedValue(true),
      doesSystemAdminHaveAccessToBooking: vi.fn().mockResolvedValue(false),
    };
    vi.mocked(BookingRepository).mockImplementation(function () {
      return repo as unknown as BookingRepository;
    });
    vi.mocked(BookingAccessService).mockImplementation(function () {
      return access as unknown as BookingAccessService;
    });
  });

  const service = () => new BookingDetailsService({} as PrismaClient);

  it("returns the neighbours and the full history for a booking in the middle of a chain", async () => {
    repo.findByUidForDetails.mockResolvedValue({
      uid: "b",
      rescheduled: true,
      fromReschedule: "a",
      tracking: null,
    });

    const result = await service().getBookingDetails({ userId: 1, bookingUid: "b" });

    expect(result.previousBooking).toEqual({ uid: "a", startTime: a.startTime, endTime: a.endTime });
    expect(result.rescheduledToBooking).toEqual({ uid: "c" });
    expect(result.rescheduleHistory.map((entry) => [entry.from.uid, entry.to?.uid])).toEqual([
      ["a", "b"],
      ["b", "c"],
    ]);
    expect(result.rescheduleHistory[0].actor).toBe("attendee@example.com");
    expect(result.rescheduleHistory[1].reason).toBe("Changement de plan");
  });

  it("skips the chain lookup for a booking that was never rescheduled", async () => {
    repo.findByUidForDetails.mockResolvedValue({
      uid: "solo",
      rescheduled: null,
      fromReschedule: null,
      tracking: null,
    });

    const result = await service().getBookingDetails({ userId: 1, bookingUid: "solo" });

    expect(result).toEqual({
      rescheduledToBooking: null,
      previousBooking: null,
      rescheduleHistory: [],
      tracking: null,
    });
    expect(repo.findRescheduleNodeByUid).not.toHaveBeenCalled();
  });

  it("does not expose the history without access", async () => {
    access.doesUserIdHaveAccessToBooking.mockResolvedValue(false);

    await expect(service().getBookingDetails({ userId: 1, bookingUid: "b" })).rejects.toThrow(
      "You do not have permission to view this booking"
    );
    expect(repo.findRescheduleNodeByUid).not.toHaveBeenCalled();
  });
});
