export function addMissingTeamMembersAsHosts<THost extends { userId: number }>({
  hosts,
  teamMemberIds,
  buildHost,
}: {
  hosts: THost[];
  teamMemberIds: number[];
  buildHost: (userId: number) => THost;
}): THost[] {
  const hostUserIds = new Set(hosts.map((host) => host.userId));
  const missingHosts = teamMemberIds
    .filter((userId) => !hostUserIds.has(userId))
    .map((userId) => buildHost(userId));

  return [...hosts, ...missingHosts];
}
