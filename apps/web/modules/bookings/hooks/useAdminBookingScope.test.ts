import { describe, expect, it } from "vitest";
import { getAdminScopeQueryFilters } from "./useAdminBookingScope";

describe("getAdminScopeQueryFilters", () => {
  const admin = { isSystemAdmin: true, userId: null, teamId: null };

  it("keeps the regular listing by default", () => {
    expect(getAdminScopeQueryFilters({ ...admin, scope: "mine" })).toBeUndefined();
  });

  it("maps each admin scope to the bookings.get filters", () => {
    expect(getAdminScopeQueryFilters({ ...admin, scope: "all" })).toEqual({ scope: "all" });
    expect(getAdminScopeQueryFilters({ ...admin, scope: "user", userId: 4 })).toEqual({ userIds: [4] });
    expect(getAdminScopeQueryFilters({ ...admin, scope: "team", teamId: 7 })).toEqual({ teamIds: [7] });
  });

  it("waits for a selection before narrowing to a user or a team", () => {
    expect(getAdminScopeQueryFilters({ ...admin, scope: "user" })).toBeUndefined();
    expect(getAdminScopeQueryFilters({ ...admin, scope: "team" })).toBeUndefined();
  });

  it("ignores admin scopes found in the URL of a non-admin", () => {
    for (const scope of ["all", "user", "team"] as const) {
      expect(
        getAdminScopeQueryFilters({ isSystemAdmin: false, scope, userId: 4, teamId: 7 })
      ).toBeUndefined();
    }
  });
});
