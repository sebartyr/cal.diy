import { ColumnFilterType, type FilterableColumn } from "@calcom/features/data-table/lib/types";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DataTableRemoteFilterOptionsProvider } from "../../contexts/DataTableRemoteFilterOptionsContext";
import { DataTableProvider } from "../../DataTableProvider";
import { useDataTable } from "../../hooks/useDataTable";
import { MultiSelectFilterOptions } from "./MultiSelectFilterOptions";

vi.mock("@calcom/lib/hooks/useLocale", () => ({
  useLocale: () => ({ t: (key: string) => key, i18n: { language: "en" } }),
}));

// Debounce is not what these tests are about.
vi.mock("@calcom/lib/hooks/useDebounce", () => ({ useDebounce: <T,>(value: T) => value }));

const loadMore = vi.fn();
const useRemoteUsers = vi.fn(({ searchTerm }: { searchTerm: string }) => ({
  options: searchTerm
    ? [{ label: `match for ${searchTerm}`, value: 42 }]
    : [
        { label: "Alice", value: 1 },
        { label: "Bob", value: 2 },
      ],
  isLoading: false,
  hasMore: !searchTerm,
  loadMore,
}));

const memberColumn = {
  id: "userId",
  title: "member",
  type: ColumnFilterType.MULTI_SELECT,
  options: [],
} as Extract<FilterableColumn, { type: "ms" }>;

function ActiveFilters() {
  const { activeFilters } = useDataTable();
  return <span data-testid="filters">{JSON.stringify(activeFilters)}</span>;
}

function renderOptions(withLoader: boolean) {
  return render(
    <NuqsTestingAdapter>
      <DataTableProvider tableIdentifier="/bookings/upcoming">
        <DataTableRemoteFilterOptionsProvider value={withLoader ? { userId: useRemoteUsers } : {}}>
          <MultiSelectFilterOptions column={memberColumn} />
          <ActiveFilters />
        </DataTableRemoteFilterOptionsProvider>
      </DataTableProvider>
    </NuqsTestingAdapter>
  );
}

describe("select filter options loaded from the server", () => {
  beforeAll(() => {
    // cmdk scrolls the selected item into view, which jsdom does not implement.
    Element.prototype.scrollIntoView = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("lists the options of the loader and passes it the search term", () => {
    renderOptions(true);

    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getByText("Bob")).toBeTruthy();

    fireEvent.change(screen.getByTestId("select-filter-options-search-userId"), {
      target: { value: "mar" },
    });

    expect(useRemoteUsers).toHaveBeenLastCalledWith({ searchTerm: "mar" });
    expect(screen.getByText("match for mar")).toBeTruthy();
    expect(screen.queryByText("Alice")).toBeNull();
  });

  it("selects an option into the filter and loads the next page on demand", () => {
    renderOptions(true);

    act(() => {
      fireEvent.click(screen.getByText("Bob"));
    });
    expect(JSON.parse(screen.getByTestId("filters").textContent ?? "[]")).toEqual([
      { f: "userId", v: { type: "ms", data: [2] } },
    ]);

    act(() => {
      fireEvent.click(screen.getByText("load_more_results"));
    });
    expect(loadMore).toHaveBeenCalled();
  });

  it("keeps the faceted options when no loader is registered for the column", () => {
    renderOptions(false);

    expect(useRemoteUsers).not.toHaveBeenCalled();
    expect(screen.getByTestId("select-filter-options-userId")).toBeTruthy();
    expect(screen.queryByText("load_more_results")).toBeNull();
  });
});
