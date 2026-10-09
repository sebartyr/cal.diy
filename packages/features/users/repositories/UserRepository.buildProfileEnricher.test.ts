import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import { UserRepository } from "@calcom/features/users/repositories/UserRepository";
import type { PrismaClient } from "@calcom/prisma";
import type { UserProfile } from "@calcom/types/UserProfile";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const buildOrgProfile = ({
  userId,
  username,
  isPlatform = false,
}: {
  userId: number;
  username: string;
  isPlatform?: boolean;
}) =>
  ({
    id: userId * 10,
    upId: `${userId * 10}`,
    userId,
    username,
    organizationId: 100,
    organization: { id: 100, isPlatform },
  }) as unknown as UserProfile;

describe("UserRepository.buildProfileEnricher", () => {
  const userRepo = new UserRepository({} as PrismaClient);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches the profiles once with deduplicated user ids", async () => {
    vi.mocked(ProfileRepository.findManyForUsers).mockResolvedValue([]);

    await userRepo.buildProfileEnricher([1, 2, 1, 3, 2]);

    expect(ProfileRepository.findManyForUsers).toHaveBeenCalledTimes(1);
    expect(ProfileRepository.findManyForUsers).toHaveBeenCalledWith([1, 2, 3]);
    expect(ProfileRepository.findManyForUser).not.toHaveBeenCalled();
  });

  it("skips the query when there is no user", async () => {
    const enrich = await userRepo.buildProfileEnricher([]);

    expect(ProfileRepository.findManyForUsers).not.toHaveBeenCalled();
    expect(enrich({ id: 1, username: "alice" }).profile.upId).toBe("usr-1");
  });

  it("matches enrichUserWithItsProfile for org, platform org and personal users", async () => {
    const orgProfile = buildOrgProfile({ userId: 1, username: "alice-org" });
    const platformProfile = buildOrgProfile({ userId: 2, username: "bob-platform", isPlatform: true });
    vi.mocked(ProfileRepository.findManyForUsers).mockResolvedValue([orgProfile, platformProfile]);
    vi.mocked(ProfileRepository.findManyForUser).mockImplementation(async ({ id }) =>
      [orgProfile, platformProfile].filter((profile) => profile.userId === id)
    );

    const users = [
      { id: 1, username: "alice", name: "Alice" },
      { id: 2, username: "bob", name: "Bob" },
      { id: 3, username: "carol", name: "Carol" },
    ];

    const enrich = await userRepo.buildProfileEnricher(users.map((user) => user.id));
    const expected = await Promise.all(users.map((user) => userRepo.enrichUserWithItsProfile({ user })));

    expect(users.map(enrich)).toEqual(expected);
    expect(enrich(users[0])).toEqual({
      id: 1,
      username: "alice-org",
      name: "Alice",
      nonProfileUsername: "alice",
      profile: orgProfile,
    });
    expect(enrich(users[1])).toEqual({
      id: 2,
      username: "bob",
      name: "Bob",
      nonProfileUsername: "bob",
      profile: { id: null, upId: "usr-2", username: "bob", organizationId: null, organization: null },
    });
  });

  it("keeps the shape of each object when the same user appears in different lists", async () => {
    vi.mocked(ProfileRepository.findManyForUsers).mockResolvedValue([]);
    const enrich = await userRepo.buildProfileEnricher([1, 1]);

    const member = enrich({ id: 1, username: "alice", eventTypes: [{ slug: "intro" }] });
    const owner = enrich({ id: 1, username: "alice", email: "alice@example.com" });

    expect(member).toEqual(expect.objectContaining({ eventTypes: [{ slug: "intro" }] }));
    expect(owner).not.toHaveProperty("eventTypes");
    expect(owner.email).toBe("alice@example.com");
  });
});
