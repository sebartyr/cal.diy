import type { Logger } from "tslog";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadUsers, findFirstOrganizationIdForUser, filterBlockedUsers } = vi.hoisted(() => ({
  loadUsers: vi.fn(),
  findFirstOrganizationIdForUser: vi.fn(),
  filterBlockedUsers: vi.fn(),
}));

vi.mock("../loadUsers", () => ({ loadUsers }));
vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: { findFirstOrganizationIdForUser },
}));
vi.mock("@calcom/features/watchlist/operations/filter-blocked-users.controller", () => ({
  filterBlockedUsers,
}));
vi.mock("@calcom/features/watchlist/lib/telemetry", () => ({ sentrySpan: {} }));
vi.mock("@calcom/features/di/containers/QualifiedHosts", () => ({ getQualifiedHostsService: vi.fn() }));
vi.mock("@calcom/app-store/delegationCredential", () => ({ enrichUsersWithDelegationCredentials: vi.fn() }));
vi.mock("@calcom/features/users/repositories/UserRepository", () => ({
  withSelectedCalendars: (user: unknown) => user,
}));
vi.mock("@calcom/lib/getOrgIdFromMemberOrTeamId", () => ({ default: vi.fn() }));
vi.mock("@calcom/lib/sentryWrapper", () => ({
  withReporting: <T extends unknown[], R>(fn: (...args: T) => R) => fn,
}));
vi.mock("@calcom/prisma", () => ({ default: {}, userSelect: {} }));

import { loadAndValidateUsers } from "../loadAndValidateUsers";

type Input = Parameters<typeof loadAndValidateUsers>[0];

const logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn() } as unknown as Logger<unknown>;

const buildInput = (eventType: Record<string, unknown>): Input => ({
  eventType: {
    id: 1,
    userId: 10,
    team: null,
    parent: null,
    hosts: [],
    users: [],
    schedulingType: null,
    owner: null,
    ...eventType,
  } as unknown as Input["eventType"],
  eventTypeId: 1,
  dynamicUserList: [],
  logger,
  routedTeamMemberIds: null,
  contactOwnerEmail: null,
  rescheduleUid: null,
  isPlatform: false,
  hostname: undefined,
  forcedSlug: undefined,
});

// Every user is reported as blocked so the function stops right after resolving the organization
const runUntilBlockedUsersFilter = async (input: Input) => {
  await expect(loadAndValidateUsers(input)).rejects.toThrow("eventTypeUser.notFound");
  return filterBlockedUsers.mock.calls[0][1];
};

describe("loadAndValidateUsers organization resolution for blocked users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadUsers.mockResolvedValue([{ id: 10, allowDynamicBooking: true }]);
    filterBlockedUsers.mockResolvedValue({ eligibleUsers: [], blockedCount: 1 });
    findFirstOrganizationIdForUser.mockResolvedValue(99);
  });

  it("reuses the owner's loaded profile instead of querying it again", async () => {
    const organizationId = await runUntilBlockedUsersFilter(
      buildInput({ owner: { id: 10, hideBranding: false, profiles: [{ organizationId: 5 }] } })
    );

    expect(organizationId).toBe(5);
    expect(findFirstOrganizationIdForUser).not.toHaveBeenCalled();
  });

  it("resolves to null without a query when the owner has no profile", async () => {
    const organizationId = await runUntilBlockedUsersFilter(
      buildInput({ owner: { id: 10, hideBranding: false, profiles: [] } })
    );

    expect(organizationId).toBeNull();
    expect(findFirstOrganizationIdForUser).not.toHaveBeenCalled();
  });

  it("queries the profile when the owner relation is not loaded", async () => {
    const organizationId = await runUntilBlockedUsersFilter(buildInput({ owner: null }));

    expect(organizationId).toBe(99);
    expect(findFirstOrganizationIdForUser).toHaveBeenCalledWith({ userId: 10 });
  });

  it("uses the team's organization without looking at profiles", async () => {
    const organizationId = await runUntilBlockedUsersFilter(
      buildInput({
        team: { parentId: 3 },
        owner: { id: 10, hideBranding: false, profiles: [{ organizationId: 5 }] },
      })
    );

    expect(organizationId).toBe(3);
    expect(findFirstOrganizationIdForUser).not.toHaveBeenCalled();
  });
});
