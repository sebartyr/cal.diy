import { LookupTarget, ProfileRepository } from "@calcom/features/profile/repositories/ProfileRepository";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { eventTypeSelect } from "@calcom/lib/server/eventTypeSelect";
import { prisma } from "@calcom/prisma";
import type { Membership, Prisma, PrismaClient } from "@calcom/prisma/client";
import type { MembershipRole } from "@calcom/prisma/enums";

const log = logger.getSubLogger({ prefix: ["features/membership/repositories/MembershipRepository"] });
type IMembership = {
  teamId: number;
  userId: number;
  accepted: boolean;
  role: MembershipRole;
  createdAt?: Date;
};

const membershipSelect = {
  id: true,
  teamId: true,
  userId: true,
  accepted: true,
  role: true,
} satisfies Prisma.MembershipSelect;

type MembershipSelectableKeys = keyof typeof membershipSelect;

type MembershipPartialSelect = Partial<Record<MembershipSelectableKeys, boolean>>;

type MembershipDTO = Pick<Membership, MembershipSelectableKeys>;

type MembershipDTOFromSelect<TSelect extends MembershipPartialSelect> = {
  [K in keyof TSelect & keyof MembershipDTO as TSelect[K] extends true ? K : never]: MembershipDTO[K];
};

const teamParentSelect = {
  id: true,
  name: true,
  slug: true,
  logoUrl: true,
  parentId: true,
  metadata: true,
} satisfies Prisma.TeamSelect;

const userSelect = {
  name: true,
  avatarUrl: true,
  username: true,
  id: true,
  timeZone: true,
} satisfies Prisma.UserSelect;

const getWhereForfindAllByUpId = async (upId: string, where?: Prisma.MembershipWhereInput) => {
  const lookupTarget = ProfileRepository.getLookupTarget(upId);
  let prismaWhere;
  if (lookupTarget.type === LookupTarget.Profile) {
    /**
     * TODO: When we add profileId to membership, we lookup by profileId
     * If the profile is movedFromUser, we lookup all memberships without profileId as well.
     */
    let profile;
    if ("uid" in lookupTarget && lookupTarget.uid) {
      profile = await ProfileRepository.findByUid(lookupTarget.uid);
    } else if ("id" in lookupTarget && lookupTarget.id !== undefined) {
      profile = await ProfileRepository.findById(lookupTarget.id);
    } else {
      return [];
    }
    if (!profile) {
      return [];
    }
    const userId = "user" in profile && profile.user ? profile.user.id : null;
    if (!userId) {
      return [];
    }
    prismaWhere = {
      userId,
      ...where,
    };
  } else {
    prismaWhere = {
      userId: lookupTarget.id,
      ...where,
    };
  }

  return prismaWhere;
};

export class MembershipRepository {
  constructor(private readonly prismaClient: PrismaClient = prisma) {}

  async hasMembership({ userId, teamId }: { userId: number; teamId: number }): Promise<boolean> {
    const membership = await this.prismaClient.membership.findFirst({
      where: {
        userId,
        teamId,
        accepted: true,
      },
      select: {
        id: true,
      },
    });
    return !!membership;
  }

  async hasAcceptedMembershipWithRoles({
    userId,
    teamId,
    roles,
  }: {
    userId: number;
    teamId: number;
    roles: MembershipRole[];
  }): Promise<boolean> {
    const membership = await this.prismaClient.membership.findFirst({
      where: {
        userId,
        teamId,
        accepted: true,
        role: { in: roles },
      },
      select: {
        id: true,
      },
    });
    return !!membership;
  }

  async listAcceptedTeamIdsWithRoles({
    userId,
    roles,
  }: {
    userId: number;
    roles: MembershipRole[];
  }): Promise<number[]> {
    const memberships = await this.prismaClient.membership.findMany({
      where: {
        userId,
        accepted: true,
        role: { in: roles },
      },
      select: {
        teamId: true,
      },
    });
    return memberships.map((membership) => membership.teamId);
  }

  async listAcceptedTeamMemberIds({ teamId }: { teamId: number }): Promise<number[]> {
    const memberships =
      (await this.prismaClient.membership.findMany({
        where: {
          teamId,
          accepted: true,
        },
        select: {
          userId: true,
        },
      })) || [];
    const teamMemberIds = memberships.map((membership) => membership.userId);
    return teamMemberIds;
  }

  static async create(data: IMembership) {
    return await prisma.membership.create({
      data: {
        createdAt: new Date(),
        ...data,
      },
    });
  }

  static async hasAnyAcceptedMembershipByUserId(userId: number) {
    const membership = await prisma.membership.findFirst({
      where: {
        accepted: true,
        userId,
        team: {
          slug: {
            not: null,
          },
        },
      },
      select: { id: true },
    });
    return Boolean(membership);
  }

  static async createMany(data: IMembership[]) {
    return await prisma.membership.createMany({
      data: data.map((item) => ({
        createdAt: new Date(),
        ...item,
      })),
    });
  }

  /**
   * TODO: Using a specific function for specific tasks so that we don't have to focus on TS magic at the moment. May be try to make it a a generic findAllByProfileId with various options.
   */
  static async findAllByUpIdIncludeTeamWithMembersAndEventTypes(
    { upId }: { upId: string },
    { where }: { where?: Prisma.MembershipWhereInput } = {}
  ) {
    const prismaWhere = await getWhereForfindAllByUpId(upId, where);
    if (Array.isArray(prismaWhere)) {
      return prismaWhere;
    }

    log.debug(
      "findAllByUpIdIncludeTeamWithMembersAndEventTypes",
      safeStringify({
        prismaWhere,
      })
    );

    return await prisma.membership.findMany({
      where: prismaWhere,
      include: {
        team: {
          include: {
            members: {
              select: membershipSelect,
            },
            parent: {
              select: teamParentSelect,
            },
            eventTypes: {
              select: {
                ...eventTypeSelect,
                hashedLink: true,
                users: { select: userSelect },
                children: {
                  include: {
                    users: { select: userSelect },
                  },
                },
                hosts: {
                  include: {
                    user: { select: userSelect },
                  },
                },
                team: {
                  select: {
                    id: true,
                    members: {
                      select: {
                        user: {
                          select: {
                            timeZone: true,
                          },
                        },
                      },
                      take: 1,
                    },
                  },
                },
              },
              // As required by getByViewHandler - Make it configurable
              orderBy: [
                {
                  position: "desc",
                },
                {
                  id: "asc",
                },
              ],
            },
          },
        },
      },
    });
  }

  static async findAllByUpIdIncludeMinimalEventTypes(
    { upId }: { upId: string },
    { where, skipEventTypes = false }: { where?: Prisma.MembershipWhereInput; skipEventTypes?: boolean } = {}
  ) {
    const prismaWhere = await getWhereForfindAllByUpId(upId, where);
    if (Array.isArray(prismaWhere)) {
      return prismaWhere;
    }

    log.debug(
      "findAllByUpIdIncludeMinimalEventTypes",
      safeStringify({
        prismaWhere,
      })
    );

    const select = {
      id: true,
      teamId: true,
      userId: true,
      accepted: true,
      role: true,
      team: {
        select: {
          ...teamParentSelect,
          isOrganization: true,
          parent: {
            select: teamParentSelect,
          },
          ...(!skipEventTypes
            ? {
                eventTypes: {
                  select: {
                    ...eventTypeSelect,
                    hashedLink: true,
                    children: { select: { id: true } },
                  },
                  orderBy: [
                    {
                      position: "desc",
                    },
                    {
                      id: "asc",
                    },
                  ],
                },
              }
            : {}),
        },
      },
    } satisfies Prisma.MembershipSelect;

    return await prisma.membership.findMany({
      where: prismaWhere,
      select,
    });
  }

  static async findAllByUpIdIncludeTeam(
    { upId }: { upId: string },
    { where }: { where?: Prisma.MembershipWhereInput } = {}
  ) {
    const prismaWhere = await getWhereForfindAllByUpId(upId, where);
    if (Array.isArray(prismaWhere)) {
      return prismaWhere;
    }

    return await prisma.membership.findMany({
      where: prismaWhere,
      include: {
        team: {
          include: {
            parent: {
              select: teamParentSelect,
            },
          },
        },
      },
    });
  }

  async findUniqueByUserIdAndTeamId({ userId, teamId }: { userId: number; teamId: number }) {
    return await this.prismaClient.membership.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
    });
  }

  /**
   * Get all team IDs that a user is a member of
   */
  static async findUserTeamIds({ userId }: { userId: number }) {
    const memberships = await prisma.membership.findMany({
      where: {
        userId,
        accepted: true,
      },
      select: {
        teamId: true,
      },
    });

    return memberships.map((membership) => membership.teamId);
  }

  async findAllByUserId({
    userId,
    filters,
  }: {
    userId: number;
    filters?: {
      accepted?: boolean;
      roles?: MembershipRole[];
    };
  }) {
    return this.prismaClient.membership.findMany({
      where: {
        userId,
        ...(filters?.accepted !== undefined && { accepted: filters.accepted }),
        ...(filters?.roles && { role: { in: filters.roles } }),
      },
      select: {
        teamId: true,
        role: true,
        team: {
          select: {
            id: true,
            parentId: true,
            isOrganization: true,
          },
        },
      },
    });
  }

  async searchMembers({
    teamId,
    search,
    cursor,
    limit,
    memberUserIds,
  }: {
    teamId: number;
    search?: string | null;
    cursor?: number | null;
    limit: number;
    memberUserIds?: number[] | null;
  }) {
    const where: Record<string, unknown> = {
      teamId,
      accepted: true,
    };

    const userFilter: Record<string, unknown> = {};

    if (search) {
      userFilter.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (memberUserIds !== undefined && memberUserIds !== null) {
      userFilter.id = cursor ? { in: memberUserIds, gt: cursor } : { in: memberUserIds };
    } else if (cursor) {
      userFilter.id = { gt: cursor };
    }

    if (Object.keys(userFilter).length > 0) {
      where.user = userFilter;
    }

    const memberships = await this.prismaClient.membership.findMany({
      where,
      take: limit + 1,
      orderBy: { user: { id: "asc" } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            username: true,
            defaultScheduleId: true,
          },
        },
        role: true,
      },
    });

    const hasMore = memberships.length > limit;
    const items = hasMore ? memberships.slice(0, limit) : memberships;
    const nextCursor = hasMore ? items[items.length - 1].user.id : undefined;

    return { memberships: items, nextCursor, hasMore };
  }

  async findAcceptedMembersWithUserProfile({ teamId }: { teamId: number }) {
    return this.prismaClient.membership.findMany({
      where: {
        teamId,
        accepted: true,
      },
      orderBy: { user: { id: "asc" } },
      select: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
          },
        },
      },
    });
  }

  /**
   * Checks if a user has any team membership (pending or accepted).
   * Used during onboarding to detect users who signed up via invite token,
   * where the membership is auto-accepted.
   */
  static async hasAnyTeamMembershipByUserId({ userId }: { userId: number }): Promise<boolean> {
    const membership = await prisma.membership.findFirst({
      where: {
        userId,
        team: {
          isOrganization: false,
        },
      },
      select: {
        id: true,
      },
    });
    return !!membership;
  }
}
