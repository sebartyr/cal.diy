import { activeFiltersParser, segmentIdParser } from "@calcom/features/data-table/lib/parsers";
import { ColumnFilterType } from "@calcom/features/data-table/lib/types";
import { describe, expect, it } from "vitest";
import { BOOKINGS_LIST_STATE_KEYS } from "./constants";
import { getDefaultBookingsListUrl } from "./defaultBookingsListUrl";

const ME = 7;
const pathname = "/bookings/upcoming";

function parse(url: string) {
  const parsed = new URL(url, "https://cal.example");
  return {
    pathname: parsed.pathname,
    params: parsed.searchParams,
    segment: segmentIdParser.parseServerSide(parsed.searchParams.get("segment") ?? undefined),
    activeFilters: activeFiltersParser.parseServerSide(parsed.searchParams.get("activeFilters") ?? undefined),
  };
}

describe("getDefaultBookingsListUrl", () => {
  it("adds the My bookings segment and its filters to a URL without list state", () => {
    const url = getDefaultBookingsListUrl({ pathname, userId: ME, searchParams: {} });

    expect(url).not.toBeNull();
    const { pathname: redirectedPath, segment, activeFilters } = parse(url ?? "");
    expect(redirectedPath).toBe(pathname);
    expect(segment).toBe("system_my_bookings");
    // Parsed back with the data-table's own client parser, so the client reads exactly these filters.
    expect(activeFilters).toEqual([{ f: "userId", v: { type: ColumnFilterType.MULTI_SELECT, data: [ME] } }]);
  });

  it("keeps the other query parameters", () => {
    const url = getDefaultBookingsListUrl({
      pathname,
      userId: ME,
      searchParams: { view: "calendar", uid: "booking-uid", tags: ["a", "b"] },
    });

    const { params } = parse(url ?? "");
    expect(params.get("view")).toBe("calendar");
    expect(params.get("uid")).toBe("booking-uid");
    expect(params.getAll("tags")).toEqual(["a", "b"]);
  });

  it.each(BOOKINGS_LIST_STATE_KEYS)("leaves a URL with %s untouched", (key) => {
    expect(getDefaultBookingsListUrl({ pathname, userId: ME, searchParams: { [key]: "1" } })).toBeNull();
  });

  it("leaves a shared link with explicit filters untouched", () => {
    const activeFilters = activeFiltersParser.serialize([
      { f: "userId", v: { type: ColumnFilterType.MULTI_SELECT, data: [42] } },
    ]);
    expect(getDefaultBookingsListUrl({ pathname, userId: ME, searchParams: { activeFilters } })).toBeNull();
  });

  it("treats empty list state values as absent, like the client", () => {
    const url = getDefaultBookingsListUrl({
      pathname,
      userId: ME,
      searchParams: { segment: "", q: "", page: [""] },
    });

    expect(parse(url ?? "").segment).toBe("system_my_bookings");
  });
});
