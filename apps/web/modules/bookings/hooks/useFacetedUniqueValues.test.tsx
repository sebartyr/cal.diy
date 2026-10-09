import type { Table } from "@tanstack/react-table";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useFacetedUniqueValues } from "./useFacetedUniqueValues";

const eventTypesData = [
  { id: 1, title: "Intro", team: null },
  { id: 2, title: "Team sync", team: { id: 10, name: "Sales" } },
];

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: 7 } } }) }));
vi.mock("@calcom/lib/hooks/useLocale", () => {
  const t = (key: string) => key;
  return { useLocale: () => ({ t, i18n: { language: "en" } }) };
});
vi.mock("@calcom/trpc/react/hooks/useMeQuery", () => ({
  default: () => ({ data: currentUser }),
}));
vi.mock("./useBookingFilters", () => ({ useBookingFilters: () => ({}) }));
vi.mock("@calcom/trpc/react", () => ({
  trpc: {
    viewer: {
      // A new result object on every render, as react-query's tracked results are.
      eventTypes: { listWithTeam: { useQuery: () => ({ data: eventTypesData }) } },
      admin: {
        listPaginated: { useQuery: () => ({ data: undefined }) },
        listTeams: { useQuery: () => ({ data: undefined }) },
      },
    },
  },
}));

const currentUser = { id: 7, name: "Ada", email: "ada@example.com" };
const table = {} as Table<unknown>;

const valuesOf = (map: Map<unknown, number>) => Array.from(map.keys());

describe("useFacetedUniqueValues", () => {
  it("keeps the same getter across re-renders when the event types did not change", () => {
    const { result, rerender } = renderHook(() => useFacetedUniqueValues({ canReadOthersBookings: true }));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it("groups the event types by section", () => {
    const { result } = renderHook(() => useFacetedUniqueValues({ canReadOthersBookings: true }));

    expect(valuesOf(result.current(table, "eventTypeId")())).toEqual([
      { section: "individual", label: "Intro", value: 1 },
      { section: "Sales Events", label: "Team sync", value: 2 },
    ]);
  });

  it("offers no team options outside the admin view", () => {
    const { result } = renderHook(() => useFacetedUniqueValues({ canReadOthersBookings: true }));

    expect(result.current(table, "teamId")().size).toBe(0);
  });

  it("offers no member options to a user who can read others' bookings outside the admin view", () => {
    const { result } = renderHook(() => useFacetedUniqueValues({ canReadOthersBookings: true }));

    expect(result.current(table, "userId")().size).toBe(0);
  });

  it("offers only the current user to a user who cannot read others' bookings", () => {
    const { result } = renderHook(() => useFacetedUniqueValues({ canReadOthersBookings: false }));

    expect(valuesOf(result.current(table, "userId")())).toEqual([{ label: "Ada", value: 7 }]);
  });
});
