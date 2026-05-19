import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

/**
 * Minimal MIT permission helpers for the team router.
 *
 * Permission model: based purely on Membership.role.
 *   OWNER  > ADMIN > MEMBER
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

export async function requireMember(userId: number, teamId: number, minRole: MembershipRole = MembershipRole.MEMBER) {
  const m = await getMembership(userId, teamId);
  if (!m || !m.accepted) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this team" });
  }
  if (ROLE_RANK[m.role] < ROLE_RANK[minRole]) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Requires role ${minRole} or higher` });
  }
  return m;
}
