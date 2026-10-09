import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import type { UserProfile } from "@calcom/types/UserProfile";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapEventTypes } from "../util";

vi.mock("@calcom/features/membership/di/TeamRolePermissionService.container", () => ({
  getTeamRolePermissionService: vi.fn(),
}));

vi.mock("@calcom/features/profile/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    findManyForUsers: vi.fn(),
    findManyForUser: vi.fn(),
    buildPersonalProfileFromUser: ({ user }: { user: { id: number; username: string | null } }) => ({
      id: null,
      upId: `usr-${user.id}`,
      username: user.username,
      organizationId: null,
      organization: null,
    }),
  },
}));

type EventTypeInput = Parameters<typeof mapEventTypes>[0][number];

const user = (id: number) => ({
  id,
  name: `User ${id}`,
  username: `user${id}`,
  avatarUrl: null,
  timeZone: "UTC",
});

const buildEventType = (overrides: Record<string, unknown>) =>
  ({
    id: 1,
    description: null,
    metadata: null,
    hosts: [],
    users: [],
    children: [],
    ...overrides,
  }) as unknown as EventTypeInput;

describe("mapEventTypes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("enriches every host, user and child user with a single profile query", async () => {
    const orgProfile = {
      id: 20,
      upId: "20",
      userId: 2,
      username: "user2-org",
      organizationId: 100,
      organization: { id: 100, isPlatform: false },
    } as unknown as UserProfile;
    vi.mocked(ProfileRepository.findManyForUsers).mockResolvedValue([orgProfile]);

    const eventTypes = [
      buildEventType({
        id: 1,
        description: "**Hello**",
        hosts: [{ user: user(1) }, { user: user(2) }],
        users: [user(9)],
      }),
      buildEventType({
        id: 2,
        users: [user(2), user(3)],
        children: [
          { id: 21, users: [user(3)] },
          { id: 22, users: [user(4)] },
        ],
      }),
    ];

    const result = await mapEventTypes(eventTypes);

    expect(ProfileRepository.findManyForUsers).toHaveBeenCalledTimes(1);
    expect(ProfileRepository.findManyForUsers).toHaveBeenCalledWith([1, 2, 3, 4]);
    expect(ProfileRepository.findManyForUser).not.toHaveBeenCalled();

    expect(result.map((eventType) => eventType.id)).toEqual([1, 2]);
    expect(result[0].safeDescription).toContain("<strong>Hello</strong>");
    expect(result[1].safeDescription).toBeUndefined();
    expect(result[0].metadata).toBeNull();

    expect(result[0].users.map((u) => u.id)).toEqual([1, 2]);
    expect(result[0].users[1]).toEqual({
      ...user(2),
      username: "user2-org",
      nonProfileUsername: "user2",
      profile: orgProfile,
    });
    expect(result[1].users.map((u) => [u.id, u.username])).toEqual([
      [2, "user2-org"],
      [3, "user3"],
    ]);
    expect(result[1].children).toEqual([
      {
        id: 21,
        users: [
          {
            ...user(3),
            nonProfileUsername: "user3",
            profile: { id: null, upId: "usr-3", username: "user3", organizationId: null, organization: null },
          },
        ],
      },
      {
        id: 22,
        users: [
          {
            ...user(4),
            nonProfileUsername: "user4",
            profile: { id: null, upId: "usr-4", username: "user4", organizationId: null, organization: null },
          },
        ],
      },
    ]);
  });

  it("returns an empty list without querying profiles", async () => {
    await expect(mapEventTypes([])).resolves.toEqual([]);
    expect(ProfileRepository.findManyForUsers).not.toHaveBeenCalled();
  });
});
