import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole, UserPermissionRole } from "@calcom/prisma/enums";

import type { TrpcSessionUser } from "../../../types";

/**
 * Minimal MIT permission helpers for the team router.
 *
 * Permission model: based purely on Membership.role.
 *   OWNER  > ADMIN > MEMBER
 *
 * System admins (UserPermissionRole.ADMIN) bypass membership requirements —
 * they can read and administer any team via the admin section.
 *
 * Used in lieu of the original PBAC (permission-based access control) layer
 * that Cal.diy removed during MIT relicensing.
 */

const ROLE_RANK: Record<MembershipRole, number> = {
  [MembershipRole.OWNER]: 3,
  [MembershipRole.ADMIN]: 2,
  [MembershipRole.MEMBER]: 1,
};

export async function getMembership(userId: number, teamId: number) {
  return prisma.membership.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
}

function isSystemAdmin(user: Pick<NonNullable<TrpcSessionUser>, "role"> | undefined): boolean {
  return user?.role === UserPermissionRole.ADMIN;
}

export async function requireMember(
  userId: number,
  teamId: number,
  minRole: MembershipRole = MembershipRole.MEMBER,
  user?: Pick<NonNullable<TrpcSessionUser>, "role">
) {
  if (user && isSystemAdmin(user)) {
    // System admin — bypass membership/role checks. Return a synthetic OWNER
    // membership so callers that read the returned row still behave sensibly.
    const fallback = (await getMembership(userId, teamId)) ?? {
      id: -1,
      userId,
      teamId,
      role: MembershipRole.OWNER,
      accepted: true,
      disableImpersonation: false,
      createdAt: new Date(),
      customRoleId: null as string | null,
    };
    return { ...fallback, role: MembershipRole.OWNER } as NonNullable<
      Awaited<ReturnType<typeof getMembership>>
    >;
  }

  const m = await getMembership(userId, teamId);
  if (!m || !m.accepted) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this team" });
  }
  if (ROLE_RANK[m.role] < ROLE_RANK[minRole]) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Requires role ${minRole} or higher` });
  }
  return m;
}
