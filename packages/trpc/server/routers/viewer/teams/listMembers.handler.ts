import { prisma } from "@calcom/prisma";

import { requireMember } from "./permissions";
import type { TrpcSessionUser } from "../../../types";

type Options = {
  ctx: { user: NonNullable<TrpcSessionUser> };
  input: { teamId: number };
};

export async function listMembersHandler({ ctx, input }: Options) {
  await requireMember(ctx.user.id, input.teamId);

  const members = await prisma.membership.findMany({
    where: { teamId: input.teamId },
    select: {
      id: true,
      role: true,
      accepted: true,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          avatarUrl: true,
          timeZone: true,
        },
      },
    },
    orderBy: [{ accepted: "desc" }, { user: { name: "asc" } }],
  });

  return members;
}
