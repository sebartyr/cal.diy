import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs";
import { useCallback, useMemo } from "react";

export const ADMIN_BOOKING_SCOPES = ["mine", "all", "user", "team"] as const;
export type AdminBookingScope = (typeof ADMIN_BOOKING_SCOPES)[number];

const adminScopeParsers = {
  adminScope: parseAsStringLiteral(ADMIN_BOOKING_SCOPES).withDefault("mine"),
  adminUserId: parseAsInteger,
  adminTeamId: parseAsInteger,
};

export type AdminScopeQueryFilters = {
  scope?: "all";
  userIds?: number[];
  teamIds?: number[];
};

export function getAdminScopeQueryFilters({
  isSystemAdmin,
  scope,
  userId,
  teamId,
}: {
  isSystemAdmin: boolean;
  scope: AdminBookingScope;
  userId: number | null;
  teamId: number | null;
}): AdminScopeQueryFilters | undefined {
  // Non-admins never send the admin filters, even if the URL carries them.
  if (!isSystemAdmin) return undefined;
  if (scope === "all") return { scope: "all" };
  if (scope === "user" && userId) return { userIds: [userId] };
  if (scope === "team" && teamId) return { teamIds: [teamId] };
  return undefined;
}

/**
 * System admin scope of the bookings list, kept in the URL (adminScope, adminUserId, adminTeamId) so
 * that it survives reloads and can be shared like the other filters.
 */
export function useAdminBookingScope({ isSystemAdmin }: { isSystemAdmin: boolean }) {
  const [{ adminScope, adminUserId, adminTeamId }, setParams] = useQueryStates(adminScopeParsers);

  const setScope = useCallback(
    (scope: AdminBookingScope) =>
      setParams({
        adminScope: scope === "mine" ? null : scope,
        adminUserId: scope === "user" ? adminUserId : null,
        adminTeamId: scope === "team" ? adminTeamId : null,
      }),
    [setParams, adminUserId, adminTeamId]
  );

  const setUserId = useCallback(
    (userId: number | null) => setParams({ adminScope: "user", adminUserId: userId, adminTeamId: null }),
    [setParams]
  );

  const setTeamId = useCallback(
    (teamId: number | null) => setParams({ adminScope: "team", adminTeamId: teamId, adminUserId: null }),
    [setParams]
  );

  const queryFilters = useMemo(
    () =>
      getAdminScopeQueryFilters({
        isSystemAdmin,
        scope: adminScope,
        userId: adminUserId,
        teamId: adminTeamId,
      }),
    [isSystemAdmin, adminScope, adminUserId, adminTeamId]
  );

  return {
    scope: adminScope,
    userId: adminUserId,
    teamId: adminTeamId,
    setScope,
    setUserId,
    setTeamId,
    queryFilters,
  };
}
