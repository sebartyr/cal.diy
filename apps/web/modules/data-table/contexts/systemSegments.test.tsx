import { ColumnFilterType, type SystemFilterSegment } from "@calcom/features/data-table/lib/types";
import { act, cleanup, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it } from "vitest";
import type { ActiveFiltersValidatorState } from "../DataTableProvider";
import { DataTableProvider } from "../DataTableProvider";
import { useDataTable } from "../hooks/useDataTable";
import { useSegments } from "../hooks/useSegments";

const ME = 7;

const systemSegments: SystemFilterSegment[] = [
  {
    id: "my_bookings",
    name: "My bookings",
    type: "system",
    activeFilters: [{ f: "userId", v: { type: ColumnFilterType.MULTI_SELECT, data: [ME] } }],
    perPage: 10,
  },
];

let selectMyBookings: () => void = () => undefined;

function Probe() {
  const { activeFilters, selectedSegment, setSegmentId, isValidatorPending } = useDataTable();
  selectMyBookings = () => setSegmentId({ id: "system_my_bookings", type: "system" });
  return (
    <div>
      <span data-testid="segment">{selectedSegment?.id ?? "none"}</span>
      <span data-testid="filters">{JSON.stringify(activeFilters)}</span>
      <span data-testid="pending">{String(isValidatorPending)}</span>
    </div>
  );
}

function renderTable({
  searchParams = "",
  validateActiveFilters = (filters) => filters,
}: {
  searchParams?: string;
  validateActiveFilters?: ActiveFiltersValidatorState;
}) {
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <DataTableProvider
        tableIdentifier="/bookings/upcoming"
        useSegments={useSegments}
        systemSegments={systemSegments}
        validateActiveFilters={validateActiveFilters}>
        <Probe />
      </DataTableProvider>
    </NuqsTestingAdapter>
  );
}

const myBookingsFilter = JSON.stringify(systemSegments[0].activeFilters);

describe("system segments", () => {
  afterEach(() => {
    cleanup();
  });

  it("applies the segment filters when it is picked", () => {
    renderTable({});
    act(() => selectMyBookings());

    expect(screen.getByTestId("segment").textContent).toBe("system_my_bookings");
    expect(screen.getByTestId("filters").textContent).toBe(myBookingsFilter);
  });

  it("applies the filters of a segment read from the URL", () => {
    renderTable({ searchParams: "?segment=system_my_bookings" });

    expect(screen.getByTestId("segment").textContent).toBe("system_my_bookings");
    expect(screen.getByTestId("filters").textContent).toBe(myBookingsFilter);
  });

  it("keeps the segment pending, and the list query disabled, while the validator loads", () => {
    renderTable({ validateActiveFilters: "loading" });
    act(() => selectMyBookings());

    expect(screen.getByTestId("filters").textContent).toBe("[]");
    expect(screen.getByTestId("pending").textContent).toBe("true");
  });
});
