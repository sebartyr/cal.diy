import { ColumnFilterType } from "@calcom/features/data-table";
import { activeFiltersParser } from "@calcom/features/data-table/lib/parsers";
import { act, cleanup, render, screen } from "@testing-library/react";
import { createSerializer } from "nuqs";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type DataTableContextType, DataTableProvider } from "~/data-table/DataTableProvider";
import { useDataTable } from "~/data-table/hooks/useDataTable";
import { useBookingSegments, useSystemSegments } from "../views/bookings-view";
import { useAllBookingsScope, useSyncAllBookingsScopeWithSegment } from "./useAllBookingsScope";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));
vi.mock("@calcom/trpc/react", () => ({ trpc: {} }));
vi.mock("./useFacetedUniqueValues", () => ({
  useAdminUserFilterOptions: vi.fn(),
  useAdminTeamFilterOptions: vi.fn(),
}));

const ME = 7;
const serializeFilters = createSerializer({ activeFilters: activeFiltersParser });
let table: DataTableContextType;

function Probe({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  table = useDataTable();
  useSyncAllBookingsScopeWithSegment({ isSystemAdmin });
  const { listsAllBookings } = useAllBookingsScope({ isSystemAdmin });
  return (
    <>
      <span data-testid="segment">{table.segmentId ? String(table.segmentId.id) : "none"}</span>
      <span data-testid="filters">{JSON.stringify(table.activeFilters)}</span>
      <span data-testid="page">{`${table.pageIndex}/${table.pageSize}`}</span>
      <span data-testid="all">{String(listsAllBookings)}</span>
    </>
  );
}

function Page({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  const systemSegments = useSystemSegments(ME, isSystemAdmin);
  return (
    <DataTableProvider
      tableIdentifier="/bookings/upcoming"
      useSegments={useBookingSegments}
      systemSegments={systemSegments}
      validateActiveFilters={(filters) => filters}>
      <Probe isSystemAdmin={isSystemAdmin} />
    </DataTableProvider>
  );
}

function renderPage({ isSystemAdmin, searchParams = "" }: { isSystemAdmin: boolean; searchParams?: string }) {
  return render(
    <NuqsTestingAdapter searchParams={searchParams}>
      <Page isSystemAdmin={isSystemAdmin} />
    </NuqsTestingAdapter>
  );
}

const text = (testId: string) => screen.getByTestId(testId).textContent;

function selectAllBookings() {
  act(() => {
    table.setSegmentId({ id: "system_all_bookings", type: "system" });
  });
  expect(text("segment")).toBe("system_all_bookings");
  expect(text("all")).toBe("true");
}

describe("all bookings scope of system admins", () => {
  afterEach(() => {
    cleanup();
  });

  it("(a) survives a filter edit that deselects the All bookings segment", () => {
    renderPage({ isSystemAdmin: true });
    selectAllBookings();

    act(() => {
      table.updateFilter("attendeeEmail", {
        type: ColumnFilterType.TEXT,
        data: { operator: "contains", operand: "@example.com" },
      });
    });

    expect(text("segment")).toBe("none");
    expect(text("all")).toBe("true");
  });

  it("(b) survives a page size change", () => {
    renderPage({ isSystemAdmin: true });
    selectAllBookings();

    act(() => {
      table.setPageSize(25);
    });

    expect(text("segment")).toBe("none");
    expect(text("page")).toBe("0/25");
    expect(text("all")).toBe("true");
  });

  it("is removed by picking another segment", () => {
    renderPage({ isSystemAdmin: true });
    selectAllBookings();

    act(() => {
      table.setSegmentId({ id: "system_my_bookings", type: "system" });
    });

    expect(text("all")).toBe("false");
  });

  it("(c) keeps the filters, page and size of a URL without segment", () => {
    const filters = [{ f: "userId", v: { type: ColumnFilterType.MULTI_SELECT, data: [42] } }];
    renderPage({
      isSystemAdmin: true,
      searchParams: `${serializeFilters({ activeFilters: filters })}&page=2&size=25`,
    });

    expect(text("segment")).toBe("none");
    expect(JSON.parse(text("filters") ?? "[]")).toEqual(filters);
    expect(text("page")).toBe("2/25");
  });

  it("(d) applies My bookings to a blank URL", () => {
    renderPage({ isSystemAdmin: true });

    expect(text("segment")).toBe("system_my_bookings");
    expect(JSON.parse(text("filters") ?? "[]")).toEqual([
      { f: "userId", v: { type: ColumnFilterType.MULTI_SELECT, data: [ME] } },
    ]);
    expect(text("all")).toBe("false");
  });

  it("keeps scope=all from the URL for an admin, without applying My bookings", () => {
    renderPage({ isSystemAdmin: true, searchParams: "?scope=all" });

    expect(text("segment")).toBe("none");
    expect(text("all")).toBe("true");
  });

  it("(e) ignores scope=all in the URL of a non-admin", () => {
    renderPage({ isSystemAdmin: false, searchParams: "?scope=all" });

    expect(text("all")).toBe("false");
  });
});
