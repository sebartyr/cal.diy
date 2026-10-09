import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcSessionUser } from "../../../types";

const { mockCount, mockGroupBy } = vi.hoisted(() => ({
  mockCount: vi.fn(),
  mockGroupBy: vi.fn(),
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {
    booking: {
      count: (...args: unknown[]) => mockCount(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
  },
}));

import { bookingUnconfirmedCountHandler } from "./bookingUnconfirmedCount.handler";

const ctx = { user: { id: 7 } as unknown as NonNullable<TrpcSessionUser> };

describe("bookingUnconfirmedCountHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts each recurring series of pending bookings once", async () => {
    mockCount.mockResolvedValue(6);
    mockGroupBy.mockResolvedValue([
      { recurringEventId: "series-a", _count: { recurringEventId: 3 } },
      { recurringEventId: "series-b", _count: { recurringEventId: 2 } },
    ]);

    await expect(bookingUnconfirmedCountHandler({ ctx })).resolves.toBe(3);
  });

  it("returns the plain count when there is no recurring booking", async () => {
    mockCount.mockResolvedValue(2);
    mockGroupBy.mockResolvedValue([]);

    await expect(bookingUnconfirmedCountHandler({ ctx })).resolves.toBe(2);
  });

  it("filters both queries on the same user and the same instant", async () => {
    mockCount.mockResolvedValue(0);
    mockGroupBy.mockResolvedValue([]);

    await bookingUnconfirmedCountHandler({ ctx });

    const countWhere = mockCount.mock.calls[0][0].where;
    const groupByWhere = mockGroupBy.mock.calls[0][0].where;
    expect(countWhere).toMatchObject({ status: "PENDING", userId: 7 });
    expect(groupByWhere).toMatchObject({ status: { equals: "PENDING" }, userId: 7 });
    expect(groupByWhere.endTime.gt).toBe(countWhere.endTime.gt);
  });

  it("runs the count and the recurring grouping in parallel", async () => {
    let resolveCount: (value: number) => void = () => {};
    mockCount.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          resolveCount = resolve;
        })
    );
    mockGroupBy.mockResolvedValue([]);

    const resultPromise = bookingUnconfirmedCountHandler({ ctx });
    await vi.waitFor(() => expect(mockGroupBy).toHaveBeenCalledTimes(1));

    resolveCount(4);
    await expect(resultPromise).resolves.toBe(4);
  });
});
