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

/**
 * BUG-102-FORK (Sprint 4): the synthetic "system-admin pretends to be a team
 * member" row used to set `id: -1`, which collided with the real `Membership.id`
 * primary-key space. If a caller had ever fed it into a `prisma.membership.*`
 * call by `where: { id }`, it would silently target row 0 instead of erroring.
 * We now widen the return type so `id` may be `null`, forcing every consumer
 * that touches the id to deal with the synthetic case explicitly.
 */
type RealMembership = NonNullable<Awaited<ReturnType<typeof getMembership>>>;
export type RequireMemberResult =
  | RealMembership
  | (Omit<RealMembership, "id"> & { id: null; isSyntheticAdmin: true });

export async function requireMember(
  userId: number,
  teamId: number,
  minRole: MembershipRole = MembershipRole.MEMBER,
  user?: Pick<NonNullable<TrpcSessionUser>, "role">
): Promise<RequireMemberResult> {
  if (user && isSystemAdmin(user)) {
    // System admin — bypass membership/role checks. If the admin has a real
    // membership row, return it (mirrored to OWNER role). Otherwise return a
    // synthetic shape with `id: null` and `isSyntheticAdmin: true`.
    const real = await getMembership(userId, teamId);
    if (real) {
      return { ...real, role: MembershipRole.OWNER };
    }
    return {
      id: null,
      isSyntheticAdmin: true,
      userId,
      teamId,
      role: MembershipRole.OWNER,
      accepted: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      customRoleId: null,
    };
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
