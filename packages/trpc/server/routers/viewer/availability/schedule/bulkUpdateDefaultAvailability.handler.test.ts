import prismaMock from "@calcom/testing/lib/__mocks__/prismaMock";
import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../../types";
import { bulkUpdateToDefaultAvailabilityHandler } from "./bulkUpdateDefaultAvailability.handler";

const mockFindScheduleByIdForOwnershipCheck = vi.fn();

vi.mock("@calcom/features/schedules/repositories/ScheduleRepository", () => ({
  ScheduleRepository: vi.fn().mockImplementation(function () {
    return { findScheduleByIdForOwnershipCheck: mockFindScheduleByIdForOwnershipCheck };
  }),
}));

const USER_ID = 1;
const user = { id: USER_ID, defaultScheduleId: 5 } as NonNullable<TrpcSessionUser>;

describe("bulkUpdateToDefaultAvailabilityHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.eventType.updateMany.mockResolvedValue({ count: 2 });
  });

  it("rejects a selectedDefaultScheduleId owned by another user", async () => {
    mockFindScheduleByIdForOwnershipCheck.mockResolvedValue({ userId: 2 });

    await expect(
      bulkUpdateToDefaultAvailabilityHandler({
        ctx: { user },
        input: { eventTypeIds: [10, 11], selectedDefaultScheduleId: 99 },
      })
    ).rejects.toThrow(
      new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this schedule" })
    );
    expect(prismaMock.eventType.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a selectedDefaultScheduleId that does not exist", async () => {
    mockFindScheduleByIdForOwnershipCheck.mockResolvedValue(null);

    await expect(
      bulkUpdateToDefaultAvailabilityHandler({
        ctx: { user },
        input: { eventTypeIds: [10], selectedDefaultScheduleId: 99 },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(prismaMock.eventType.updateMany).not.toHaveBeenCalled();
  });

  it("applies a selectedDefaultScheduleId owned by the current user", async () => {
    mockFindScheduleByIdForOwnershipCheck.mockResolvedValue({ userId: USER_ID });

    await bulkUpdateToDefaultAvailabilityHandler({
      ctx: { user },
      input: { eventTypeIds: [10, 11], selectedDefaultScheduleId: 7 },
    });

    expect(mockFindScheduleByIdForOwnershipCheck).toHaveBeenCalledWith({ scheduleId: 7 });
    expect(prismaMock.eventType.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [10, 11] }, userId: USER_ID },
      data: { scheduleId: 7 },
    });
  });

  it("falls back to the user's default schedule without an ownership lookup", async () => {
    await bulkUpdateToDefaultAvailabilityHandler({
      ctx: { user },
      input: { eventTypeIds: [10] },
    });

    expect(mockFindScheduleByIdForOwnershipCheck).not.toHaveBeenCalled();
    expect(prismaMock.eventType.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { scheduleId: 5 } })
    );
  });
});
