import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSchedule } from "./useSchedule";

const mocks = vi.hoisted(() => ({
  fire: vi.fn(),
  updateEmbedBookerState: vi.fn(),
  trpcResult: { isSuccess: true, dataUpdatedAt: 1, failureReason: null } as Record<string, unknown>,
  v2Result: { isSuccess: false, dataUpdatedAt: 0, failureReason: null } as Record<string, unknown>,
}));

vi.mock("@calcom/embed-core/src/embed-iframe", () => ({
  updateEmbedBookerState: mocks.updateEmbedBookerState,
}));
vi.mock("@calcom/embed-core/src/sdk-event", () => ({ sdkActionManager: { fire: mocks.fire } }));
vi.mock("@calcom/features/bookings/Booker/store", () => ({
  useBookerStore: (selector: (state: { state: string }) => unknown) => selector({ state: "selecting_date" }),
}));
vi.mock("@calcom/features/schedules/hooks/useTimesForSchedule", () => ({
  useTimesForSchedule: () => ["2026-10-01T00:00:00.000Z", "2026-10-31T23:59:59.999Z"],
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    useUtils: () => ({ viewer: { slots: { getSchedule: { invalidate: vi.fn() } } } }),
    viewer: { slots: { getSchedule: { useQuery: () => ({ ...mocks.trpcResult }) } } },
  },
}));
vi.mock("./useApiV2AvailableSlots", () => ({ useApiV2AvailableSlots: () => ({ ...mocks.v2Result }) }));

const args = {
  username: "ada",
  eventSlug: "intro",
  eventId: 3,
  month: "2026-10",
  timezone: "UTC",
};

describe("useSchedule availabilityLoaded event", () => {
  beforeEach(() => {
    mocks.fire.mockClear();
    mocks.updateEmbedBookerState.mockClear();
    mocks.trpcResult = { isSuccess: true, dataUpdatedAt: 1, failureReason: null };
    mocks.v2Result = { isSuccess: false, dataUpdatedAt: 0, failureReason: null };
  });

  it("fires once per loaded response instead of once per render", () => {
    const { rerender } = renderHook(() => useSchedule(args));
    rerender();
    rerender();

    expect(mocks.fire).toHaveBeenCalledTimes(1);
    expect(mocks.fire).toHaveBeenCalledWith("availabilityLoaded", { eventId: 3, eventSlug: "intro" });

    mocks.trpcResult = { ...mocks.trpcResult, dataUpdatedAt: 2 };
    rerender();

    expect(mocks.fire).toHaveBeenCalledTimes(2);
  });

  it("keeps syncing the embed booker state on every render", () => {
    const { rerender } = renderHook(() => useSchedule(args));
    rerender();

    expect(mocks.updateEmbedBookerState).toHaveBeenCalledTimes(2);
  });

  it("does not fire before the slots are loaded", () => {
    mocks.trpcResult = { isSuccess: false, dataUpdatedAt: 0, failureReason: null };
    renderHook(() => useSchedule(args));

    expect(mocks.fire).not.toHaveBeenCalled();
  });

  it("does not fire without an event slug", () => {
    renderHook(() => useSchedule({ ...args, eventSlug: null }));

    expect(mocks.fire).not.toHaveBeenCalled();
  });

  it("fires for the API v2 slots of team events", () => {
    mocks.trpcResult = { isSuccess: false, dataUpdatedAt: 0, failureReason: null };
    mocks.v2Result = { isSuccess: true, dataUpdatedAt: 5, failureReason: null };
    const { rerender } = renderHook(() => useSchedule({ ...args, isTeamEvent: true, useApiV2: true }));
    rerender();

    expect(mocks.fire).toHaveBeenCalledTimes(1);
    expect(mocks.updateEmbedBookerState).toHaveBeenLastCalledWith(
      expect.objectContaining({ slotsQuery: expect.objectContaining({ dataUpdatedAt: 5 }) })
    );
  });
});
