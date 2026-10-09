import { ZActiveFilter } from "@calcom/features/data-table/lib/types";
import { createSerializer, parseAsArrayOf, parseAsJson, parseAsString } from "nuqs/server";
import { BOOKINGS_LIST_STATE_KEYS, getMyBookingsActiveFilters, MY_BOOKINGS_SEGMENT } from "./constants";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

// Same URL encoding as the data-table's client parsers (segmentIdParser, activeFiltersParser), which
// come from the client-only "nuqs" entry point and cannot run on the server.
const serializeListState = createSerializer({
  segment: parseAsString,
  activeFilters: parseAsArrayOf(parseAsJson(ZActiveFilter.parse)),
});

function hasValue(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.some((item) => item !== "");
  return value !== undefined && value !== "";
}

/**
 * The URL to redirect a bookings list request to so that it carries the "My bookings" segment and its
 * filters, or null when the URL already holds list state (an explicit search or a shared link).
 *
 * Applying the default segment on the client is not enough: the data-table writes it to the URL from a
 * mount effect through nuqs' throttled queue, and the Next.js app router replaces the history entry
 * with its canonical URL on router state changes, which also makes nuqs drop its pending updates. The
 * segment then stays selected while its filters are lost and every booking in scope is listed.
 */
export function getDefaultBookingsListUrl({
  pathname,
  userId,
  searchParams,
}: {
  pathname: string;
  userId: number;
  searchParams: SearchParamsRecord;
}): string | null {
  if (BOOKINGS_LIST_STATE_KEYS.some((key) => hasValue(searchParams[key]))) return null;

  const base = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) base.append(key, item);
  }

  return `${pathname}${serializeListState(base, {
    segment: String(MY_BOOKINGS_SEGMENT.id),
    activeFilters: getMyBookingsActiveFilters(userId),
  })}`;
}
