import type { BlockableUser, BlockingInfo } from "./check-user-blocking";
import { getBlockedUsersMap, isUserBlocked } from "./check-user-blocking";

/**
 * Host type expected from slots service.
 * Minimal shape needed for filtering.
 */
export interface HostWithEmail {
  user: BlockableUser & {
    id: number;
  };
}

export interface FilterBlockedHostsResult<T extends HostWithEmail> {
  eligibleHosts: T[];
  blockedCount: number;
}

/**
 * Filter out blocked hosts from a list using batched blocking check.
 * Checks both locked users and watchlist-blocked emails.
 * Single DB query for N hosts - eliminates N+1.
 *
 * @param hosts - List of hosts to filter
 * @param organizationId - Optional organization ID for org-specific blocking
 * @returns Object with eligibleHosts and blockedCount
 */
export async function filterBlockedHosts<T extends HostWithEmail>(
  hosts: T[],
  organizationId?: number | null
): Promise<FilterBlockedHostsResult<T>> {
  if (hosts.length === 0) {
    return { eligibleHosts: [], blockedCount: 0 };
  }

  // Map hosts to blockable users for the core utility
  const usersToCheck = hosts.map((h) => h.user);

  // Get blocking map (handles locked users and watchlist in one call)
  const { blockingMap, blockedCount } = await getBlockedUsersMap(usersToCheck, organizationId);

  // Filter out blocked hosts
  const eligibleHosts = hosts.filter((host) => !isUserBlocked(host.user.email, blockingMap));

  return {
    eligibleHosts,
    blockedCount,
  };
}

/**
 * Builds a single blocking map for several host lists that may overlap, so they can all be filtered
 * with `isUserBlocked` after one watchlist lookup instead of one lookup per list.
 */
export async function getBlockingMapForHostGroups(
  hostGroups: HostWithEmail[][],
  organizationId?: number | null
): Promise<Map<string, BlockingInfo>> {
  const usersById = new Map<number, HostWithEmail["user"]>();
  for (const hosts of hostGroups) {
    for (const host of hosts) {
      usersById.set(host.user.id, host.user);
    }
  }

  if (usersById.size === 0) {
    return new Map();
  }

  const { blockingMap } = await getBlockedUsersMap(Array.from(usersById.values()), organizationId);
  return blockingMap;
}
