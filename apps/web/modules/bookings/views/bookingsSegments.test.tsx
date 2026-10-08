import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataTableSegment } from "~/data-table/components/segment";
import { DataTableProvider } from "~/data-table/DataTableProvider";
import { useDataTable } from "~/data-table/hooks/useDataTable";
import { isAllBookingsSegment } from "../lib/constants";
import { useBookingSegments, useSystemSegments } from "./bookings-view";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null }) }));
vi.mock("@calcom/trpc/react", () => ({ trpc: {} }));
vi.mock("./../hooks/useFacetedUniqueValues", () => ({
  useAdminUserFilterOptions: vi.fn(),
  useAdminTeamFilterOptions: vi.fn(),
}));

const ME = 7;

function Probe() {
  const { segmentId, activeFilters } = useDataTable();
  return (
    <>
      <span data-testid="segment">{segmentId ? String(segmentId.id) : "none"}</span>
      <span data-testid="filters">{JSON.stringify(activeFilters)}</span>
      <span data-testid="all">{String(isAllBookingsSegment(segmentId))}</span>
    </>
  );
}

function FilterBar({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  const systemSegments = useSystemSegments(ME, isSystemAdmin);
  return (
    <DataTableProvider
      tableIdentifier="/bookings/upcoming"
      useSegments={useBookingSegments}
      systemSegments={systemSegments}
      validateActiveFilters={(filters) => filters}>
      <DataTableSegment.Select />
      <Probe />
    </DataTableProvider>
  );
}

function renderFilterBar({
  isSystemAdmin,
  searchParams = "",
}: {
  isSystemAdmin: boolean;
  searchParams?: string;
}) {
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <FilterBar isSystemAdmin={isSystemAdmin} />
    </NuqsTestingAdapter>
  );
}

function openSegmentMenu() {
  const trigger = screen.getByTestId("filter-segment-select");
  act(() => {
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
  });
}

describe("bookings segments", () => {
  afterEach(() => {
    cleanup();
  });

  it("selects and applies My bookings on first display, with an empty URL", () => {
    renderFilterBar({ isSystemAdmin: false });

    expect(screen.getByTestId("segment").textContent).toBe("system_my_bookings");
    expect(JSON.parse(screen.getByTestId("filters").textContent ?? "[]")).toEqual([
      { f: "userId", v: { type: "ms", data: [ME] } },
    ]);
    expect(screen.getByTestId("filter-segment-select").textContent).toContain("my_bookings");
  });

  it("offers a single segment selector without All bookings to a non-admin", () => {
    renderFilterBar({ isSystemAdmin: false });
    openSegmentMenu();

    expect(screen.getAllByTestId("filter-segment-select")).toHaveLength(1);
    expect(screen.getByTestId("filter-segment-select-content").textContent).toContain("my_bookings");
    expect(screen.queryByText("all_bookings_filter_label")).toBeNull();
  });

  it("adds All bookings for a system admin", () => {
    renderFilterBar({ isSystemAdmin: true });
    openSegmentMenu();

    expect(screen.getAllByTestId("filter-segment-select")).toHaveLength(1);
    expect(screen.getByText("all_bookings_filter_label")).toBeTruthy();
  });

  it("keeps the segment of the URL, and maps All bookings to the all scope without filters", () => {
    renderFilterBar({ isSystemAdmin: true, searchParams: "?segment=system_all_bookings" });

    expect(screen.getByTestId("segment").textContent).toBe("system_all_bookings");
    expect(screen.getByTestId("all").textContent).toBe("true");
    expect(screen.getByTestId("filters").textContent).toBe("[]");
  });
});
