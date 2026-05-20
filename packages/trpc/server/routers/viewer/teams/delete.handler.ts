import { prisma } from "@calcom/prisma";
import { MembershipRole } from "@calcom/prisma/enums";

import { requireMember } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number };
};

export async function deleteHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId, MembershipRole.OWNER, ctx.user);

  await prisma.team.delete({ where: { id: input.teamId } });
  return { ok: true as const };
}
