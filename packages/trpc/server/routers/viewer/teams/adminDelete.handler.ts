import { TRPCError } from "@trpc/server";

import { prisma } from "@calcom/prisma";

import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number };
};

/**
 * System-admin team deletion — bypasses the OWNER-membership requirement of
 * the regular `delete` mutation. Gated via `authedAdminProcedure` in the router.
 */
export async function adminDeleteHandler({ input }: Options) {
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { id: true, isOrganization: true },
  });
  if (!team) throw new TRPCError({ code: "NOT_FOUND" });
  if (team.isOrganization) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Refusing to delete an organization here" });
  }

  await prisma.team.delete({ where: { id: input.teamId } });
  return { ok: true as const };
}
