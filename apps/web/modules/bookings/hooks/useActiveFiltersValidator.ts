import type { ActiveFilter, ActiveFilters } from "@calcom/features/data-table";
import { ColumnFilterType } from "@calcom/features/data-table";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { useCallback, useMemo } from "react";
import type { ActiveFiltersValidator } from "~/data-table/DataTableProvider";
import { useEventTypes } from "./useEventTypes";

interface UseActiveFiltersValidatorOptions {
  canReadOthersBookings: boolean;
  isSystemAdmin?: boolean;
}

export interface AccessibleResources {
  // "all": a system admin may filter on any user or team of the instance.
  userIds: number[] | "all";
  eventTypeIds: number[];
  teamIds: number[] | "all";
}

export function createActiveFiltersValidator(accessibleResources: AccessibleResources) {
  const { userIds, eventTypeIds, teamIds } = accessibleResources;

  return function validateActiveFilters(filters: ActiveFilters): ActiveFilters {
    return filters
      .map((filter): ActiveFilter | null => {
        if (
          userIds !== "all" &&
          filter.f === "userId" &&
          filter.v &&
          filter.v.type === ColumnFilterType.MULTI_SELECT
        ) {
          const validIds = filter.v.data.filter((id) => userIds.includes(id as number));
          if (validIds.length === 0) {
            return null;
          }
          return { ...filter, v: { ...filter.v, data: validIds } };
        }

        if (filter.f === "eventTypeId" && filter.v && filter.v.type === ColumnFilterType.MULTI_SELECT) {
          const validIds = filter.v.data.filter((id) => eventTypeIds.includes(id as number));
          if (validIds.length === 0) {
            return null;
          }
          return { ...filter, v: { ...filter.v, data: validIds } };
        }

        if (
          teamIds !== "all" &&
          filter.f === "teamId" &&
          filter.v &&
          filter.v.type === ColumnFilterType.MULTI_SELECT
        ) {
          const validIds = filter.v.data.filter((id) => teamIds.includes(id as number));
          if (validIds.length === 0) {
            return null;
          }
          return { ...filter, v: { ...filter.v, data: validIds } };
        }

        return filter;
      })
      .filter((f): f is ActiveFilter => f !== null);
  };
}

export type ActiveFiltersValidatorState = ActiveFiltersValidator | "loading" | undefined;

export function useActiveFiltersValidator({
  canReadOthersBookings,
  isSystemAdmin = false,
}: UseActiveFiltersValidatorOptions): ActiveFiltersValidatorState {
  const eventTypes = useEventTypes();
  const teams = undefined as { id: number; name: string }[] | undefined;
  const members = undefined as { id: number; name: string | null }[] | undefined;
  const { data: currentUser } = useMeQuery();

  const accessibleUserIds = useMemo(() => {
    if (!canReadOthersBookings) {
      return currentUser ? [currentUser.id] : [];
    }
    return members?.map((m) => m.id) ?? [];
  }, [canReadOthersBookings, currentUser, members]);

  const accessibleEventTypeIds = useMemo(() => {
    return eventTypes?.map((et) => et.value).filter((v): v is number => typeof v === "number") ?? [];
  }, [eventTypes]);

  const accessibleTeamIds = useMemo(() => {
    return teams?.map((t) => t.id) ?? [];
  }, [teams]);

  // Teams are never loaded in this fork (`teams` is always undefined), so waiting for them kept the
  // validator "loading" forever: a selected segment, such as "My bookings", was never applied and
  // the list kept showing the unfiltered scope.
  const isDataLoaded = useMemo(() => {
    if (!canReadOthersBookings || isSystemAdmin) {
      return currentUser !== undefined && eventTypes !== undefined;
    }
    return members !== undefined && eventTypes !== undefined;
  }, [canReadOthersBookings, isSystemAdmin, currentUser, members, eventTypes]);

  const validateActiveFilters = useCallback(
    (filters: ActiveFilters): ActiveFilters => {
      return createActiveFiltersValidator({
        userIds: isSystemAdmin ? "all" : accessibleUserIds,
        eventTypeIds: accessibleEventTypeIds,
        teamIds: isSystemAdmin ? "all" : accessibleTeamIds,
      })(filters);
    },
    [accessibleUserIds, accessibleEventTypeIds, accessibleTeamIds, isSystemAdmin]
  );

  if (!isDataLoaded) {
    return "loading";
  }

  return validateActiveFilters;
}
