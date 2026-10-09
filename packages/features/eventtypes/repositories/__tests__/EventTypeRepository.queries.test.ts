import { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import { ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventTypeRepository } from "../eventTypeRepository";

type ProfileWithMovedFromUser = Awaited<ReturnType<typeof ProfileRepository.findById>>;

const mockPrisma = {
  eventType: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
};

const childrenOfUser = { userId: 7, parentId: { not: null } };

describe("EventTypeRepository queries", () => {
  let repository: EventTypeRepository;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    mockPrisma.eventType.findMany.mockResolvedValue([]);
    repository = new EventTypeRepository(mockPrisma as unknown as PrismaClient);
  });

  describe.each(["findAllByUpId", "findAllByUpIdWithMinimalData"] as const)("%s", (method) => {
    it("returns an empty list without querying when upId is empty", async () => {
      const result = await repository[method]({ upId: "", userId: 7 });

      expect(result).toEqual([]);
      expect(mockPrisma.eventType.findMany).not.toHaveBeenCalled();
    });

    it("looks up by userId for a user upId and applies pagination", async () => {
      const findByIdSpy = vi.spyOn(ProfileRepository, "findById");

      await repository[method](
        { upId: "usr-3", userId: 7 },
        { where: { hidden: false }, cursor: 12, limit: 10, orderBy: [{ position: "desc" }] }
      );

      expect(findByIdSpy).not.toHaveBeenCalled();
      expect(mockPrisma.eventType.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.eventType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 3, hidden: false },
          cursor: { id: 12 },
          take: 11,
          orderBy: [{ position: "desc" }],
        })
      );
    });

    it("includes legacy events of a user moved to the profile", async () => {
      vi.spyOn(ProfileRepository, "findById").mockResolvedValue({
        id: 5,
        movedFromUser: { id: 9 },
      } as unknown as ProfileWithMovedFromUser);

      await repository[method]({ upId: "5", userId: 7 }, { where: { hidden: false } });

      expect(mockPrisma.eventType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ userId: 9, profileId: null }, { profileId: 5 }, childrenOfUser],
            hidden: false,
          },
          cursor: undefined,
          take: undefined,
        })
      );
    });

    it("looks up by profileId and children of the user otherwise", async () => {
      vi.spyOn(ProfileRepository, "findByUid").mockResolvedValue({ id: 5 } as Awaited<
        ReturnType<typeof ProfileRepository.findByUid>
      >);
      vi.spyOn(ProfileRepository, "findById").mockResolvedValue({
        id: 5,
        movedFromUser: null,
      } as unknown as ProfileWithMovedFromUser);

      await repository[method]({ upId: "prof-abc", userId: 7 });

      expect(ProfileRepository.findByUid).toHaveBeenCalledWith("abc");
      expect(mockPrisma.eventType.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { OR: [{ profileId: 5 }, childrenOfUser] },
        })
      );
    });
  });

  it("keeps relations out of the minimal data select", async () => {
    await repository.findAllByUpIdWithMinimalData({ upId: "usr-3", userId: 7 });
    const minimalSelect = mockPrisma.eventType.findMany.mock.calls[0][0].select;

    await repository.findAllByUpId({ upId: "usr-3", userId: 7 });
    const fullSelect = mockPrisma.eventType.findMany.mock.calls[1][0].select;

    expect(minimalSelect).not.toHaveProperty("users");
    expect(minimalSelect).not.toHaveProperty("hosts");
    expect(minimalSelect.hashedLink).toBeDefined();
    expect(fullSelect).toHaveProperty("users");
    expect(fullSelect).toHaveProperty("hosts");
    expect(fullSelect).toHaveProperty("children");
  });

  it("uses the same select for findById and findByIdForOrgAdmin", async () => {
    vi.spyOn(MembershipRepository, "findUserTeamIds").mockResolvedValue([4]);

    await repository.findById({ id: 1, userId: 7 });
    await repository.findByIdForOrgAdmin({ id: 1, organizationId: 2 });

    const [findByIdArgs] = mockPrisma.eventType.findFirst.mock.calls[0];
    const [findByIdForOrgAdminArgs] = mockPrisma.eventType.findFirst.mock.calls[1];
    expect(findByIdArgs.select).toBe(findByIdForOrgAdminArgs.select);
    expect(findByIdArgs.select.team.select.members.select.user.select).toMatchObject({
      email: true,
      defaultScheduleId: true,
      eventTypes: { select: { slug: true } },
    });
    expect(findByIdArgs.where.AND[0].OR[1]).toEqual({
      AND: [{ teamId: { not: null } }, { teamId: { in: [4] } }],
    });
    expect(findByIdForOrgAdminArgs.where.AND[0]).toEqual({ id: 1 });
  });
});
