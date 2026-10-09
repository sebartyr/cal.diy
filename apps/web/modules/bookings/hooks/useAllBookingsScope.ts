import { parseAsString, parseAsStringLiteral, useQueryState, useQueryStates } from "nuqs";
import { useCallback, useEffect } from "react";
import { useDataTable } from "~/data-table/hooks/useDataTable";
import { BOOKINGS_LIST_STATE_KEYS, isAllBookingsSegment } from "../lib/constants";

const scopeParser = parseAsStringLiteral(["all"] as const);

/**
 * The instance-wide scope of system admins, kept in the URL (`scope=all`) as its own state rather
 * than derived from the selected segment: editing a filter or the page size deselects system
 * segments, which must narrow the instance-wide list, not fall back to the admin's own bookings.
 * Ignored for anyone else (and bookings.get refuses it anyway).
 */
export function useAllBookingsScope({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  const [scope, setScope] = useQueryState("scope", scopeParser);
  const clearAllBookingsScope = useCallback(() => setScope(null), [setScope]);
  return { listsAllBookings: isSystemAdmin && scope === "all", clearAllBookingsScope };
}

/**
 * Picking the "All bookings" segment sets the scope; picking any other segment removes it. A
 * segment being cleared (filter edits, page size) keeps it. Call once per page.
 */
export function useSyncAllBookingsScopeWithSegment({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  const { segmentId } = useDataTable();
  const [, setScope] = useQueryState("scope", scopeParser);
  const selectedSegmentId = segmentId ? String(segmentId.id) : null;

  useEffect(() => {
    if (!isSystemAdmin || !selectedSegmentId) return;
    setScope(isAllBookingsSegment({ id: selectedSegmentId, type: "system" }) ? "all" : null);
  }, [isSystemAdmin, selectedSegmentId, setScope]);
}

const listStateParsers = Object.fromEntries(
  BOOKINGS_LIST_STATE_KEYS.map((key) => [key, parseAsString])
) as Record<(typeof BOOKINGS_LIST_STATE_KEYS)[number], typeof parseAsString>;

/**
 * Whether the bookings URL carries no list state at all: the only case where the default
 * "My bookings" segment may be applied without overriding an explicit search or a shared link.
 */
export function useIsPristineBookingsUrl(): boolean {
  const [state] = useQueryStates(listStateParsers);
  return Object.values(state).every((value) => value === null || value === "");
}
