import { ColumnFilterType } from "@calcom/features/data-table";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { meQueryMock } = vi.hoisted(() => ({ meQueryMock: vi.fn() }));

vi.mock("@calcom/trpc/react", () => ({ trpc: {} }));
vi.mock("@calcom/trpc/react/hooks/useMeQuery", () => ({ default: meQueryMock }));
vi.mock("./useEventTypes", () => ({ useEventTypes: () => [{ label: "30 min", value: 10 }] }));

import { useActiveFiltersValidator } from "./useActiveFiltersValidator";

const myBookingsFilters = [{ f: "userId", v: { type: ColumnFilterType.MULTI_SELECT, data: [7] } }];

describe("useActiveFiltersValidator", () => {
  beforeEach(() => {
    meQueryMock.mockReset();
  });

  it("stays loading until the current user is known", () => {
    meQueryMock.mockReturnValue({ data: undefined });
    const { result } = renderHook(() => useActiveFiltersValidator({ canReadOthersBookings: false }));

    expect(result.current).toBe("loading");
  });

  // Teams are never loaded in this fork: the validator used to wait for them forever, so the
  // "My bookings" segment was never applied.
  it("is ready once the user and event types are loaded, without waiting for teams", () => {
    meQueryMock.mockReturnValue({ data: { id: 7 } });
    const { result } = renderHook(() => useActiveFiltersValidator({ canReadOthersBookings: false }));

    expect(typeof result.current).toBe("function");
    const validate = result.current as (filters: typeof myBookingsFilters) => typeof myBookingsFilters;
    expect(validate(myBookingsFilters)).toEqual(myBookingsFilters);
  });
});
