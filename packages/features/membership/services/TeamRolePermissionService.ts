import type { MembershipRepository } from "@calcom/features/membership/repositories/MembershipRepository";
import type { MembershipRole } from "@calcom/prisma/enums";

export type TeamPermissionCheckInput = {
  userId: number;
  teamId: number | null | undefined;
  permission: string;
  fallbackRoles: MembershipRole[];
};

export type TeamIdsWithPermissionInput = {
  userId: number;
  permission: string;
  fallbackRoles: MembershipRole[];
};

/**
 * Role-based replacement for upstream's PBAC PermissionCheckService, which is not
 * part of the MIT release and was stubbed to always return `true`. With teams
 * re-enabled in this fork, that stub let any authenticated user act on other
 * teams' resources. The fine-grained `permission` string has no backing store here,
 * so access is decided solely by an accepted membership holding one of `fallbackRoles`.
 */
export class TeamRolePermissionService {
  constructor(
    private readonly membershipRepository: Pick<
      MembershipRepository,
      "hasAcceptedMembershipWithRoles" | "listAcceptedTeamIdsWithRoles"
    >
  ) {}

  async checkPermission({ userId, teamId, fallbackRoles }: TeamPermissionCheckInput): Promise<boolean> {
    if (!teamId || fallbackRoles.length === 0) return false;
    return this.membershipRepository.hasAcceptedMembershipWithRoles({
      userId,
      teamId,
      roles: fallbackRoles,
    });
  }

  async getTeamIdsWithPermission({ userId, fallbackRoles }: TeamIdsWithPermissionInput): Promise<number[]> {
    if (fallbackRoles.length === 0) return [];
    return this.membershipRepository.listAcceptedTeamIdsWithRoles({
      userId,
      roles: fallbackRoles,
    });
  }
}
