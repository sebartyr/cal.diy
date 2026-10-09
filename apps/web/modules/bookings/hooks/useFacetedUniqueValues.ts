import { convertFacetedValuesToMap, type FacetedValue } from "@calcom/features/data-table";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import type { RowData, Table } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";
import type {
  RemoteFilterOptions,
  UseRemoteFilterOptions,
} from "~/data-table/contexts/DataTableRemoteFilterOptionsContext";
import { useBookingFilters } from "./useBookingFilters";
import { useEventTypes } from "./useEventTypes";

interface UseFacetedUniqueValuesOptions {
  canReadOthersBookings: boolean;
  isSystemAdmin?: boolean;
}

const ADMIN_OPTIONS_PAGE_SIZE = 20;
const MAX_SELECTED_LABELS = 100;

const userLabel = (user: { name: string | null; email: string }) =>
  user.name ? `${user.name} (${user.email})` : user.email;

const teamLabel = (team: { name: string; parent: { name: string } | null }) =>
  team.parent ? `${team.name} (${team.parent.name})` : team.name;

/** Every user of the instance, searched on the server, for the member filter of system admins. */
export const useAdminUserFilterOptions: UseRemoteFilterOptions = ({ searchTerm }): RemoteFilterOptions => {
  const query = trpc.viewer.admin.listPaginated.useInfiniteQuery(
    { limit: ADMIN_OPTIONS_PAGE_SIZE, searchTerm: searchTerm || undefined, withTotal: false },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  const options = useMemo(
    () =>
      (query.data?.pages.flatMap((page) => page.rows) ?? []).map((user) => ({
        label: userLabel(user),
        value: user.id,
      })),
    [query.data]
  );
  return {
    options,
    isLoading: query.isFetching,
    hasMore: !!query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
};

/** Every team of the instance, searched on the server, for the team filter of system admins. */
export const useAdminTeamFilterOptions: UseRemoteFilterOptions = ({ searchTerm }): RemoteFilterOptions => {
  const query = trpc.viewer.admin.listTeams.useInfiniteQuery(
    { limit: ADMIN_OPTIONS_PAGE_SIZE, searchTerm: searchTerm || undefined },
    { getNextPageParam: (lastPage) => lastPage.nextCursor }
  );
  const options = useMemo(
    () =>
      (query.data?.pages.flatMap((page) => page.rows) ?? []).map((team) => ({
        label: teamLabel(team),
        value: team.id,
      })),
    [query.data]
  );
  return {
    options,
    isLoading: query.isFetching,
    hasMore: !!query.hasNextPage,
    loadMore: () => void query.fetchNextPage(),
  };
};

/**
 * For system admins, the member and team options come from the server (see the loaders above);
 * the faceted values only need the labels of the selected ids, which the active filter chips show.
 */
function useAdminSelectedOptions(isSystemAdmin: boolean) {
  const { userIds = [], teamIds = [] } = useBookingFilters();
  const selectedUserIds = userIds.slice(0, MAX_SELECTED_LABELS);
  const selectedTeamIds = teamIds.slice(0, MAX_SELECTED_LABELS);

  const { data: users } = trpc.viewer.admin.listPaginated.useQuery(
    { limit: MAX_SELECTED_LABELS, ids: selectedUserIds, withTotal: false },
    { enabled: isSystemAdmin && selectedUserIds.length > 0 }
  );
  const { data: teams } = trpc.viewer.admin.listTeams.useQuery(
    { limit: MAX_SELECTED_LABELS, ids: selectedTeamIds },
    { enabled: isSystemAdmin && selectedTeamIds.length > 0 }
  );

  return useMemo(
    () => ({
      users: (users?.rows ?? []).map((user) => ({ label: userLabel(user), value: user.id })),
      teams: (teams?.rows ?? []).map((team) => ({ label: teamLabel(team), value: team.id })),
    }),
    [users, teams]
  );
}

export function useFacetedUniqueValues({
  canReadOthersBookings,
  isSystemAdmin = false,
}: UseFacetedUniqueValuesOptions): <TData extends RowData>(
  table: Table<TData>,
  columnId: string
) => () => Map<FacetedValue, number> {
  const eventTypes = useEventTypes();
  const teams = undefined as { id: number; name: string }[] | undefined;
  const members = undefined as { id: number; name: string | null }[] | undefined;
  const { data: currentUser } = useMeQuery();
  const adminSelectedOptions = useAdminSelectedOptions(isSystemAdmin);

  return useCallback(
    <TData extends RowData>(_: Table<TData>, columnId: string) =>
      (): Map<FacetedValue, number> => {
        if (columnId === "eventTypeId") {
          return convertFacetedValuesToMap(eventTypes || []);
        } else if (columnId === "teamId") {
          if (isSystemAdmin) {
            return convertFacetedValuesToMap(adminSelectedOptions.teams);
          }
          return convertFacetedValuesToMap(
            (teams || []).map((team) => ({
              label: team.name,
              value: team.id,
            }))
          );
        } else if (columnId === "userId") {
          if (isSystemAdmin) {
            return convertFacetedValuesToMap(adminSelectedOptions.users);
          }
          if (!canReadOthersBookings) {
            if (!currentUser) {
              return new Map<FacetedValue, number>();
            }
            return convertFacetedValuesToMap([
              {
                label: currentUser.name || currentUser.email,
                value: currentUser.id,
              },
            ]);
          }
          return convertFacetedValuesToMap(
            (members || [])
              .map((member) => ({
                label: member.name,
                value: member.id,
              }))
              .filter((option): option is { label: string; value: number } => Boolean(option.label))
          );
        }
        return new Map<FacetedValue, number>();
      },
    [eventTypes, teams, members, canReadOthersBookings, currentUser, isSystemAdmin, adminSelectedOptions]
  );
}
